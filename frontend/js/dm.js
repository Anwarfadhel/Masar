/**
 * Smart Path — Direct Messaging Service (dm.js)
 * Shared between admin and student sides.
 * Requires: supabaseClient (initialized by auth.js)
 */

// ─── Helper: wait for supabaseClient ─────────────────────────────
async function getDMClient() {
    if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
    for (let i = 0; i < 50; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
    }
    throw new Error('Supabase client not ready');
}

const _profileCache = {};

async function dmGetProfile(userId) {
    if (_profileCache[userId]) return _profileCache[userId];
    const client = await getDMClient();
    const { data: profile } = await client.from('profiles').select('id, full_name, email, avatar_url').eq('id', userId).maybeSingle();
    if (profile) _profileCache[userId] = profile;
    return profile;
}

// ─── Get or create a thread between admin and student ────────────
async function dmGetOrCreateThread(studentId) {
    const client = await getDMClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Determine who is admin/student
    const myId = user.id;

    // Try to find existing thread (explicitly NOT a group)
    const { data: existing } = await client
        .from('dm_threads')
        .select('*')
        .eq('is_group', false)
        .or(`and(admin_id.eq.${myId},student_id.eq.${studentId}),and(admin_id.eq.${studentId},student_id.eq.${myId})`)
        .maybeSingle();

    if (existing) return existing;

    // Create new thread — caller must pass correct admin/student
    const { data: created, error } = await client
        .from('dm_threads')
        .insert({ admin_id: myId, student_id: studentId, is_group: false })
        .select()
        .single();

    if (error) throw error;
    return created;
}

// Admin creates thread with a specific student
async function dmAdminCreateThread(studentId) {
    const client = await getDMClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Check if thread exists (ensure it's not a group)
    const { data: existing } = await client
        .from('dm_threads')
        .select('*')
        .eq('admin_id', user.id)
        .eq('student_id', studentId)
        .eq('is_group', false)
        .maybeSingle();

    if (existing) return existing;

    const { data, error } = await client
        .from('dm_threads')
        .insert({ admin_id: user.id, student_id: studentId, is_group: false })
        .select()
        .single();

    if (error) throw error;
    return data;
}

// Student gets their thread with admin (any admin that opened the thread)
async function dmStudentGetThread() {
    const client = await getDMClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await client
        .from('dm_threads')
        .select('*')
        .eq('student_id', user.id)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return data; // null if no thread yet
}

// Student gets ALL their threads (Private 1-on-1 and Groups)
async function dmStudentGetThreads() {
    const client = await getDMClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // 1. Get 1-on-1 threads
    const { data: privateThreads, error: privErr } = await client
        .from('dm_threads')
        .select('*')
        .eq('student_id', user.id)
        .eq('is_group', false);

    if (privErr) throw privErr;

    // 2. Get group threads from participants
    const { data: participants, error: partErr } = await client
        .from('dm_thread_participants')
        .select('thread_id')
        .eq('user_id', user.id);

    if (partErr) throw partErr;

    let groupThreads = [];
    if (participants && participants.length > 0) {
        const groupIds = participants.map(p => p.thread_id);
        const { data: gThreads, error: gErr } = await client
            .from('dm_threads')
            .select('*')
            .in('id', groupIds)
            .eq('is_group', true);

        if (gErr) throw gErr;
        if (gThreads) groupThreads = gThreads;
    }

    const allThreads = [...(privateThreads || []), ...groupThreads];
    if (allThreads.length === 0) return [];

    // 3. Get admin profiles for private threads
    const adminIds = [...new Set(privateThreads?.filter(t => t.admin_id).map(t => t.admin_id))];
    let adminProfileMap = {};
    if (adminIds.length > 0) {
        const { data: adminProfiles } = await client
            .from('profiles')
            .select('id, full_name, email, avatar_url')
            .in('id', adminIds);
        (adminProfiles || []).forEach(p => { adminProfileMap[p.id] = p; });
    }

    // 4. Get unread counts for these threads
    const { data: unreadData } = await client
        .from('dm_messages')
        .select('thread_id')
        .in('thread_id', allThreads.map(t => t.id))
        .neq('sender_id', user.id)
        .eq('is_read', false);

    const unreadMap = {};
    (unreadData || []).forEach(m => {
        unreadMap[m.thread_id] = (unreadMap[m.thread_id] || 0) + 1;
    });

    // 5. Attach unread_count, admin profile and sort
    const result = allThreads.map(t => ({
        ...t,
        admin: t.is_group === true ? null : adminProfileMap[t.admin_id] || null,
        unread_count: unreadMap[t.id] || 0
    }));

    result.sort((a, b) => {
        const dA = a.last_message_at ? new Date(a.last_message_at) : new Date(0);
        const dB = b.last_message_at ? new Date(b.last_message_at) : new Date(0);
        return dB - dA;
    });

    return result;
}

// ─── Fetch all messages in a thread ─────────────────────────────
async function dmGetMessages(threadId) {
    const client = await getDMClient();
    const { data: messages, error } = await client
        .from('dm_messages')
        .select(`
            *,
            sender:sender_id (id, full_name, email, avatar_url)
        `)
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('dmGetMessages error:', error);
        throw error;
    }
    return messages || [];
}

