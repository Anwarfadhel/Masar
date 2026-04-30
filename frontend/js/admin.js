/* ============================================================
   Smart Path AI — Admin Dashboard Logic
   Requires: Supabase JS v2, auth.js (provides supabaseClient,
             getUserRole, initSupabase)
   ============================================================ */

// ─── Guard: enforce admin role before anything renders ────────
async function requireAdmin() {
    if (!supabaseClient) await initSupabase();

    if (!supabaseClient) {
        window.location.href = '/auth/login.html';
        return false;
    }

    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
        window.location.href = '/auth/login.html';
        return false;
    }

    const role = await getUserRole(supabaseClient, session.user.id);

    if (role !== 'admin') {
        window.location.href = '/dashboard.html';
        return false;
    }

    return { session, role };
}

// ─── Utility: format date ─────────────────────────────────────
function fmtDate(iso) {
    if (!iso) return '—';
    try {
        return new Intl.DateTimeFormat('ar-EG', {
            year: 'numeric', month: 'short', day: 'numeric'
        }).format(new Date(iso));
    } catch { return iso.split('T')[0]; }
}

// ─── Render Stats Cards ────────────────────────────────────────
function renderStats(userCount, convCount, recCount) {
    const animate = (el, target) => {
        let current = 0;
        const step = Math.ceil(target / 40) || 1;
        const timer = setInterval(() => {
            current = Math.min(current + step, target);
            el.textContent = current.toLocaleString('ar-EG');
            if (current >= target) clearInterval(timer);
        }, 25);
        // Handle target=0 immediately
        if (target === 0) { el.textContent = '0'; clearInterval(timer); }
    };

    const uEl = document.getElementById('stat-users');
    const cEl = document.getElementById('stat-convs');
    const rEl = document.getElementById('stat-recs');

    if (uEl) animate(uEl, userCount);
    if (cEl) animate(cEl, convCount);
    if (rEl) animate(rEl, recCount);
}

// ─── Render Users Table ───────────────────────────────────────
function renderUsersTable(profiles) {
    const tbody = document.getElementById('users-tbody');
    const count = document.getElementById('users-count');
    if (!tbody) return;

    if (count) count.textContent = profiles.length;

    if (!profiles.length) {
        tbody.innerHTML = `
            <tr><td colspan="4">
                <div class="admin-empty-state">
                    <i class="fas fa-users-slash"></i>
                    <p>لا يوجد مستخدمون</p>
                </div>
            </td></tr>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    profiles.forEach(p => {
        const name = p.full_name || p.email?.split('@')[0] || 'مستخدم';
        const avatarUrl = p.avatar_url ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=7c6fe0&color=fff&size=64`;
        const role = p.role || 'user';
        const roleClass = role === 'admin' ? 'admin' : 'user';
        const roleIcon = role === 'admin' ? 'fa-shield-halved' : 'fa-user';
        const roleLabel = role === 'admin' ? 'مشرف' : 'مستخدم';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="البريد الإلكتروني">
                <div class="user-cell">
                    <img class="user-avatar-sm" src="${avatarUrl}" alt="${name}" loading="lazy">
                    <span class="user-email-text" title="${p.email || ''}">${p.email || '—'}</span>
                </div>
            </td>
            <td data-label="الدور">
                <span class="role-badge ${roleClass}">
                    <i class="fas ${roleIcon}" style="font-size:10px"></i>
                    ${roleLabel}
                </span>
            </td>
            <td data-label="تاريخ الانضمام"><span class="date-cell">${fmtDate(p.created_at)}</span></td>
            <td data-label="مراسلة">
                <button class="btn-chat-user" onclick="startChatWithUser('${p.id}')" title="مراسلة">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </td>
        `;
        fragment.appendChild(tr);
    });

    tbody.innerHTML = '';
    tbody.appendChild(fragment);
}

// ─── Start Chat with User ─────────────────────────────────────────
async function startChatWithUser(studentId) {
    try {
        if (!window.dmService) throw new Error('خدمة المراسلة غير جاهزة');
        
        // 1. Get or create thread
        const thread = await window.dmService.dmAdminCreateThread(studentId);
        if (!thread) throw new Error('فشل في إنشاء المحادثة');

        // 2. Switch to DM section
        openDMSection();

        // 3. Focus the specific thread
        // We might need a tiny delay to ensure the section is DOM-ready
        setTimeout(() => {
            openDMThread(thread.id, studentId, null);
        }, 100);

    } catch (e) {
        console.error('startChatWithUser error:', e);
        showError('فشل في بدء المحادثة: ' + e.message);
    }
}

// ─── Recommendation cache (safe alternative to passing data through HTML attrs) ──
// Arabic text can contain apostrophes that break onclick='...' attributes.
const _adminRecCache = [];

function escapeHtmlAdmin(str) {
    return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Render Recommendations Table ───────────────────────────────
function renderRecsTable(recs, profileMap) {
    const tbody = document.getElementById('recs-tbody');
    const count = document.getElementById('recs-count');
    if (!tbody) return;
    if (count) count.textContent = recs.length;

    if (!recs.length) {
        tbody.innerHTML = `
            <tr><td colspan="5">
                <div class="admin-empty-state">
                    <i class="fas fa-graduation-cap"></i>
                    <p>لا توجد توصيات بعد</p>
                </div>
            </td></tr>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    recs.forEach((rec, idx) => {
        const profile = profileMap[rec.user_id] || {};
        const name = profile.full_name || profile.email?.split('@')[0] || '—';
        const email = profile.email || '—';
        const major = rec.primary_major || '—';
        const score = rec.compatibility_score ?? '—';
        const scoreClass = score >= 80 ? 'high' : score >= 60 ? 'mid' : 'low';
        const avatarUrl = profile.avatar_url ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=7c6fe0&color=fff&size=64`;

        let parsedExec = rec.admin_executive_summary || '';
        try {
            if (parsedExec && parsedExec.trim().startsWith('{')) {
                const packed = JSON.parse(parsedExec);
                // The supervisor only needs to see the private action plan here
                parsedExec = packed.admin_note || ''; 
            }
        } catch { /* fallback to string */ }

        // Store full rec data by index — only idx goes into HTML
        _adminRecCache[idx] = {
            name, email, major,
            score: rec.compatibility_score,
            explanation: rec.explanation || '',
            roadmap: rec.roadmap || [],
            statusTags: rec.student_status_tags || [],
            execSummary: parsedExec
        };

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td data-label="الطالب">
                <div class="user-cell">
                    <img class="user-avatar-sm" src="${avatarUrl}" alt="" loading="lazy">
                    <div>
                        <div style="font-weight:600;font-size:13px">${escapeHtmlAdmin(name)}</div>
                        <div class="user-email-text" style="font-size:11px;opacity:.7">${escapeHtmlAdmin(email)}</div>
                    </div>
                </div>
            </td>
            <td data-label="التخصص المقترح"><span style="font-weight:600">${escapeHtmlAdmin(major)}</span></td>
            <td data-label="نسبة التوافق"><span class="score-badge score-${scoreClass}">${score}%</span></td>
            <td data-label="التاريخ"><span class="date-cell">${fmtDate(rec.created_at)}</span></td>
            <td data-label="التفاصيل">
                <button class="btn-view-rec-detail" onclick="openRecDetail(${idx})">
                    <i class="fas fa-eye"></i> عرض
                </button>
            </td>
        `;
        fragment.appendChild(tr);
    });

    tbody.innerHTML = '';
    tbody.appendChild(fragment);
}

// ─── Recommendation Detail Modal ─────────────────────────────────
function openRecDetail(idx) {
    const rec = _adminRecCache[idx];
    if (!rec) return;

    document.getElementById('rec-detail-student').textContent = rec.name;
    document.getElementById('rec-detail-email').textContent = rec.email;
    document.getElementById('rec-detail-major').textContent = rec.major;
    document.getElementById('rec-detail-score').textContent = (rec.score ?? '—') + '%';
    document.getElementById('rec-detail-explanation').textContent = rec.explanation || '—';

    const roadmapEl = document.getElementById('rec-detail-roadmap');
    const roadmapWrapper = document.getElementById('rec-detail-roadmap-wrapper');
    if (Array.isArray(rec.roadmap) && rec.roadmap.length) {
        roadmapEl.innerHTML = rec.roadmap.map(step => `<li>${escapeHtmlAdmin(step)}</li>`).join('');
        roadmapWrapper.style.display = 'flex';
    } else {
        roadmapWrapper.style.display = 'none';
    }

    // Render Student Status Tags
    const statusTagsEl = document.getElementById('rec-detail-status-tags');
    const statusWrapper = document.getElementById('rec-detail-status-wrapper');
    if (Array.isArray(rec.statusTags) && rec.statusTags.length) {
        statusTagsEl.innerHTML = rec.statusTags.map(tag => {
            const safeTag = escapeHtmlAdmin(tag);
            // extract the first word logic or fallback to exact string for CSS classes
            const cssClassMatch = safeTag.split(' ')[0] || safeTag;
            return `<span class="student-status-tag ${cssClassMatch}">
                        <i class="fas fa-tag" style="font-size:10px;opacity:0.7"></i> ${safeTag}
                    </span>`;
        }).join('');
    } else {
        statusTagsEl.innerHTML = `<span class="student-status-tag" style="background:var(--glass-2);color:var(--text-2)"><i class="fas fa-tag" style="font-size:10px;opacity:0.7"></i> غير محدد</span>`;
    }
    statusWrapper.style.display = 'flex';

    // Render Admin Executive Summary
    const execSummaryEl = document.getElementById('rec-detail-exec');
    const execWrapper = document.getElementById('rec-detail-exec-wrapper');
    if (rec.execSummary) {
        execSummaryEl.textContent = rec.execSummary;
    } else {
        execSummaryEl.textContent = 'لا توجد ملاحظات متاحة للطالب حتى الآن.';
    }
    execWrapper.style.display = 'flex';

    const overlay = document.getElementById('rec-detail-overlay');
    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('open'));

    // ── Click-outside to close ──
    const _closeOnOutside = (e) => {
        if (e.target === overlay) {
            closeRecDetail();
            overlay.removeEventListener('click', _closeOnOutside);
        }
    };
    overlay.addEventListener('click', _closeOnOutside);
}

