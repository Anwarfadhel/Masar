/**
 * Smart Path — Data Service (Supabase Backend)
 * Drop-in replacement for the IndexedDB version.
 * All function signatures are identical — script.js requires zero changes.
 *
 * Library (images) stays in IndexedDB because base64 blobs are too large
 * to store as text rows in Supabase.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

/** Wait until supabaseClient is available (initialised by auth.js) */
async function getClient() {
    if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
    // Auth.js initialises it asynchronously — wait up to 5 s
    for (let i = 0; i < 50; i++) {
        await new Promise(r => setTimeout(r, 100));
        if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
    }
    throw new Error('Supabase client not available');
}

// ─── IndexedDB (kept for Library images only) ────────────────────────────────

const DB_NAME = 'SmartPathDB';
const DB_VERSION = 1;
let dbInstance = null;

async function initLocalDB() {
    if (dbInstance) return dbInstance;
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = e => reject(e.target.error);
        req.onsuccess = e => { dbInstance = e.target.result; resolve(dbInstance); };
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('library')) {
                const s = db.createObjectStore('library', { keyPath: 'id' });
                s.createIndex('user_id', 'user_id', { unique: false });
                s.createIndex('created_at', 'created_at', { unique: false });
            }
        };
    });
}

async function runLocalTx(storeName, mode, cb) {
    const db = await initLocalDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        let result;
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        result = cb(store, tx);
    });
}

// ─── initDB (no-op — kept for API compatibility) ─────────────────────────────
export async function initDB() {
    await initLocalDB(); // init IndexedDB for library images
    return true;
}

// ─── Conversations ────────────────────────────────────────────────────────────

export async function createLocalConversation(userId, title, sessionMeta = {}, trackType) {
    const client = await getClient();
    const row = {
        id: generateUUID(),
        user_id: userId,
        title: title || 'محادثة جديدة',
        session_metadata: sessionMeta,
        track_type: trackType,
        created_at: new Date().toISOString()
    };
    const { data, error } = await client.from('conversations').insert(row).select().single();
    if (error) throw error;
    return data;
}

export async function getLocalConversations(userId, trackType = null) {
    const client = await getClient();
    let query = client
        .from('conversations')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);

    // ← فلترة عزل المسار: school_student لا يرى محادثات post_school والعكس
    if (trackType) {
        query = query.eq('track_type', trackType);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function getLocalConversation(id) {
    const client = await getClient();
    const { data, error } = await client
        .from('conversations')
        .select('*')
        .eq('id', id)
        .single();
    if (error) throw error;
    return data;
}

export async function updateSessionMetadata(id, metadata) {
    const client = await getClient();
    const { data, error } = await client
        .from('conversations')
        .update({ session_metadata: metadata })
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function updateLocalConversationTitle(id, newTitle) {
    const client = await getClient();
    const { data, error } = await client
        .from('conversations')
        .update({ title: newTitle })
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function deleteLocalConversation(id) {
    const client = await getClient();
    // Cascade delete is handled by Supabase FK ON DELETE CASCADE on messages
    const { error } = await client.from('conversations').delete().eq('id', id);
    if (error) throw error;
}

// ─── Messages ────────────────────────────────────────────────────────────────

export async function saveLocalMessage(conversationId, role, content, type = 'text') {
    const client = await getClient();
    // Normalise: 'ai' or 'assistant' → 'assistant', everything else → 'user'
    const normRole = (role === 'ai' || role === 'assistant') ? 'assistant' : 'user';
    const row = {
        id: generateUUID(),
        conversation_id: conversationId,
        role: normRole,
        content: content,
        created_at: new Date().toISOString()
    };
    const { data, error } = await client.from('messages').insert(row).select().single();
    if (error) throw error;
    return data;
}

export async function getLocalMessages(conversationId) {
    const client = await getClient();
    const { data, error } = await client
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
}

// ─── Recommendations ─────────────────────────────────────────────────────────

export async function saveLocalRecommendation(userId, conversationId, recData) {
    const client = await getClient();
    const row = {
        id: generateUUID(),
        user_id: userId,
        conversation_id: conversationId,
        primary_major: recData.primary_major,
        compatibility_score: recData.compatibility_score,
        explanation: recData.explanation,
        roadmap: recData.roadmap || [],
        student_status_tags: recData.student_status_tags || [],
        admin_executive_summary: recData.admin_executive_summary || '',
        created_at: new Date().toISOString()
    };
    const { data, error } = await client.from('recommendations').insert(row).select().single();
    if (error) {
        console.error('❌ saveLocalRecommendation error:', error.message, error);
        throw error;
    }
    console.log('✅ Recommendation saved to Supabase:', data.id);
    return data;
}

export async function getLocalRecommendations(userId, trackType = null) {
    const client = await getClient();
    
    // If trackType is provided, filter by conversations in that track
    let convIds = null;
    if (trackType) {
        const { data: convs } = await client
            .from('conversations')
            .select('id')
            .eq('user_id', userId)
            .eq('track_type', trackType);
        if (convs) {
            convIds = convs.map(c => c.id);
        }
        
        // If there are no conversations for this track, return empty immediately
        if (convIds && convIds.length === 0) {
            return [];
        }
    }

    let query = client
        .from('recommendations')
        .select('*')
        .eq('user_id', userId);
        
    if (convIds) {
        query = query.in('conversation_id', convIds);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) {
        console.error('❌ getLocalRecommendations error:', error.message, error);
        throw error;
    }
    return data || [];
}

export async function getLocalRecommendationByConversationId(conversationId) {
    const client = await getClient();
    const { data, error } = await client
        .from('recommendations')
        .select('*')
        .eq('conversation_id', conversationId)
        .maybeSingle();
    if (error) {
        console.error('❌ getLocalRecommendationByConversationId error:', error.message, error);
        return null;
    }
    return data;
}

// ─── Library (IndexedDB — base64 images stay local) ──────────────────────────

export async function saveLocalLibraryItem(userId, imageUrl, title) {
    const now = new Date().toISOString();
    const item = { id: generateUUID(), user_id: userId, image_url: imageUrl, title: title || '', created_at: now };
    await runLocalTx('library', 'readwrite', store => { store.add(item); });
    return item;
}

export async function getLocalLibraryItems(userId) {
    const records = await runLocalTx('library', 'readonly', store =>
        new Promise((resolve, reject) => {
            const req = store.index('user_id').getAll(userId);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        })
    );
    return records.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function deleteLocalLibraryItem(id) {
    await runLocalTx('library', 'readwrite', store => { store.delete(id); });
}

// ─── Expose to window (required by script.js) ────────────────────────────────
window.dbService = {
    initDB,
    createLocalConversation,
    getLocalConversations,
    getLocalConversation,
    updateLocalConversationTitle,
    updateSessionMetadata,
    deleteLocalConversation,
    saveLocalMessage,
    getLocalMessages,
    saveLocalRecommendation,
    getLocalRecommendations,
    getLocalRecommendationByConversationId,
    saveLocalLibraryItem,
    getLocalLibraryItems,
    deleteLocalLibraryItem
};