// ─── Send a message ──────────────────────────────────────────────
async function dmSendMessage(threadId, content) {
    const client = await getDMClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await client
        .from('dm_messages')
        .insert({ thread_id: threadId, sender_id: user.id, content: content.trim() })
        .select()
        .single();

    if (error) throw error;

    // Update thread last_message_at to keep list sorted
    await client
        .from('dm_threads')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', threadId);

    return data;
}

// ─── Mark all messages in thread as read (for this user) ────────
async function dmMarkRead(threadId) {
    const client = await getDMClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;

    // Simplified: Mark ALL unread messages in this thread as read when the user views it.
    const { count, error } = await client
        .from('dm_messages')
        .update({ is_read: true }, { count: 'exact' })
        .eq('thread_id', threadId)
        .eq('is_read', false);

    if (error) {
        console.error('dmMarkRead error:', error);
    } else {
        console.log(`dmMarkRead: marked ${count} messages as read for thread ${threadId}`);
    }
    return count || 0;
}

// ─── Count unread messages for current user ──────────────────────
async function dmGetUnreadCount() {
    const client = await getDMClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return 0;

    // Get all thread IDs where user is a participant (Private 1-on-1 AND Groups)
    // 1. Private IDs
    const { data: privThreads } = await client
        .from('dm_threads')
        .select('id')
        .or(`admin_id.eq.${user.id},student_id.eq.${user.id}`)
        .eq('is_group', false);

    // 2. Group IDs
    const { data: partEntries } = await client
        .from('dm_thread_participants')
        .select('thread_id')
        .eq('user_id', user.id);

    const threadIds = [
        ...(privThreads || []).map(t => t.id),
        ...(partEntries || []).map(p => p.thread_id)
    ];

    if (threadIds.length === 0) return 0;

    const { count, error: countErr } = await client
        .from('dm_messages')
        .select('*', { count: 'exact', head: true })
        .in('thread_id', threadIds)
        .neq('sender_id', user.id)
        .eq('is_read', false);

    if (countErr) console.error('Unread count error:', countErr);
    return count || 0;
}

// ─── Admin: get all threads (1-on-1 and Groups) ───────────
async function dmAdminGetAllThreads() {
    const client = await getDMClient();

    // 1. Get current user
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // 2. Get IDs of threads where user is an explicit participant
    const { data: participants } = await client
        .from('dm_thread_participants')
        .select('thread_id')
        .eq('user_id', user.id);

    const participantThreadIds = (participants || []).map(p => p.thread_id);

    // 3. Construct the OR filter for (Direct Admin OR Participant in Group/Private)
    let orFilter = `admin_id.eq.${user.id}`;
    if (participantThreadIds.length > 0) {
        orFilter += `,id.in.(${participantThreadIds.join(',')})`;
    }

    // 4. Get threads with explicit filtering
    const { data: threads, error } = await client
        .from('dm_threads')
        .select('*')
        .or(orFilter)
        .order('last_message_at', { ascending: false, nullsFirst: false });

    if (error) throw error;
    if (!threads || !threads.length) return [];

    // 2. Fetch profiles for 1-on-1 students
    const studentIds = [...new Set(threads.filter(t => t.is_group !== true && t.student_id).map(t => t.student_id))];

    let profileMap = {};
    if (studentIds.length > 0) {
        const { data: profiles, error: profErr } = await client
            .from('profiles')
            .select('id, full_name, email, avatar_url')
            .in('id', studentIds);

        if (profErr) {
            console.error('Error fetching student profiles:', profErr);
        } else {
            (profiles || []).forEach(p => { profileMap[p.id] = p; });
        }
    }

    // 3. Get unread counts for all threads (for current user)
    let unreadMap = {};
    if (user) {
        const { data: unreadData } = await client
            .from('dm_messages')
            .select('thread_id')
            .in('thread_id', threads.map(t => t.id))
            .neq('sender_id', user.id)
            .eq('is_read', false);

        (unreadData || []).forEach(m => {
            unreadMap[m.thread_id] = (unreadMap[m.thread_id] || 0) + 1;
        });
    }

    // 4. Attach profile and unread_count to each thread
    return threads.map(t => ({
        ...t,
        student: t.is_group === true ? null : profileMap[t.student_id] || null,
        unread_count: unreadMap[t.id] || 0
    }));
}