function closeRecDetail() {
    const overlay = document.getElementById('rec-detail-overlay');
    overlay.classList.remove('open');
    setTimeout(() => overlay.style.display = 'none', 250);
}
// ─── Render Conversations Table ───────────────────────────────
function renderConvsTable(conversations) {
    const tbody = document.getElementById('convs-tbody');
    const count = document.getElementById('convs-count');
    if (!tbody) return;

    if (count) count.textContent = conversations.length;

    if (!conversations.length) {
        tbody.innerHTML = `
            <tr><td colspan="3">
                <div class="admin-empty-state">
                    <i class="fas fa-comment-slash"></i>
                    <p>لا توجد محادثات</p>
                </div>
            </td></tr>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    conversations.forEach(c => {
        const title = c.title || 'محادثة بلا عنوان';
        const userId = c.user_id ? c.user_id.substring(0, 8) + '…' : '—';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="conv-title" title="${title}">${title}</span></td>
            <td style="font-size:12px;color:var(--text-3);font-family:monospace">${userId}</td>
            <td><span class="date-cell">${fmtDate(c.created_at)}</span></td>
        `;
        fragment.appendChild(tr);
    });

    tbody.innerHTML = '';
    tbody.appendChild(fragment);
}

// ─── Show / hide skeleton areas ───────────────────────────────
function showSkeletons() {
    document.querySelectorAll('.skeleton-area').forEach(el => el.style.display = '');
    document.querySelectorAll('.data-area').forEach(el => el.style.display = 'none');
}

function hideSkeletons() {
    document.querySelectorAll('.skeleton-area').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.data-area').forEach(el => el.style.display = '');
}

// ─── Show error banner ────────────────────────────────────────
function showError(msg) {
    const el = document.getElementById('admin-error');
    if (!el) return;
    // Use innerHTML to keep the icon, only update the <span>
    el.innerHTML = `<i class="fas fa-triangle-exclamation"></i><span>${msg}</span>`;
    el.style.display = 'flex';
}

// ─── Sidebar toggle ───────────────────────────────────────────
function toggleAdminSidebar() {
    const sidebar = document.getElementById('admin-sidebar');
    const overlay = document.getElementById('admin-sidebar-overlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('open');
}

function closeAdminSidebar() {
    const sidebar = document.getElementById('admin-sidebar');
    const overlay = document.getElementById('admin-sidebar-overlay');
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
}

// ─── Logout (see handleAdminLogout defined below for the full implementation) ─

// ─── Populate user info in topbar and sidebar menu ─────────────
function populateUserInfo(session) {
    const meta = session.user.user_metadata || {};
    const name = meta.full_name || meta.name || session.user.email?.split('@')[0] || 'Admin';
    const email = session.user.email || '';
    const avatarUrl = meta.avatar_url ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=7c6fe0&color=fff&size=72`;

    // Topbar elements
    const nameEl = document.getElementById('admin-user-name');
    const emailEl = document.getElementById('admin-user-email');
    const imgEl = document.getElementById('admin-user-avatar');

    if (nameEl) nameEl.textContent = name;
    if (emailEl) emailEl.textContent = email;
    if (imgEl) imgEl.src = avatarUrl;

    // Sidebar menu elements
    const sideNameEl = document.getElementById('sidebar-menu-name');
    const sideEmailEl = document.getElementById('sidebar-menu-email');
    const sideImgEl = document.getElementById('sidebar-menu-avatar');

    if (sideNameEl) sideNameEl.textContent = name;
    if (sideEmailEl) sideEmailEl.textContent = email;
    if (sideImgEl) sideImgEl.src = avatarUrl;
}

// ─── Sidebar User Menu Toggle ─────────────────────────────────
function toggleSidebarUserMenu(e) {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('sidebar-user-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('open');
    }
}

// Global click to close dropdowns
document.addEventListener('click', () => {
    document.getElementById('sidebar-user-dropdown')?.classList.remove('open');
    document.getElementById('admin-user-dropdown')?.classList.remove('open');
});

// ─── Main Init ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const pageLoader = document.getElementById('admin-page-loader');

    // 1. Guard check
    const authResult = await requireAdmin();
    if (!authResult) return; // redirected away

    const { session } = authResult;

    // 2. Populate user info
    populateUserInfo(session);

    // 3. Hide page loader
    if (pageLoader) {
        pageLoader.style.opacity = '0';
        setTimeout(() => pageLoader.style.display = 'none', 300);
    }

    // 4. Show skeleton loaders for data areas
    showSkeletons();

    // 5. Fetch all data in parallel
    try {
        const myId = session.user.id;
        
        // 5a. Fetch schools owned by admin
        const { data: mySchools, error: sErr } = await supabaseClient.from('schools').select('id, name').eq('admin_id', myId);
        if (sErr) console.warn('Warning: Could not fetch schools.', sErr.message);
        
        const adminSchoolCard = document.getElementById('admin-school-card');
        const premiumSchoolModal = document.getElementById('premium-school-modal');
        
        if (mySchools && mySchools.length > 0) {
            if (adminSchoolCard) {
                adminSchoolCard.style.display = 'block';
                const primarySchool = mySchools[0];
                const sNameEl = document.getElementById('my-school-name');
                if(sNameEl) sNameEl.textContent = primarySchool.name || 'بدون اسم';
                const sIdEl = document.getElementById('my-school-id');
                if(sIdEl) sIdEl.textContent = primarySchool.id;
            }
        } else {
            // First time login — show smart ID creation modal
            if (premiumSchoolModal) {
                premiumSchoolModal.style.display = 'flex';
                // Init the dependent-dropdown system after the modal is visible
                requestAnimationFrame(() => initSmartSchoolModal());
            }
        }
        
        const mySchoolIds = mySchools ? mySchools.map(s => s.id) : [];

        // 5b. Fetch all non-post_study users that belong to this admin's schools
        let profiles = [];
        let profileMap = {};
        
        if (mySchoolIds.length > 0) {
            const { data: fetchProfiles, error: pErr } = await supabaseClient
                .from('profiles')
                .select('id, email, full_name, role, user_type, created_at, avatar_url, school_id')
                .in('school_id', mySchoolIds)
                .order('created_at', { ascending: false });

            if (pErr) throw new Error('خطأ عند تحميل المستخدمين: ' + pErr.message);
            
            // Client-side filtering to bypass Postgrest bugs or caching
            profiles = (fetchProfiles || []).filter(p => 
                p.user_type !== 'post_study' && 
                p.role !== 'post_study' &&
                p.role !== 'admin'
            );
            profiles.forEach(p => profileMap[p.id] = p);
        }

        const profileIds = (profiles || []).map(p => p.id);

        // 5c. Fetch recommendations and total conversation count for these users only
        let recs = [];
        let convCount = 0;

        if (profileIds.length > 0) {
            const [recsRes, convsRes] = await Promise.all([
                supabaseClient.from('recommendations')
                    .select('user_id, primary_major, compatibility_score, explanation, roadmap, student_status_tags, admin_executive_summary, created_at')
                    .in('user_id', profileIds)
                    .order('created_at', { ascending: false })
                    .limit(100),
                supabaseClient.from('conversations').select('id', { count: 'exact', head: true }).in('user_id', profileIds)
            ]);

            if (recsRes.error) console.warn('تحذير — جلب التوصيات:', recsRes.error.message);
            recs = recsRes.data || [];
            convCount = convsRes.count ?? 0;
        }

        // 6. Render
        hideSkeletons();
        renderStats(profiles.length, convCount, recs.length);
        renderUsersTable(profiles);
        renderRecsTable(recs, profileMap);

        // 7. Realtime Updates for New Joiners
        if (supabaseClient.channel) {
            supabaseClient
                .channel('admin_dashboard_profiles')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, async (payload) => {
                    const profileData = payload.new;
                    if (!profileData) return;
                    
                    if (mySchoolIds.includes(profileData.school_id) && 
                        profileData.role !== 'admin' && 
                        profileData.user_type !== 'post_study' && 
                        profileData.role !== 'post_study') {
                        
                        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                            const name = profileData.full_name || 'طالب جديد';
                            if (window.dmShowToast) window.dmShowToast(`انضم ${name} إلى مدرستك للتو!`);
                            
                            // Dynamically refresh the profiles list without full page reload
                            try {
                                const { data: freshProfiles } = await supabaseClient
                                    .from('profiles')
                                    .select('*')
                                    .order('created_at', { ascending: false });
                                    
                                const latestProfiles = (freshProfiles || []).filter(p => 
                                    mySchoolIds.includes(p.school_id) && 
                                    p.user_type !== 'post_study' && 
                                    p.role !== 'post_study' &&
                                    p.role !== 'admin'
                                );
                                
                                renderUsersTable(latestProfiles);
                                const uEl = document.getElementById('stat-users');
                                if (uEl) uEl.textContent = latestProfiles.length;
                            } catch(e) { console.warn('Could not refresh realtime users', e); }
                        }
                    }
                })
                .subscribe();
        }

    } catch (err) {
        console.error('❌ Admin data fetch error:', err);
        hideSkeletons();
        showError('خطأ في تحميل البيانات: ' + (err.message || 'تحقق من DevTools Console'));
    }

    // 7. Avatar dropdown toggle
    const avatarBtn = document.getElementById('admin-avatar-btn');
    const dropdown = document.getElementById('admin-user-dropdown');
    if (avatarBtn && dropdown) {
        avatarBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('open');
        });
    }
});

/**
 * Handle Admin Logout — closes dropdown, signs out via auth.js logout(),
 * which also clears localStorage and redirects to /auth/login.html.
 */
async function handleAdminLogout() {
    const dropdown = document.getElementById('admin-user-dropdown');
    if (dropdown) dropdown.classList.remove('open');
    const sidebarDropdown = document.getElementById('sidebar-user-dropdown');
    if (sidebarDropdown) sidebarDropdown.classList.remove('open');
    if (typeof logout === 'function') {
        await logout(); // delegates to auth.js which handles signOut + localStorage cleanup
    } else {
        // Fallback if auth.js not loaded
        if (supabaseClient) await supabaseClient.auth.signOut();
        localStorage.removeItem('sp_user_meta');
        localStorage.removeItem('sp_user_email');
        localStorage.removeItem('sp_user_role');
        window.location.href = '/auth/login.html';
    }
}

// ══════════════════════════════════════════════════════════════════
//  ADMIN DM SECTION
// ══════════════════════════════════════════════════════════════════

let _dmActive = false;
window._activeThreadId = null;
window._adminId = null;

// ─── Open / Close DM panel ────────────────────────────────────────
function openDMSection() {
    const panel = document.getElementById('dm-admin-panel');
    if (!panel) return;
    panel.classList.add('open');
    _dmActive = true;

    // Hide bottom nav on mobile
    document.querySelector('.admin-sidebar')?.classList.add('hide-bottom-nav');

    document.querySelectorAll('.admin-nav-item').forEach(b => b.classList.remove('active'));
    document.getElementById('nav-dm')?.classList.add('active');

    loadDMThreads();
    closeAdminSidebar();
}

// Initialize Global Unread Logic for Admin
initSupabase().then(async () => {
    refreshAdminUnreadBadge();
    const client = await initSupabase();
    if (!client) return;
    const { data: { session } } = await client.auth.getSession();
    const myId = session?.user?.id;
    window._adminId = myId; // Ensure global adminId is set

    if (window.dmService) {
        window.dmService.dmSubscribeToAllMessages(async (payload) => {
            if (payload.eventType === 'INSERT' && myId) {
                if (payload.new.sender_id !== myId) {
                    refreshAdminUnreadBadge();
                    if (window.dmShowToast) window.dmShowToast('لديك رسالة جديدة');
                    if (_dmActive) {
                        loadDMThreads(); // Refresh list to show per-thread badges
                    }
                }
            }
        });

        // Real-time Thread List Updates for Admin
        window.dmService.dmSubscribeToThreadList(() => {
            if (_dmActive) {
                console.log('Admin thread list updated, refreshing...');
                loadDMThreads();
            }
        });
    }
});

function closeDMSection() {
    document.getElementById('dm-admin-panel')?.classList.remove('open');
    _dmActive = false;
    window._activeThreadId = null;
    window.dmService?.dmUnsubscribe();

    // Show bottom nav again
    document.querySelector('.admin-sidebar')?.classList.remove('hide-bottom-nav');
}

// ─── Load all threads ─────────────────────────────────────────────
async function loadDMThreads() {
    const list = document.getElementById('dm-thread-list');
    const empty = document.getElementById('dm-list-empty');
    if (!list) return;

    list.innerHTML = '<div class="dm-thread-loading"><i class="fas fa-spinner fa-spin"></i></div>';

    try {
        const threads = await window.dmService.dmAdminGetAllThreads();

        list.innerHTML = '';

        if (!threads.length) {
            if (empty) empty.style.display = 'block';
            return;
        }

        if (empty) empty.style.display = 'none';
        list._allThreads = threads;
        renderDMThreadList(threads);

        // Refresh unread badge
        refreshAdminUnreadBadge();
    } catch (e) {
        console.error('loadDMThreads error:', e);
        const errDetail = e.message || JSON.stringify(e);
        list.innerHTML = `<p style="padding:16px;color:var(--text-3);font-size:13px">خطأ في تحميل المحادثات:<br><small>${errDetail}</small></p>`;
    }
}


function renderDMThreadList(threads) {
    const list = document.getElementById('dm-thread-list');
    list.innerHTML = threads.map(t => {
        let name, email, avatar;
        if (t.is_group === true) {
            name = t.group_name || 'مجموعة بدون اسم';
            email = 'محادثة جماعية';
            avatar = t.group_avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=28c76f&color=fff&size=64`;
        } else {
            const student = t.student || {};
            name = student.full_name || student.email?.split('@')[0] || 'مستخدم';
            email = student.email || '';
            avatar = student.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=7c6fe0&color=fff&size=64`;
        }

        const active = window._activeThreadId === t.id ? 'active' : '';
        const sId = (t.is_group === true) ? '' : t.student_id;
        const unreadBadge = t.unread_count > 0 ? `<div class="dm-thread-unread">${t.unread_count}</div>` : '';

        return `
        <div class="dm-thread-item ${active}" data-tid="${t.id}"
             onclick="openDMThread('${t.id}', '${sId || ''}', null)">
            <img class="dm-thread-avatar" src="${avatar}" alt="${name}">
            <div class="dm-thread-info">
                <div class="dm-thread-name">${escapeHtmlAdmin(name)}</div>
                <div class="dm-thread-email">${escapeHtmlAdmin(email)}</div>
            </div>
            ${unreadBadge}
        </div>`;
    }).join('');
}

function filterDMStudents(query) {
    const list = document.getElementById('dm-thread-list');
    const all = list._allThreads || [];
    const q = query.toLowerCase().trim();
    const filtered = q
        ? all.filter(t => {
            if (t.is_group) {
                return (t.group_name || '').toLowerCase().includes(q);
            } else {
                const s = t.student || {};
                return (s.full_name || '').toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q);
            }
        })
        : all;
    renderDMThreadList(filtered);
}

// ─── Open a specific thread ───────────────────────────────────────
async function openDMThread(threadId, studentId, myId) {
    window._activeThreadId = threadId;

    // Initialize Calling Service for this thread
    if (window.dmCallManager) window.dmCallManager.init(threadId);

    // Update active thread in list
    document.querySelectorAll('.dm-thread-item').forEach(el =>
        el.classList.toggle('active', el.dataset.tid === threadId));

    document.getElementById('dm-chat-panel').classList.add('dm-mob-open');
    document.getElementById('dm-chat-empty').style.display = 'none';
    document.getElementById('dm-chat-content').style.display = 'flex';

    // Set header info from thread list
    const threadEl = document.querySelector(`.dm-thread-item[data-tid="${threadId}"]`);
    const headerInfo = document.querySelector('.dm-chat-header-info');

    // Clear selection state from previous thread
    if (window.dmAdminCancelSelect) window.dmAdminCancelSelect();

    if (threadEl) {
        const avatar = threadEl.querySelector('.dm-thread-avatar');
        const nameText = threadEl.querySelector('.dm-thread-name')?.textContent || '';
        const emailText = threadEl.querySelector('.dm-thread-email')?.textContent || '';
        document.getElementById('dm-chat-avatar').src = avatar?.src || '';
        document.getElementById('dm-chat-name').textContent = nameText;
        document.getElementById('dm-chat-subtitle').textContent = emailText;

        // Detect if it's a group using cache for better reliability
        const threads = (document.getElementById('dm-thread-list')._allThreads || []);
        const threadData = threads.find(t => t.id === threadId);
        const isGroup = threadData?.is_group === true;

        if (isGroup) {
            headerInfo?.classList.add('clickable');
        } else {
            headerInfo?.classList.remove('clickable');
        }
    }

    // Load messages
    const msgContainer = document.getElementById('dm-admin-messages');
    msgContainer.innerHTML = '<div class="dm-msgs-loading"><i class="fas fa-spinner fa-spin"></i></div>';

    try {
        const msgs = await window.dmService.dmGetMessages(threadId);
        const myUid = (await supabaseClient.auth.getUser()).data.user?.id;
        renderDMMessages(msgContainer, msgs, myUid);

        // Mark as read
        await window.dmService.dmMarkRead(threadId);
        refreshAdminUnreadBadge();

        // Clear badge in the list immediately
        const threadItem = document.querySelector(`.dm-thread-item[data-tid="${threadId}"]`);
        if (threadItem) {
            const b = threadItem.querySelector('.dm-thread-unread');
            if (b) b.remove();
        }

        // Subscribe to realtime
        window.dmService.dmSubscribeToThread(threadId, async (payload) => {
            const me = (await supabaseClient.auth.getUser()).data.user?.id;
            if (payload.eventType === 'INSERT') {
                if (payload.new.sender_id !== me) {
                    payload.new.sender = await window.dmService.dmGetProfile(payload.new.sender_id);
                }
                appendDMMessage(msgContainer, payload.new, me);
                if (payload.new.sender_id !== me) {
                    await window.dmService.dmMarkRead(threadId);
                    refreshAdminUnreadBadge();
                    // Clear badge in list if it was added by global subscriber
                    const item = document.querySelector(`.dm-thread-item[data-tid="${threadId}"]`);
                    if (item) {
                        const b = item.querySelector('.dm-thread-unread');
                        if (b) b.remove();
                    }
                }
            } else if (payload.eventType === 'UPDATE') {
                const el = document.querySelector(`.dm-bubble[data-id="${payload.new.id}"]`);
                if (el) {
                    const textEl = el.querySelector('.dm-bubble-text');
                    const content = payload.new.content;
                    const htmlContent = window.dmDetectLinks ? window.dmDetectLinks(content) : (window.dmEscapeHTML ? window.dmEscapeHTML(content) : content);

                    if (textEl) {
                        textEl.innerHTML = htmlContent;
                    } else {
                        const bubbleText = el.querySelector('.dm-bubble-text');
                        if (bubbleText) bubbleText.innerHTML = htmlContent;
                    }

                    // Add edited indicator
                    if (payload.new.is_edited && !el.querySelector('.dm-bubble-edited')) {
                        const info = el.querySelector('.dm-bubble-info');
                        if (info) info.insertAdjacentHTML('afterbegin', '<span class="dm-bubble-edited">معدلة</span>');
                    }

                    // Soft-delete check for admin
                    if (payload.new.deleted_by_ids && payload.new.deleted_by_ids.includes(window._adminId)) {
                        el.remove();
                    }
                }
            } else if (payload.eventType === 'DELETE') {
                document.querySelector(`.dm-bubble[data-id="${payload.old.id}"]`)?.remove();
            }
        });
    } catch (e) {
        console.error('openDMThread error:', e);
        const errMsg = e.message || JSON.stringify(e);
        msgContainer.innerHTML = `
            <div style="padding:20px;text-align:center;color:var(--pink);font-size:13px">
                <i class="fas fa-triangle-exclamation" style="font-size:24px;margin-bottom:8px;display:block"></i>
                خطأ في تحميل الرسائل:<br>
                <small style="opacity:0.7;font-size:11px">${errMsg}</small>
            </div>`;
    }
}

// ─── Render messages ──────────────────────────────────────────────
function renderDMMessages(container, msgs, myId) {
    container.innerHTML = '';
    msgs.forEach(msg => appendDMMessage(container, msg, myId));
    container.scrollTop = container.scrollHeight;
}

function appendDMMessage(container, msg, myId) {
    // Soft-delete filter
    if (msg.deleted_by_ids && msg.deleted_by_ids.includes(myId)) return;
    if (container.querySelector(`.dm-bubble[data-id="${msg.id}"]`)) return;

    // Remove the loading spinner if present
    container.querySelector('.dm-msgs-loading')?.remove();

    const isMine = msg.sender_id === myId;
    const time = new Date(msg.created_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

    const bubble = document.createElement('div');
    bubble.className = `dm-bubble ${isMine ? 'mine' : 'theirs'}`;
    bubble.dataset.id = msg.id;

    let contentHtml = '';
    const content = msg.content || '';

    // Handle media
    if (content && (content.startsWith('http') || content.startsWith('/'))) {
        const url = content;
        const lowUrl = url.toLowerCase().split('?')[0]; // ignore query params
        if (lowUrl.match(/\.(jpeg|jpg|gif|png|webp)$/)) {
            contentHtml = `<img src="${url}" class="dm-bubble-media" onclick="window.dmOpenImageModal('${url}')" style="cursor:pointer">`;
        } else if (lowUrl.match(/\.(mp4|webm|mov|avi)$/)) {
            contentHtml = `<video src="${url}" controls class="dm-bubble-media"></video>`;
        } else if (lowUrl.match(/\.(mp3|wav|ogg|webm)$/) || lowUrl.includes('voice_')) {
            contentHtml = `<audio src="${url}" controls class="dm-bubble-audio"></audio>`;
        } else if (lowUrl.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt)$/)) {
            const fileName = url.split('/').pop().split('?')[0];
            contentHtml = `<a href="${url}" target="_blank" class="dm-bubble-file" onclick="window.confirmSafeLink('${url}', event)"><i class="fas fa-file-lines"></i><span>${window.dmEscapeHTML ? window.dmEscapeHTML(fileName) : fileName}</span></a>`;
        } else {
            contentHtml = `<div class="dm-bubble-text">${window.dmDetectLinks ? window.dmDetectLinks(content) : (window.dmEscapeHTML ? window.dmEscapeHTML(content) : content)}</div>`;
        }
    } else {
        contentHtml = `<div class="dm-bubble-text">${window.dmDetectLinks ? window.dmDetectLinks(content) : (window.dmEscapeHTML ? window.dmEscapeHTML(content) : content)}</div>`;
    }

    // Sender name for groups/others
    let senderHtml = '';
    if (!isMine && msg.sender) {
        const sName = msg.sender.full_name || msg.sender.email?.split('@')[0] || 'مستخدم';
        senderHtml = `<div class="dm-sender-name">${escapeHtmlAdmin(sName)}</div>`;
    }

    bubble.innerHTML = `
        ${senderHtml}
        ${contentHtml}
        <div class="dm-bubble-info">
            ${msg.is_edited ? '<span class="dm-bubble-edited">معدلة</span>' : ''}
            <div class="dm-bubble-time">${time}</div>
        </div>
    `;

    // Bind long press for selection/actions
    if (window.dmBindLongPress) {
        window.dmBindLongPress(bubble, msg.id, 'admin');
    }

    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
}

// ─── Send message ─────────────────────────────────────────────────
async function sendAdminDM() {
    if (!_activeThreadId) return;
    const input = document.getElementById('dm-admin-input');
    const text = input?.value?.trim();
    if (!text) return;

    const editId = input.dataset.editId;
    
    // Clear input and UI state immediately
    if (editId) {
        dmCancelEdit('admin');
    } else {
        input.value = '';
        input.style.height = 'auto';
        input.focus(); // Keep keyboard open on mobile
        dmToggleMicSend('admin', '');
    }

    try {
        if (editId) {
            await window.dmService.dmEditMessage(editId, text);
            if (window.dmShowToast) window.dmShowToast('تم تعديل الرسالة');
        } else {
            const data = await window.dmService.dmSendMessage(window._activeThreadId, text);
            const msgContainer = document.getElementById('dm-admin-messages');
            if (msgContainer && data) {
                appendDMMessage(msgContainer, data, window._adminId);
            }
        }
    } catch (e) {
        console.error('sendAdminDM error:', e);
        if (window.dmShowToast) window.dmShowToast('حدث خطأ: ' + (e.message || 'فشل الإرسال'));
    }
}

// ─── Close active chat on mobile ──────────────────────────────────
window.closeAdminChat = function () {
    window._activeThreadId = null;
    const panel = document.getElementById('dm-chat-panel');
    if (panel) panel.classList.remove('dm-mob-open');
    document.getElementById('dm-chat-empty').style.display = 'flex';
    document.getElementById('dm-chat-content').style.display = 'none';
};

// ─── "New Conversation" modal ─────────────────────────────────────
async function openNewThreadModal() {
    // 1. Get the admin's own school IDs first
    const { data: { session: _s } } = await supabaseClient.auth.getSession();
    const myAdminId = _s?.user?.id;
    let schoolFilter = null;
    if (myAdminId) {
        const { data: mySchools } = await supabaseClient
            .from('schools')
            .select('id')
            .eq('admin_id', myAdminId);
        if (mySchools && mySchools.length > 0) {
            schoolFilter = mySchools.map(s => s.id);
        }
    }

    // 2. Fetch students ONLY from the admin's schools
    // 2. Fetch all students and filter on client side
    const { data: allProfiles } = await supabaseClient
        .from('profiles')
        .select('id, full_name, email, avatar_url, role, user_type, school_id')
        .order('full_name', { ascending: true })
        .limit(1000);

    const students = (allProfiles || []).filter(p => 
        schoolFilter.includes(p.school_id) && 
        p.role !== 'admin' && 
        p.role !== 'post_study' && 
        p.user_type !== 'post_study'
    );

    if (!students?.length) {
        if (window.dmAlert) dmAlert('لا يوجد طلاب مسجلون بعد');
        else alert('لا يوجد طلاب مسجلون بعد');
        return;
    }

    // Simple inline modal
    const existing = document.getElementById('dm-pick-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'dm-pick-modal';
    modal.className = 'dm-pick-overlay';
    modal.innerHTML = `
        <div class="dm-pick-modal" onclick="event.stopPropagation()">
            <div class="dm-pick-header">
                <span>اختر طالباً</span>
                <button onclick="document.getElementById('dm-pick-modal').remove()">
                    <i class="fas fa-xmark"></i>
                </button>
            </div>
            <div class="dm-pick-list">
                ${students.map(s => {
        const name = s.full_name || s.email?.split('@')[0] || 'مستخدم';
        const avatar = s.avatar_url ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=7c6fe0&color=fff&size=64`;
        return `
                    <div class="dm-pick-item" onclick="startNewAdminThread('${s.id}',this)">
                        <img src="${avatar}" alt="">
                        <div>
                            <div class="dm-pick-name">${escapeHtmlAdmin(name)}</div>
                            <div class="dm-pick-email">${escapeHtmlAdmin(s.email || '')}</div>
                        </div>
                    </div>`;
    }).join('')}
            </div>
        </div>`;
    modal.onclick = () => modal.remove();
    document.body.appendChild(modal);
}

async function startNewAdminThread(studentId) {
    document.getElementById('dm-pick-modal')?.remove();
    try {
        const thread = await window.dmService.dmAdminCreateThread(studentId);
        await loadDMThreads();
        await openDMThread(thread.id, studentId, null);
    } catch (e) {
        console.error('startNewAdminThread error:', e);
    }
}

// ─── Unread badge in sidebar ──────────────────────────────────────
async function refreshAdminUnreadBadge() {
    try {
        const count = await window.dmService.dmGetUnreadCount();
        const badge = document.getElementById('admin-unread-badge');
        if (!badge) return;
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    } catch { /* silent */ }
}

// ─── Group Creation Logic ─────────────────────────────────────────

let _selectedGroupStudents = new Set();
let _allStudentsData = [];

async function openNewGroupModal() {
    _selectedGroupStudents.clear();
    const nameInput = document.getElementById('dm-group-name-input');
    if (nameInput) nameInput.value = '';

    const listContainer = document.getElementById('dm-group-student-list');
    if (!listContainer) return;
    listContainer.innerHTML = '<div style="padding:20px; text-align:center;"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';

    document.getElementById('dm-group-overlay').style.display = 'flex';

    // Reset avatar preview
    const preview = document.getElementById('dm-new-group-avatar-preview');
    if (preview) preview.src = 'https://ui-avatars.com/api/?name=G&background=28c76f&color=fff&size=80';
    const photoInput = document.getElementById('dm-new-group-photo-input');
    if (photoInput) photoInput.value = '';

    try {
        // Get admin's school IDs first
        const { data: { session: _gs } } = await supabaseClient.auth.getSession();
        const _gAdminId = _gs?.user?.id;
        let _gSchoolFilter = null;
        if (_gAdminId) {
            const { data: _gSchools } = await supabaseClient
                .from('schools').select('id').eq('admin_id', _gAdminId);
            if (_gSchools && _gSchools.length > 0) {
                _gSchoolFilter = _gSchools.map(s => s.id);
            }
        }

        // Fetch all students and filter on client side
        const { data: allGroupProfiles, error } = await supabaseClient
            .from('profiles')
            .select('id, full_name, email, avatar_url, role, user_type, school_id')
            .order('full_name', { ascending: true })
            .limit(1000);

        if (error) throw error;
        
        const students = (allGroupProfiles || []).filter(p => 
            _gSchoolFilter && _gSchoolFilter.includes(p.school_id) && 
            p.role !== 'admin' && 
            p.role !== 'post_study' && 
            p.user_type !== 'post_study'
        );

        _allStudentsData = students || [];

        renderGroupStudentList();
    } catch (e) {
        listContainer.innerHTML = '<div style="padding:20px; color:var(--pink);">حدث خطأ في تحميل الطلاب</div>';
        console.error(e);
    }
}

function renderGroupStudentList() {
    const listContainer = document.getElementById('dm-group-student-list');
    if (!_allStudentsData.length) {
        listContainer.innerHTML = '<div style="padding:20px; text-align:center;">لا يوجد طلاب مسجلين</div>';
        return;
    }

    listContainer.innerHTML = _allStudentsData.map(s => {
        const name = s.full_name || s.email?.split('@')[0] || 'مستخدم';
        const avatar = s.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=7c6fe0&color=fff&size=64`;
        const isSelected = _selectedGroupStudents.has(s.id);

        return `
            <div class="dm-pick-item" style="justify-content: space-between; background: ${isSelected ? 'var(--glass-2)' : 'transparent'};" onclick="toggleGroupStudent('${s.id}')">
                <div style="display:flex; align-items:center; gap:12px;">
                    <img src="${avatar}" alt="">
                    <div>
                        <div class="dm-pick-name">${escapeHtmlAdmin(name)}</div>
                        <div class="dm-pick-email">${escapeHtmlAdmin(s.email || '')}</div>
                    </div>
                </div>
                <div style="color: ${isSelected ? 'var(--cyan)' : 'var(--text-3)'}; font-size: 18px;">
                    <i class="${isSelected ? 'fas fa-check-circle' : 'far fa-circle'}"></i>
                </div>
            </div>`;
    }).join('');
}

function toggleGroupStudent(studentId) {
    if (_selectedGroupStudents.has(studentId)) {
        _selectedGroupStudents.delete(studentId);
    } else {
        _selectedGroupStudents.add(studentId);
    }
    renderGroupStudentList();
}

function closeGroupModal() {
    document.getElementById('dm-group-overlay').style.display = 'none';
}

async function submitNewGroup() {
    const groupName = document.getElementById('dm-group-name-input')?.value?.trim();
    if (!groupName) {
        if (window.dmAlert) dmAlert('الرجاء إدخال اسم المجموعة');
        else alert('الرجاء إدخال اسم المجموعة');
        return;
    }

    if (_selectedGroupStudents.size === 0) {
        if (window.dmAlert) dmAlert('الرجاء اختيار طالب واحد على الأقل للمجموعة');
        else alert('الرجاء اختيار طالب واحد على الأقل للمجموعة');
        return;
    }

    const originalBtnText = document.querySelector('#dm-group-overlay button[onclick="submitNewGroup()"]').innerHTML;
    document.querySelector('#dm-group-overlay button[onclick="submitNewGroup()"]').innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإنشاء...';

    try {
        let avatarUrl = null;
        const photoInput = document.getElementById('dm-new-group-photo-input');
        if (photoInput && photoInput.files && photoInput.files[0]) {
            document.querySelector('#dm-group-overlay button[onclick="submitNewGroup()"]').innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري رفع الصورة...';
            avatarUrl = await window.dmService.dmUploadFile(photoInput.files[0]);
        }

        document.querySelector('#dm-group-overlay button[onclick="submitNewGroup()"]').innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإنشاء...';
        const thread = await window.dmService.dmAdminCreateGroup(groupName, Array.from(_selectedGroupStudents), avatarUrl);
        closeGroupModal();
        await loadDMThreads();

        // Open the newly created group chat
        await openDMThread(thread.id, '', null);
    } catch (e) {
        console.error('submitNewGroup error:', e);
        const errMsg = e.message || JSON.stringify(e);
        if (window.dmAlert) dmAlert('حدث خطأ أثناء إنشاء المجموعة:\n' + errMsg);
        else alert('حدث خطأ أثناء إنشاء المجموعة:\n' + errMsg);
    } finally {
        document.querySelector('#dm-group-overlay button[onclick="submitNewGroup()"]').innerHTML = originalBtnText;
    }
}

function handleNewGroupPhotoChange(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const preview = document.getElementById('dm-new-group-avatar-preview');
            if (preview) preview.src = e.target.result;
        };
        reader.readAsDataURL(input.files[0]);
    }
}

// ─── Group Details/Edit Logic ─────────────────────────────────────

function handleHeaderInfoClick() {
    console.log('Header info clicked, current thread:', window._activeThreadId);
    const threadId = window._activeThreadId;
    if (!threadId) return;

    const list = document.getElementById('dm-thread-list');
    const threads = (list?._allThreads || []);
    const thread = threads.find(t => t.id === threadId);

    console.log('Thread found:', thread?.group_name, 'isGroup:', thread?.is_group);

    if (thread?.is_group === true) {
        openGroupInfoModal(threadId);
    }
}

async function openGroupInfoModal(threadId) {
    const overlay = document.getElementById('dm-group-info-overlay');
    const nameInput = document.getElementById('dm-group-info-name');
    const avatarImg = document.getElementById('dm-group-info-avatar');
    const list = document.getElementById('dm-group-members-list');

    overlay._activeThreadId = threadId;
    overlay.style.display = 'flex';
    list.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-3);">جاري التحميل...</div>';

    try {
        const threads = (document.getElementById('dm-thread-list')._allThreads || []);
        const thread = threads.find(t => t.id === threadId);

        if (thread) {
            nameInput.value = thread.group_name || '';
            const gName = thread.group_name || 'G';
            avatarImg.src = thread.group_avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(gName)}&background=28c76f&color=fff&size=80`;
        }

        const members = await window.dmService.dmGetThreadParticipants(threadId);
        renderGroupMembers(members);
    } catch (err) {
        console.error('Fetch group info error:', err);
        list.innerHTML = '<div style="padding:20px; text-align:center; color:#ff4d4d;">خطأ في تحميل الأعضاء</div>';
    }
}

function renderGroupMembers(members) {
    const list = document.getElementById('dm-group-members-list');
    if (!members || members.length === 0) {
        list.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-3);">لا يوجد أعضاء</div>';
        return;
    }

    list.innerHTML = members.map(m => {
        const avatar = m.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(m.full_name || 'U')}&background=7c6fe0&color=fff&size=64`;
        const name = m.full_name || m.email?.split('@')[0] || 'مستخدم';
        const isMe = m.id === window._adminId;
        const removeBtn = !isMe ? `
            <button onclick="removeGroupMember('${m.id}')" style="background:none; border:none; color:var(--pink); cursor:pointer; padding:8px; font-size:14px; opacity:0.6;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.6" title="إزالة من المجموعة">
                <i class="fas fa-user-minus"></i>
            </button>` : '';

        return `
        <div class="dm-member-item" style="display:flex; align-items:center; justify-content:space-between; padding:10px 20px; border-bottom:1px solid rgba(255,255,255,0.03);">
            <div style="display:flex; align-items:center; gap:12px;">
                <img class="dm-member-avatar" src="${avatar}" alt="${name}" style="width:36px; height:36px; border-radius:50%; object-fit:cover;">
                <div class="dm-member-info">
                    <div class="dm-member-name" style="font-weight:600; font-size:13px; color:var(--text-1);">${escapeHtmlAdmin(name)}</div>
                    <div class="dm-member-email" style="font-size:11px; color:var(--text-3);">${escapeHtmlAdmin(m.email || '')}</div>
                </div>
            </div>
            ${removeBtn}
        </div>`;
    }).join('');
}

function closeGroupInfoModal() {
    document.getElementById('dm-group-info-overlay').style.display = 'none';
}

async function handleGroupPhotoChange(input) {
    const file = input.files?.[0];
    if (!file) return;

    // Show preview
    const reader = new FileReader();
    reader.onload = e => document.getElementById('dm-group-info-avatar').src = e.target.result;
    reader.readAsDataURL(file);

    // Store file for saving
    document.getElementById('dm-group-info-overlay')._pendingFile = file;
}

async function saveGroupInfo() {
    const overlay = document.getElementById('dm-group-info-overlay');
    const threadId = overlay._activeThreadId;
    const name = document.getElementById('dm-group-info-name').value.trim();
    const btn = document.getElementById('btn-save-group-info');
    const file = overlay._pendingFile;

    if (!name) {
        if (window.dmAlert) dmAlert('يرجى إدخال اسم المجموعة');
        else alert('يرجى إدخال اسم المجموعة');
        return;
    }

    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = 'جاري الحفظ...';

    try {
        const updates = { group_name: name };

        if (file) {
            const url = await window.dmService.dmUploadFile(file);
            if (url) updates.group_avatar_url = url;
        }

        await window.dmService.dmUpdateThreadInfo(threadId, updates);

        overlay._pendingFile = null;
        closeGroupInfoModal();
        await loadDMThreads(); // Refresh list to see changes

        // Update current header manually for instant feedback
        if (window._activeThreadId === threadId) {
            document.getElementById('dm-chat-name').textContent = name;
            if (updates.group_avatar_url) {
                document.getElementById('dm-chat-avatar').src = updates.group_avatar_url;
            }
        }
    } catch (err) {
        console.error('Save group info error:', err);
        if (window.dmAlert) dmAlert('حدث خطأ أثناء حفظ التغييرات');
        else alert('حدث خطأ أثناء حفظ التغييرات');
    } finally {
        btn.disabled = false;
        btn.textContent = oldText;
    }
}

// ─── Member Management Actions ───────────────────────────────────

async function removeGroupMember(userId) {
    const threadId = document.getElementById('dm-group-info-overlay')._activeThreadId;
    if (!threadId || !userId) return;

    if (window.dmConfirm) {
        const ok = await dmConfirm('هل أنت متأكد من إزالة هذا العضو من المجموعة؟', 'تأكيد الإزالة', { isDanger: true });
        if (!ok) return;
    }

    try {
        await window.dmService.dmRemoveParticipant(threadId, userId);
        if (window.dmShowToast) dmShowToast('تمت إزالة العضو');
        
        // Refresh member list
        const members = await window.dmService.dmGetThreadParticipants(threadId);
        renderGroupMembers(members);
        
        // Refresh thread list for unread/last message consistency
        await loadDMThreads();
    } catch (err) {
        console.error('Remove member error:', err);
        if (window.dmAlert) dmAlert('حدث خطأ أثناء إزالة العضو');
    }
}

async function openAddMemberToGroupModal() {
    const threadId = document.getElementById('dm-group-info-overlay')._activeThreadId;
    if (!threadId) return;

    const listContainer = document.getElementById('dm-add-member-list');
    if (!listContainer) return;
    listContainer.innerHTML = '<div style="padding:20px; text-align:center;"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';

    document.getElementById('dm-add-member-overlay').style.display = 'flex';

    try {
        // 1. Get current members
        const currentMembers = await window.dmService.dmGetThreadParticipants(threadId);
        const memberIds = new Set(currentMembers.map(m => m.id));

        // 1.5 Get admin's school IDs
        const { data: { session } } = await supabaseClient.auth.getSession();
        const myAdminId = session?.user?.id;
        let schoolFilter = null;
        if (myAdminId) {
            const { data: mySchools } = await supabaseClient
                .from('schools')
                .select('id')
                .eq('admin_id', myAdminId);
            if (mySchools && mySchools.length > 0) {
                schoolFilter = mySchools.map(s => s.id);
            }
        }

        // 2. Get all student profiles to filter
        const { data: students, error } = await supabaseClient
            .from('profiles')
            .select('id, full_name, email, avatar_url, role, user_type, school_id')
            .neq('role', 'admin')
            .order('full_name', { ascending: true });

        if (error) throw error;

        // 3. Filter out those already in the group AND enforce school isolation
        const available = (students || []).filter(s => 
            !memberIds.has(s.id) &&
            schoolFilter && schoolFilter.includes(s.school_id) &&
            s.role !== 'post_study' &&
            s.user_type !== 'post_study'
        );

        if (available.length === 0) {
            listContainer.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-3);">لا يوجد أعضاء جدد لإضافتهم</div>';
            return;
        }

        listContainer.innerHTML = available.map(s => {
            const name = s.full_name || s.email?.split('@')[0] || 'مستخدم';
            const avatar = s.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=7c6fe0&color=fff&size=64`;

            return `
                <div class="dm-pick-item" onclick="addGroupMember('${s.id}')">
                    <img src="${avatar}" alt="">
                    <div>
                        <div class="dm-pick-name">${escapeHtmlAdmin(name)}</div>
                        <div class="dm-pick-email">${escapeHtmlAdmin(s.email || '')}</div>
                    </div>
                </div>`;
        }).join('');
    } catch (e) {
        listContainer.innerHTML = '<div style="padding:20px; color:var(--pink);">حدث خطأ في تحميل الطلاب</div>';
        console.error(e);
    }
}

async function addGroupMember(userId) {
    const threadId = document.getElementById('dm-group-info-overlay')._activeThreadId;
    if (!threadId || !userId) return;

    try {
        await window.dmService.dmAddParticipant(threadId, userId);
        closeAddMemberModal();
        if (window.dmShowToast) dmShowToast('تمت إضافة العضو بنجاح');
        
        // Refresh member list in previous modal
        const members = await window.dmService.dmGetThreadParticipants(threadId);
        renderGroupMembers(members);
        
        // Refresh thread list
        await loadDMThreads();
    } catch (err) {
        console.error('Add member error:', err);
        if (window.dmAlert) dmAlert('حدث خطأ أثناء إضافة العضو');
    }
}

function closeAddMemberModal() {
    document.getElementById('dm-add-member-overlay').style.display = 'none';
}
// ─── Calling Handlers ───────────────────────────────────────────
async function initAdminCall(type) {
    if (!window._activeThreadId) return;
    const myUser = (await supabaseClient.auth.getUser()).data.user;
    const adminName = myUser.user_metadata?.full_name || 'المشرف';

    // Start the call
    window.dmCallManager.startCall(window._activeThreadId, type, adminName);
}

// ─── School Management ──────────────────────────────────────────

/**
 * createAdminSchoolModal — يقرأ المعرف المولّد تلقائياً من نظام القوائم الذكية
 * واسم المدرسة من قائمة أسماء المدارس ثم يحفظهما في قاعدة البيانات.
 */
async function createAdminSchoolModal() {
    const submitBtn = document.getElementById('sid-submit-btn');
    const btn       = submitBtn; // نفس الزر

    // ─ جلب المعرف واسم المدرسة من بيانات الزر (يضعها school_id_generator.js)
    const idVal   = (submitBtn?.dataset?.generatedId || '').trim();
    const nameVal = (document.getElementById('sid-school-name')?.value || '').trim() || 'مدرسة مسار';

    // ─ التحقق من اكتمال البيانات
    if (!idVal) {
        _sidShowError('يرجى إكمال اختيار بيانات المدرسة أولاً لتوليد المعرف تلقائياً.');
        return;
    }

    if (!supabaseClient) return;
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;

    // ─ مؤشر التحميل
    btn.disabled = true;
    const originalBtnHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>جاري الإنشاء...</span>';

    try {
        const { error } = await supabaseClient
            .from('schools')
            .insert([{ id: idVal, name: nameVal, admin_id: session.user.id }]);

        if (error) {
            // تعارض في المعرف (نادر جداً مع checksum لكن نتعامل معه)
            if (error.code === '23505') {
                throw new Error('هذا المعرف مستخدم بالفعل. يرجى إعادة تحديد المدرسة لتوليد معرف مختلف.');
            }
            throw error;
        }

        // ─ نجاح: إخفاء النافذة وإعادة التحميل
        document.getElementById('premium-school-modal').style.display = 'none';
        if (window.dmShowToast) dmShowToast(`✅ تم إنشاء معرف المدرسة: ${idVal}`);
        setTimeout(() => window.location.reload(), 800);

    } catch (err) {
        console.error('Error creating school:', err);
        _sidShowError(err.message || 'حدث خطأ أثناء الحفظ. يرجى المحاولة مجدداً.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalBtnHtml;
        // إعادة تفعيل الزر فقط إذا كان المعرف لا يزال موجوداً
        if (submitBtn?.dataset?.generatedId) btn.disabled = false;
        else btn.disabled = true;
    }
}

/**
 * عرض رسالة خطأ داخل نافذة المعرف بدلاً من alert()
 */
function _sidShowError(msg) {
    let errEl = document.getElementById('sid-error-msg');
    if (!errEl) {
        errEl = document.createElement('p');
        errEl.id = 'sid-error-msg';
        errEl.style.cssText = 'color:var(--pink);font-size:0.85rem;margin:10px 0 0;text-align:center;animation:fadeIn .3s;';
        const submitBtn = document.getElementById('sid-submit-btn');
        if (submitBtn) submitBtn.parentNode.insertBefore(errEl, submitBtn.nextSibling);
    }
    errEl.textContent = msg;
    setTimeout(() => { if (errEl) errEl.textContent = ''; }, 5000);
}

/**
 * تهيئة نظام القوائم المنسدلة الذكية عند إظهار نافذة إنشاء المدرسة.
 * تُستدعى من admin.js بعد التأكد من عدم وجود مدرسة مسجلة.
 */
function initSmartSchoolModal() {
    if (window.schoolIdGenerator && typeof window.schoolIdGenerator.init === 'function') {
        window.schoolIdGenerator.init();
    }
}

async function createAdminSchool() {
    const idInput = document.getElementById('new-school-id-input');
    const nameInput = document.getElementById('new-school-name-input');
    const btn = document.getElementById('btn-create-school');
    
    const idVal = (idInput.value || '').trim().toUpperCase();
    const nameVal = (nameInput.value || '').trim() || 'مستشار مسار';
    
    if (!idVal) {
        alert('يرجى إدخال رمز المدرسة أو المعرف الخاص بك.');
        return;
    }
    
    if (!supabaseClient) return;
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;
    
    btn.disabled = true;
    const originalBtnHtml = btn.innerHTML;
    btn.innerHTML = '<span>جاري الإنشاء...</span> <i class="fas fa-spinner fa-spin"></i>';
    
    try {
        const { error } = await supabaseClient
            .from('schools')
            .insert([{ id: idVal, name: nameVal, admin_id: session.user.id }]);
            
        if (error) {
            if (error.code === '23505') { throw new Error('هذا الرمز مستخدم بالفعل. يرجى اختيار رمز آخر.'); }
            throw error;
        }
        
        // Update UI
        document.getElementById('school-create-section').style.display = 'none';
        document.getElementById('my-school-name').textContent = nameVal;
        document.getElementById('my-school-id').textContent = idVal;
        document.getElementById('school-view-section').style.display = 'flex';
        
        // Refresh page to load data properly
        setTimeout(() => window.location.reload(), 1500);
        
    } catch (err) {
        console.error('Error creating school:', err);
        alert(err.message || 'حدث خطأ. يرجى المحاولة.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalBtnHtml;
    }
}

function copyMySchoolId() {
    const idText = document.getElementById('my-school-id').textContent;
    if (idText === '—') return;

    const btnText = document.getElementById('copy-school-btn-text');
    const updateUI = () => {
        if (btnText) {
            btnText.textContent = 'تم النسخ!';
            setTimeout(() => btnText.textContent = 'نسخ', 2000);
        }
    };

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(idText).then(updateUI).catch(err => {
            console.error('Clipboard API failed, using fallback:', err);
            fallbackCopyText(idText, updateUI);
        });
    } else {
        fallbackCopyText(idText, updateUI);
    }
}

function fallbackCopyText(text, callback) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        const successful = document.execCommand('copy');
        if (successful && callback) callback();
    } catch (err) {
        console.error('Fallback copy failed:', err);
    }
    document.body.removeChild(textArea);
}