// ─── Admin: Create Group Thread ─────────────────────────────
async function dmAdminCreateGroup(groupName, participantIds, groupAvatarUrl) {
    const client = await getDMClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // 1. Create thread
    const { data: thread, error: threadErr } = await client
        .from('dm_threads')
        .insert({
            admin_id: user.id,
            is_group: true,
            group_name: groupName,
            group_avatar_url: groupAvatarUrl
        })
        .select()
        .single();

    if (threadErr) throw threadErr;

    // 2. Add participants (including admin)
    const participants = [user.id, ...participantIds].map(pid => ({
        thread_id: thread.id,
        user_id: pid
    }));

    const { error: partErr } = await client
        .from('dm_thread_participants')
        .insert(participants);

    if (partErr) throw partErr;

    return thread;
}


// ─── Admin: Add Participant to Thread ─────────────────────────
async function dmAddParticipant(threadId, userId) {
    const client = await getDMClient();
    const { error } = await client
        .from('dm_thread_participants')
        .insert({ thread_id: threadId, user_id: userId });

    if (error) throw error;

    // Update thread to trigger updates for others
    await client
        .from('dm_threads')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', threadId);
}

// ─── Admin: Remove Participant from Thread ────────────────────
async function dmRemoveParticipant(threadId, userId) {
    const client = await getDMClient();
    const { error } = await client
        .from('dm_thread_participants')
        .delete()
        .eq('thread_id', threadId)
        .eq('user_id', userId);

    if (error) throw error;

    // Update thread to trigger updates for others
    await client
        .from('dm_threads')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', threadId);
}

// ─── Message Actions (Edit, Delete, Upload) ─────────────────
async function dmDeleteMessage(messageId) {
    const client = await getDMClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Use RPC or a clever array update to append user.id to deleted_by_ids
    // Note: In Supabase/PostgREST, we can append to an array using || or array_append
    // But since we are using JS client, we'll use a raw update if possible or fetch + update
    // Best way in v2 client is to use update with array concat if supported, 
    // but safer is to use a snippet that handles the array update on the server side if we had an RPC.
    // Lacking PCR, we can use the 'append' syntax if the client supports it, or fetch-then-update.
    
    const { data: current, error: readErr } = await client.from('dm_messages').select('deleted_by_ids').eq('id', messageId).single();
    if (readErr) throw new Error('فشل قراءة الرسالة: ' + readErr.message);
    
    // Type checking since Supabase sometimes returns a string '{}' for empty PG arrays
    let arr = current?.deleted_by_ids;
    if (typeof arr === 'string' && arr === '{}') arr = [];
    if (!Array.isArray(arr)) arr = [];
    
    if (!arr.includes(user.id)) {
        arr.push(user.id);
        const { data: updated, error } = await client
            .from('dm_messages')
            .update({ deleted_by_ids: arr })
            .eq('id', messageId)
            .select('id');
            
        if (error) throw new Error(error.message);
        if (!updated || updated.length === 0) {
            throw new Error('لا تملك صلاحية الحذف أو أن الرسالة غير موجودة (RLS blocked).');
        }
    }
}

async function dmEditMessage(messageId, content) {
    const client = await getDMClient();
    const { error } = await client.from('dm_messages').update({ content, is_edited: true }).eq('id', messageId);
    if (error) throw error;
}

async function dmClearThreadMessages(threadId) {
    const client = await getDMClient();
    const { error } = await client.from('dm_messages').delete().eq('thread_id', threadId);
    if (error) throw error;
}

async function dmGetThreadParticipants(threadId) {
    const client = await getDMClient();
    // 1. Get participant user IDs
    const { data: participants, error } = await client
        .from('dm_thread_participants')
        .select('user_id')
        .eq('thread_id', threadId);

    if (error) throw error;
    if (!participants || participants.length === 0) return [];

    // 2. Fetch profiles
    const userIds = participants.map(p => p.user_id);
    const { data: profiles, error: profErr } = await client
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .in('id', userIds);

    if (profErr) throw profErr;
    return profiles || [];
}

async function dmUpdateThreadInfo(threadId, updates) {
    const client = await getDMClient();
    const { data, error } = await client
        .from('dm_threads')
        .update(updates)
        .eq('id', threadId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

async function dmUploadFile(file) {
    const client = await getDMClient();
    const ext = file.name.split('.').pop() || 'tmp';
    const path = `dm_attachments/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;

    const { data, error } = await client.storage
        .from('chat-attachments')
        .upload(path, file);

    if (error) {
        console.error('Upload Error:', error);
        return null;
    }

    const { data: { publicUrl } } = client.storage
        .from('chat-attachments')
        .getPublicUrl(path);

    return publicUrl;
}


// ─── Subscribe to new messages in a thread (Realtime) ───────────
let _dmChannel = null;

function dmSubscribeToThread(threadId, onMessageEvent) {
    // Unsubscribe from previous channel
    if (_dmChannel) {
        supabaseClient.removeChannel(_dmChannel);
        _dmChannel = null;
    }

    console.log(`DEBUG: Subscribing to thread ${threadId}`);
    _dmChannel = supabaseClient
        .channel(`dm_thread_${threadId}`)
        .on('postgres_changes', {
            event: '*', 
            schema: 'public',
            table: 'dm_messages',
            filter: `thread_id=eq.${threadId}`
        }, (payload) => {
            console.log(`DEBUG: Realtime event received for thread ${threadId}:`, payload.eventType, payload.new?.id);
            onMessageEvent(payload);
        })
        .on('system', { event: '*' }, (payload) => {
             console.log(`DEBUG: System event for thread channel ${threadId}:`, payload);
        })
        .subscribe((status) => {
            console.log(`DEBUG: Subscription status for thread ${threadId}:`, status);
        });

    return _dmChannel;
}

let _dmThreadListChannel = null;
function dmSubscribeToThreadList(onUpdate) {
    if (_dmThreadListChannel) {
        supabaseClient.removeChannel(_dmThreadListChannel);
    }
    _dmThreadListChannel = supabaseClient
        .channel('dm_thread_list_updates')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'dm_threads'
        }, (payload) => {
            onUpdate(payload);
        })
        .subscribe();
}

let _dmParticipantChannel = null;
function dmSubscribeToParticipants(userId, onUpdate) {
    if (_dmParticipantChannel) {
        supabaseClient.removeChannel(_dmParticipantChannel);
    }
    _dmParticipantChannel = supabaseClient
        .channel('dm_participant_updates')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'dm_thread_participants',
            filter: `user_id=eq.${userId}`
        }, (payload) => {
            onUpdate(payload);
        })
        .subscribe();
}

let _dmGlobalChannel = null;
function dmSubscribeToAllMessages(onEvent) {
    if (_dmGlobalChannel) return;
    console.log('DEBUG: Subscribing to ALL messages');
    const channel = supabaseClient
        .channel('dm_global_updates')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'dm_messages'
        }, (payload) => {
            console.log('DEBUG: Global message event received:', payload.new.id);
            onEvent(payload);
        })
        .subscribe((status) => {
            console.log('DEBUG: Global subscription status:', status);
        });
}

function dmUnsubscribe() {
    if (_dmChannel) {
        supabaseClient.removeChannel(_dmChannel);
        _dmChannel = null;
    }
}

// Expose globally
window.dmService = {
    dmAdminCreateThread,
    dmStudentGetThread,
    dmStudentGetThreads,
    dmGetMessages,
    dmSendMessage,
    dmMarkRead,
    dmGetUnreadCount,
    dmAdminGetAllThreads,
    dmSubscribeToThread,
    dmUnsubscribe,
    dmAdminCreateGroup,
    dmDeleteMessage,
    dmEditMessage,
    dmClearThreadMessages,
    dmUploadFile,
    dmGetThreadParticipants,
    dmUpdateThreadInfo,
    dmSubscribeToAllMessages,
    dmAddParticipant,
    dmRemoveParticipant,
    dmSubscribeToThreadList,
    dmSubscribeToParticipants,
    dmGetProfile
};
