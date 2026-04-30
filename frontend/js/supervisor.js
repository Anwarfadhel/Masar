/* ============================================================
   مسار — Supervisor Analytics Dashboard Logic (Linked to Supabase)
   ============================================================ */

'use strict';

// ─── STATE ───────────────────────────────────────────────────
let appData = {
    students: [],
    stats: {
        completed: 0,
        pending: 0,
        total: 0,
        rate: 0
    },
    charts: {
        sentiment: {},
        majors: {},
        skills: {},
        progress: {
            months: ['أكتوبر', 'نوفمبر', 'ديسمبر', 'يناير', 'فبراير', 'مارس', 'أبريل'],
            data: { confident: [], hesitant: [], lost: [], ambitious: [] }
        }
    }
};

// ─── CHART INSTANCES ─────────────────────────────────────────
let _sentimentChart = null;
let _majorsChart = null;
let _progressChart = null;

// ─── Guard: enforce admin role ────────────────────────────────
async function requireAdmin() {
    if (typeof initSupabase === 'function' && !window.supabaseClient) await initSupabase();
    if (!window.supabaseClient) {
        window.location.href = '/auth/login.html';
        return null;
    }
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = '/auth/login.html';
        return null;
    }
    if (typeof getUserRole === 'function') {
        const role = await getUserRole(window.supabaseClient, session.user.id);
        if (role !== 'admin') {
            window.location.href = '/dashboard.html';
            return null;
        }
    }
    return session;
}

// Sentiment mapping from Arabic tags to system keys
const SENTIMENT_MAP = {
    'واثق': 'confident',
    'متردد': 'hesitant',
    'مشتت': 'lost',
    'طموح غير واقعي': 'ambitious',
    'طموح': 'ambitious'
};

const SENTIMENT_CONFIG = {
    confident: { label: 'واثق', color: '#56cfb2', cls: 'confident' },
    hesitant: { label: 'متردد', color: '#ff9f43', cls: 'hesitant' },
    lost: { label: 'مشتت', color: '#ea5455', cls: 'lost' },
    ambitious: { label: 'طموح غير واقعي', color: '#7c6fe0', cls: 'ambitious' },
};

// Helper to extract sentiment key from recommendation tags
const svGetSentiment = (rec) => {
    if (rec && rec.student_status_tags) {
        const tags = Array.isArray(rec.student_status_tags) ? rec.student_status_tags : [];
        for (let t of tags) {
            if (typeof t !== 'string') continue;
            if (SENTIMENT_MAP[t]) return SENTIMENT_MAP[t];
            for (let key in SENTIMENT_MAP) {
                if (t.includes(key)) return SENTIMENT_MAP[key];
            }
        }
    }
    return 'confident';
};

// ─── UTILS ───────────────────────────────────────────────────
function svCountUp(el, target, suffix) {
    if (!el) return;
    let n = 0;
    const step = Math.max(1, Math.ceil(target / 40));
    const t = setInterval(() => {
        n = Math.min(n + step, target);
        el.textContent = n.toLocaleString('ar-EG') + (suffix || '');
        if (n >= target) clearInterval(t);
    }, 25);
    if (target === 0) el.textContent = '0' + (suffix || '');
}

function svScrollTo(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (typeof closeSvSidebar === 'function') closeSvSidebar();
}

function svShowToast(msg, duration) {
    const t = document.getElementById('sv-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), duration || 2800);
}

function svGetInitials(name) {
    return (name || 'ط').split(' ').slice(0, 2).map(w => w[0]).join('');
}

// ─── DATA FETCHING ───────────────────────────────────────────
async function fetchData() {
    try {
        if (typeof initSupabase === 'function' && !window.supabaseClient) {
            await initSupabase();
        }

        if (!window.supabaseClient) {
            console.error('Supabase client not initialized');
            return;
        }

        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session) return;

        const myId = session.user.id;

        // 1. Get School
        const { data: schools } = await window.supabaseClient.from('schools').select('*').eq('admin_id', myId);
        if (!schools || !schools.length) return;
        const mySchoolIds = schools.map(s => s.id);

        const schoolBadge = document.getElementById('sv-school-name-text');
        if (schoolBadge) schoolBadge.textContent = schools[0].name;

        // 2. Get Profiles
        const { data: profilesData } = await window.supabaseClient
            .from('profiles')
            .select('*')
            .in('school_id', mySchoolIds);

        // Client-side filter to match admin.js logic exactly
        const profiles = (profilesData || []).filter(p =>
            p.role !== 'admin' &&
            p.role !== 'post_study' &&
            p.user_type !== 'post_study'
        );

        // 3. Get Recommendations
        const profileIds = profiles.map(p => p.id);
        let recs = [];
        if (profileIds.length > 0) {
            const { data } = await window.supabaseClient
                .from('recommendations')
                .select('*')
                .in('user_id', profileIds)
                .order('created_at', { ascending: false });
            recs = data || [];
        }

        // 4. Map to appData
        mapData(profiles, recs);

        // 5. Populate User Info for UI
        if (typeof svPopulateUser === 'function') svPopulateUser(session);

    } catch (err) {
        console.error('Fetch error:', err);
        const errBanner = document.getElementById('sv-error');
        if (errBanner) {
            errBanner.style.display = 'flex';
            errBanner.querySelector('span').textContent = 'خطأ في الربط: ' + err.message;
        }
    }
}

function mapData(profiles, recs) {
    // Group recommendations by user, maintaining the created_at DESC order
    const userRecs = {};
    recs.forEach(r => {
        if (!userRecs[r.user_id]) userRecs[r.user_id] = [];
        userRecs[r.user_id].push(r);
    });

    appData.students = profiles.map(p => {
        const myRecs = userRecs[p.id] || [];
        const r = myRecs[0]; // Latest recommendation
        const rPrev = myRecs[1]; // Previous recommendation

        let sentiment = svGetSentiment(r);

        // Check if status or major changed compared to previous record
        let hasChanged = false;
        if (r && rPrev) {
            const prevSentiment = svGetSentiment(rPrev);
            const prevMajor = rPrev.primary_major;
            if (sentiment !== prevSentiment || r.primary_major !== prevMajor) {
                hasChanged = true;
            }
        }

        // Aggregate school subjects from the latest TWO recommendations
        let rawSkills = [];
        const CORE_SUBJECTS = ['رياضيات', 'فيزياء', 'أحياء', 'كيمياء', 'إنجليزي'];

        myRecs.slice(0, 2).forEach(rec => {
            let subjectsFound = new Set();

            // 1. Try to extract from structured metadata
            if (rec.admin_executive_summary) {
                try {
                    const meta = JSON.parse(rec.admin_executive_summary);
                    if (meta.skills && Array.isArray(meta.skills)) {
                        meta.skills.forEach(sk => {
                            for (let sub of CORE_SUBJECTS) {
                                if (sk.includes(sub)) subjectsFound.add(sub);
                            }
                        });
                    }
                } catch (e) { /* not JSON */ }
            }

            // 2. Extract from roadmap (legacy or fallback)
            if (rec.roadmap && Array.isArray(rec.roadmap)) {
                rec.roadmap.forEach(item => {
                    const str = typeof item === 'string' ? item : (item.skill || item.title || '');
                    if (!str) return;
                    for (let sub of CORE_SUBJECTS) {
                        if (str.includes(sub)) subjectsFound.add(sub);
                    }
                });
            }

            rawSkills.push(...subjectsFound); // Each subject once per recommendation
        });

        let uniqueSkills = [...new Set(rawSkills)];

        return {
            id: p.id,
            name: p.full_name || p.email.split('@')[0] || 'طالب',
            grade: p.academic_level || p.educational_level || 'غير محدد',
            sentiment: sentiment,
            hasChanged: hasChanged,
            hasMajor: !!r,
            major: r ? r.primary_major : null,
            skills: uniqueSkills,
            created_at: p.created_at
        };
    });

    // Stats
    appData.stats.total = appData.students.length;
    appData.stats.completed = appData.students.filter(s => s.hasMajor).length;
    appData.stats.pending = appData.stats.total - appData.stats.completed;
    appData.stats.rate = appData.stats.total ? Math.round((appData.stats.completed / appData.stats.total) * 100) : 0;

    // Real data for Progress
    generateProgressData(recs);
}

function generateProgressData(recs) {
    const monthsAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    
    // 1. Get last 7 months dynamically
    const now = new Date();
    const targetMonths = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        targetMonths.push({
            name: monthsAr[d.getMonth()],
            month: d.getMonth(),
            year: d.getFullYear()
        });
    }

    appData.charts.progress.months = targetMonths.map(m => m.name);
    
    // 2. Initialize results
    const results = {
        confident: new Array(7).fill(0),
        hesitant: new Array(7).fill(0),
        lost: new Array(7).fill(0),
        ambitious: new Array(7).fill(0)
    };

    // 3. Process recommendations
    targetMonths.forEach((tm, idx) => {
        const userStatusInMonth = {}; // Latest sentiment per user in this month
        
        recs.forEach(r => {
            const rDate = new Date(r.created_at);
            if (rDate.getMonth() === tm.month && rDate.getFullYear() === tm.year) {
                const s = svGetSentiment(r);
                if (!userStatusInMonth[r.user_id] || new Date(r.created_at) > new Date(userStatusInMonth[r.user_id].date)) {
                    userStatusInMonth[r.user_id] = { sentiment: s, date: r.created_at };
                }
            }
        });

        // Count totals for this month
        Object.values(userStatusInMonth).forEach(val => {
            if (results[val.sentiment] !== undefined) {
                results[val.sentiment][idx]++;
            }
        });
    });

    appData.charts.progress.data = results;
}

// ─── RENDERING ───────────────────────────────────────────────

function renderKPI() {
    svCountUp(document.getElementById('kpi-completed-val'), appData.stats.completed);
    svCountUp(document.getElementById('kpi-pending-val'), appData.stats.pending);
    svCountUp(document.getElementById('kpi-total-val'), appData.stats.total);
    svCountUp(document.getElementById('kpi-rate-val'), appData.stats.rate, '%');
}

function renderSentimentChart() {
    const counts = {};
    appData.students.forEach(s => { counts[s.sentiment] = (counts[s.sentiment] || 0) + 1; });

    const keys = Object.keys(SENTIMENT_CONFIG);
    const labels = keys.map(k => SENTIMENT_CONFIG[k].label);
    const data = keys.map(k => counts[k] || 0);
    const colors = keys.map(k => SENTIMENT_CONFIG[k].color);
    const total = data.reduce((a, b) => a + b, 0);

    const totalEl = document.getElementById('sv-donut-total');
    if (totalEl) totalEl.textContent = total;

    const canvas = document.getElementById('sentimentChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (_sentimentChart) _sentimentChart.destroy();
    _sentimentChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data, backgroundColor: colors, borderColor: 'rgba(10,10,24,0.8)', borderWidth: 3, hoverOffset: 10 }]
        },
        options: {
            cutout: '68%',
            responsive: true, maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: { label: ctx => ` ${ctx.parsed} طالب (${total ? Math.round(ctx.parsed / total * 100) : 0}%)` },
                    backgroundColor: 'rgba(10,10,30,0.95)',
                    titleColor: '#f0f0f8', bodyColor: 'rgba(240,240,248,0.7)',
                    borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
                }
            },
            onClick: (e, elements) => {
                if (!elements.length) return;
                const key = keys[elements[0].index];
                openSentimentModal(key);
            }
        }
    });

    const legend = document.getElementById('sv-sentiment-legend');
    if (legend) {
        legend.innerHTML = keys.map((k, i) => {
            const pct = total ? Math.round((data[i] / total) * 100) : 0;
            return `
            <div class="sv-legend-item" onclick="openSentimentModal('${k}')" role="button" tabindex="0" aria-label="${labels[i]}">
              <div class="sv-legend-dot" style="background:${colors[i]};box-shadow:0 0 8px ${colors[i]}66"></div>
              <div class="sv-legend-text">
                <div class="sv-legend-name">${labels[i]}</div>
                <div class="sv-legend-pct">${pct}% من الطلاب</div>
              </div>
              <div class="sv-legend-count" style="color:${colors[i]}">${data[i]}</div>
            </div>`;
        }).join('');
    }
}

function getPriority(student) {
    const g = student.grade.toLowerCase();
    const s = student.sentiment;
    if (g.includes('ثالث') && (s === 'lost' || s === 'ambitious')) return { level: 'high', label: 'أحمر', cls: 'high', rowCls: 'sv-row-red' };
    if ((g.includes('أول') || g.includes('ثاني')) && s === 'hesitant') return { level: 'medium', label: 'أصفر', cls: 'medium', rowCls: 'sv-row-yellow' };
    return { level: 'low', label: 'أخضر', cls: 'low', rowCls: 'sv-row-green' };
}

function renderIntervention() {
    const critical = appData.students
        .map(s => ({ ...s, priority: getPriority(s) }))
        .filter(s => s.priority.level !== 'low' || s.sentiment !== 'confident' || s.hasChanged)
        .sort((a, b) => {
            const order = { high: 0, medium: 1, low: 2 };
            return order[a.priority.level] - order[b.priority.level];
        });

    const countEl = document.getElementById('sv-intervention-count');
    if (countEl) countEl.textContent = critical.length;

    const tbody = document.getElementById('sv-intervention-tbody');
    if (!tbody) return;

    tbody.innerHTML = critical.map(s => {
        const p = s.priority;
        const sCfg = SENTIMENT_CONFIG[s.sentiment];

        const warningIcon = s.hasChanged
            ? `<i class="fas fa-triangle-exclamation" style="color: #ff9f43; margin-right: 5px;" title="تغيرت حالة الطالب أو مساره مؤخراً"></i>`
            : '';

        return `
        <tr class="${p.rowCls}">
          <td data-label="الأولوية"><span class="sv-priority-badge ${p.cls}">${p.level === 'high' ? '🔴 عالية' : p.level === 'medium' ? '🟡 متوسطة' : '🟢 منخفضة'}</span></td>
          <td data-label="الطالب">
            <div class="user-cell">
              <div class="sv-student-avatar" style="width:30px;height:30px;font-size:11px">${svGetInitials(s.name)}</div>
              <span style="font-weight:600;font-size:13px">${s.name} ${warningIcon}</span>
            </div>
          </td>
          <td data-label="المرحلة"><span class="date-cell">${s.grade}</span></td>
          <td data-label="الحالة"><span class="sv-sentiment-tag ${sCfg.cls}">${sCfg.label}</span></td>
          <td data-label="التوصية"><span style="font-size:12px;color:var(--text-2)">${s.major || 'لم تُحدَّد'}</span></td>
          <td data-label="الإجراء">
            <button class="sv-btn-remind" onclick="svSendReminder('${s.id}','${s.name}',this)">
              <i class="fas fa-bell"></i> تذكير
            </button>
          </td>
        </tr>`;
    }).join('');
}

function renderMajorsChart() {
    const counts = {};
    appData.students.forEach(s => { if (s.major) counts[s.major] = (counts[s.major] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const labels = sorted.map(e => e[0]);
    const data = sorted.map(e => e[1]);
    const palette = ['#7c6fe0', '#56cfb2', '#e06fa0', '#ff9f43', '#00cfe8'];

    const canvas = document.getElementById('majorsChart');
    if (!canvas) return;

    if (_majorsChart) _majorsChart.destroy();
    _majorsChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'عدد الطلاب',
                data,
                backgroundColor: palette.map(c => c + 'cc'),
                borderColor: palette,
                borderWidth: 2,
                borderRadius: 8,
                borderSkipped: false,
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: { label: c => ` ${c.parsed.x} طالب` },
                    backgroundColor: 'rgba(10,10,30,0.95)',
                    titleColor: '#f0f0f8', bodyColor: 'rgba(240,240,248,0.7)',
                    borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: 'rgba(240,240,248,0.5)', font: { family: 'Cairo' }, stepSize: 1 },
                    border: { color: 'transparent' }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: 'rgba(240,240,248,0.75)', font: { family: 'Cairo', weight: '700' } },
                    border: { color: 'transparent' }
                }
            }
        }
    });
}

function renderSkillTags() {
    const counts = {};
    appData.students.forEach(s => s.skills.forEach(sk => { counts[sk] = (counts[sk] || 0) + 1; }));
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const max = sorted[0]?.[1] || 1;
    const palettes = ['sv-tag-1', 'sv-tag-2', 'sv-tag-3', 'sv-tag-4', 'sv-tag-5', 'sv-tag-6'];

    const countEl = document.getElementById('sv-skills-count');
    if (countEl) countEl.textContent = sorted.length + ' مهارة';

    const cloud = document.getElementById('sv-tags-cloud');
    if (!cloud) return;

    cloud.innerHTML = sorted.map(([skill, count], i) => {
        const size = 11 + Math.round((count / max) * 12);
        const pal = palettes[i % palettes.length];
        return `
        <span class="sv-skill-tag ${pal}" style="font-size:${size}px; cursor:pointer; transition: transform 0.2s" title="${count} طالب - انقر لعرض الطلاب" onclick="openSkillModal('${skill.replace(/'/g, "\\'")}')" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
          <i class="fas fa-hashtag" style="font-size:${size - 3}px;opacity:0.6"></i>
          ${skill}
          <span style="font-size:10px;opacity:0.65;font-weight:600">${count}</span>
        </span>`;
    }).join('');
}

function renderProgressChart() {
    const colors = {
        confident: { line: '#56cfb2', bg: 'rgba(86,207,178,0.08)' },
        hesitant: { line: '#ff9f43', bg: 'rgba(255,159,67,0.07)' },
        lost: { line: '#ea5455', bg: 'rgba(234,84,85,0.07)' },
        ambitious: { line: '#7c6fe0', bg: 'rgba(124,111,224,0.07)' },
    };
    const canvas = document.getElementById('progressChart');
    if (!canvas) return;

    if (_progressChart) _progressChart.destroy();
    _progressChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: appData.charts.progress.months,
            datasets: [
                { label: 'واثق', data: appData.charts.progress.data.confident, borderColor: colors.confident.line, backgroundColor: colors.confident.bg, tension: 0.45, fill: true, borderWidth: 2.5, pointRadius: 4, pointHoverRadius: 7, pointBackgroundColor: colors.confident.line },
                { label: 'متردد', data: appData.charts.progress.data.hesitant, borderColor: colors.hesitant.line, backgroundColor: colors.hesitant.bg, tension: 0.45, fill: true, borderWidth: 2.5, pointRadius: 4, pointHoverRadius: 7, pointBackgroundColor: colors.hesitant.line },
                { label: 'مشتت', data: appData.charts.progress.data.lost, borderColor: colors.lost.line, backgroundColor: colors.lost.bg, tension: 0.45, fill: true, borderWidth: 2.5, pointRadius: 4, pointHoverRadius: 7, pointBackgroundColor: colors.lost.line },
                { label: 'طموح غير واقعي', data: appData.charts.progress.data.ambitious, borderColor: colors.ambitious.line, backgroundColor: colors.ambitious.bg, tension: 0.45, fill: true, borderWidth: 2.5, pointRadius: 4, pointHoverRadius: 7, pointBackgroundColor: colors.ambitious.line },
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true, position: 'top',
                    labels: { color: 'rgba(240,240,248,0.65)', font: { family: 'Cairo', size: 12 }, usePointStyle: true, pointStyleWidth: 10, boxHeight: 8 }
                },
                tooltip: {
                    backgroundColor: 'rgba(10,10,30,0.95)',
                    titleColor: '#f0f0f8', bodyColor: 'rgba(240,240,248,0.7)',
                    borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
                    callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.y} طالب` }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: 'rgba(240,240,248,0.5)', font: { family: 'Cairo' } },
                    border: { color: 'transparent' }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: 'rgba(240,240,248,0.5)', font: { family: 'Cairo' }, stepSize: 2 },
                    border: { color: 'transparent' },
                    beginAtZero: true,
                }
            }
        }
    });
}

// ─── UNIVERSAL MODAL ──────────────────────────────────────────
let _modalStudents = [];

window.openStudentModal = function (type) {
    let students, title, subtitle, iconHtml, showReminder;

    if (type === 'completed') {
        students = appData.students.filter(s => s.hasMajor);
        title = 'طلاب أتموا التوصية';
        subtitle = `${students.length} طالب حصل على توصية تخصص`;
        iconHtml = '<i class="fas fa-check-circle"></i>';
        showReminder = false;
        document.getElementById('sv-modal-icon').style.background = 'rgba(40,199,111,0.14)';
        document.getElementById('sv-modal-icon').style.color = '#28c76f';
    } else {
        students = appData.students.filter(s => !s.hasMajor);
        title = 'طلاب بلا توصية';
        subtitle = `${students.length} طالب لم يُكمل الاستشارة بعد`;
        iconHtml = '<i class="fas fa-clock"></i>';
        showReminder = true;
        document.getElementById('sv-modal-icon').style.background = 'rgba(255,159,67,0.14)';
        document.getElementById('sv-modal-icon').style.color = '#ff9f43';
    }

    _modalStudents = students;
    document.getElementById('sv-modal-icon').innerHTML = iconHtml;
    document.getElementById('sv-modal-title').textContent = title;
    document.getElementById('sv-modal-subtitle').textContent = subtitle;
    const search = document.getElementById('sv-modal-search');
    if (search) search.value = '';
    document.getElementById('sv-modal-footer').style.display = showReminder ? 'block' : 'none';
    renderModalStudents(students, showReminder);

    document.getElementById('sv-modal').classList.add('open');
};

window.openSentimentModal = function (sentimentKey) {
    const students = appData.students.filter(s => s.sentiment === sentimentKey);
    const cfg = SENTIMENT_CONFIG[sentimentKey];
    _modalStudents = students;

    document.getElementById('sv-modal-icon').innerHTML = '<i class="fas fa-heart-pulse"></i>';
    document.getElementById('sv-modal-icon').style.background = cfg.color + '22';
    document.getElementById('sv-modal-icon').style.color = cfg.color;
    document.getElementById('sv-modal-title').textContent = 'طلاب — ' + cfg.label;
    document.getElementById('sv-modal-subtitle').textContent = `${students.length} طالب في هذه الفئة النفسية`;
    const search = document.getElementById('sv-modal-search');
    if (search) search.value = '';
    document.getElementById('sv-modal-footer').style.display = 'none';
    renderModalStudents(students, false);

    document.getElementById('sv-modal').classList.add('open');
};

window.openSkillModal = function (skill) {
    const students = appData.students.filter(s => s.skills.includes(skill));
    _modalStudents = students;

    document.getElementById('sv-modal-icon').innerHTML = '<i class="fas fa-hashtag"></i>';
    document.getElementById('sv-modal-icon').style.background = 'rgba(124, 111, 224, 0.14)';
    document.getElementById('sv-modal-icon').style.color = '#7c6fe0';
    document.getElementById('sv-modal-title').textContent = 'مهارة / مادة: ' + skill;
    document.getElementById('sv-modal-subtitle').textContent = `${students.length} طالب يحتاج دعماً في هذه المادة`;
    const search = document.getElementById('sv-modal-search');
    if (search) search.value = '';
    document.getElementById('sv-modal-footer').style.display = 'none';
    renderModalStudents(students, false);

    document.getElementById('sv-modal').classList.add('open');
};

function renderModalStudents(students, showReminder) {
    const body = document.getElementById('sv-modal-body');
    if (!body) return;
    if (!students.length) {
        body.innerHTML = `<div class="sv-modal-empty"><i class="fas fa-users-slash"></i><p>لا يوجد طلاب في هذه الفئة</p></div>`;
        return;
    }
    body.innerHTML = students.map(s => {
        const sCfg = SENTIMENT_CONFIG[s.sentiment];
        const remindBtn = showReminder
            ? `<button class="sv-btn-remind-sm" onclick="svSendReminder('${s.id}','${s.name}',this)"><i class="fas fa-bell"></i> تذكير</button>`
            : '';
        return `
        <div class="sv-student-row">
          <div class="sv-student-avatar">${svGetInitials(s.name)}</div>
          <div class="sv-student-info">
            <div class="sv-student-name">${s.name}</div>
            <div class="sv-student-meta">${s.grade} · <span class="sv-sentiment-tag ${sCfg.cls}" style="padding:1px 7px;font-size:10px">${sCfg.label}</span> ${s.major ? '· ' + s.major : ''}</div>
          </div>
          ${remindBtn}
        </div>`;
    }).join('');
}

window.filterModalStudents = function (q) {
    const lower = q.toLowerCase().trim();
    const filtered = lower ? _modalStudents.filter(s => s.name.toLowerCase().includes(lower) || s.grade.toLowerCase().includes(lower)) : _modalStudents;
    const showReminder = document.getElementById('sv-modal-footer').style.display !== 'none';
    renderModalStudents(filtered, showReminder);
};

window.closeSvModal = function () {
    const modal = document.getElementById('sv-modal');
    if (modal) modal.classList.remove('open');
};

// ── Click-outside to close sv-modal ──
(function() {
    document.addEventListener('click', (e) => {
        const modal = document.getElementById('sv-modal');
        if (modal && modal.classList.contains('open')) {
            // إغلاق فقط إذا نُقر خارج المحتوى الداخلي
            if (e.target === modal) window.closeSvModal();
        }
    });
})();

/**
 * svSendReminder — يُرسل رسالة تذكير فعلية للطالب عبر نظام DM
 * @param {string} studentId - معرف الطالب في Supabase
 * @param {string} studentName - اسم الطالب للعرض
 * @param {HTMLElement} btn - زر التذكير لتغيير حالته
 */
window.svSendReminder = async function (studentId, studentName, btn) {
    if (!studentId || studentId === 'undefined') {
        svShowToast('⚠️ لا يمكن إرسال التذكير — معرف الطالب غير متوفر');
        return;
    }
    if (!window.dmService) {
        svShowToast('⚠️ خدمة المراسلة غير جاهزة');
        return;
    }

    // تغيير حالة الزر أثناء الإرسال
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

    try {
        // 1. احصل على thread موجود أو أنشئ واحداً جديداً
        const thread = await window.dmService.dmAdminCreateThread(studentId);
        if (!thread) throw new Error('فشل إنشاء المحادثة');

        // 2. أرسل رسالة تذكير تلقائية
        const reminderMsg = `مرحباً ${studentName} 👋، نذكّرك باستكمال استشارتك المهنية عبر تطبيق مسار. انتهِ من الأسئلة لتحصل على توصيتك الأكاديمية المخصصة! 🎓`;
        await window.dmService.dmSendMessage(thread.id, reminderMsg);

        svShowToast(`✅ تم إرسال تذكير لـ ${studentName} في الشات`);
        if (btn) { btn.innerHTML = '<i class="fas fa-check"></i> تم'; }
    } catch (err) {
        console.error('svSendReminder error:', err);
        svShowToast('❌ فشل إرسال التذكير: ' + (err.message || 'خطأ غير معروف'));
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-bell"></i> تذكير'; }
    }
};

/**
 * sendBulkReminder — يُرسل تذكيراً جماعياً لجميع الطلاب بلا توصية
 */
window.sendBulkReminder = async function () {
    const pending = _modalStudents.filter(s => !s.hasMajor);
    if (!pending.length) { svShowToast('لا يوجد طلاب بانتظار التذكير'); return; }
    if (!window.dmService) { svShowToast('⚠️ خدمة المراسلة غير جاهزة'); return; }

    const bulkBtn = document.querySelector('[onclick="sendBulkReminder()"]');
    if (bulkBtn) { bulkBtn.disabled = true; bulkBtn.textContent = 'جاري الإرسال...'; }

    let successCount = 0;
    for (const s of pending) {
        if (!s.id) continue;
        try {
            const thread = await window.dmService.dmAdminCreateThread(s.id);
            if (thread) {
                const msg = `مرحباً ${s.name} 👋، نذكّرك باستكمال استشارتك المهنية عبر تطبيق مسار. 🎓`;
                await window.dmService.dmSendMessage(thread.id, msg);
                successCount++;
            }
        } catch (e) { console.warn('Bulk remind failed for', s.name, e); }
    }

    svShowToast(`📣 تم إرسال تذكير لـ ${successCount} طالب بنجاح`);
    if (bulkBtn) { bulkBtn.disabled = false; bulkBtn.textContent = 'تذكير الجميع'; }
};

// Global init
document.addEventListener('DOMContentLoaded', async () => {
    const loader = document.getElementById('sv-page-loader');

    // 1. Guard check
    const session = await requireAdmin();
    if (!session) return;

    // 2. Fill User Info
    const user = session.user;
    const meta = user.user_metadata || {};
    const fullName = meta.full_name || user.email.split('@')[0];
    const email = user.email;
    const avatarUrl = meta.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=7c6fe0&color=fff&size=72`;

    const nameEl = document.getElementById('sv-user-name');
    const emailEl = document.getElementById('sv-user-email');
    const avatarImg = document.getElementById('sv-user-avatar');

    const sideNameEl = document.getElementById('sv-sidebar-name');
    const sideEmailEl = document.getElementById('sv-sidebar-email');
    const sideAvatarImg = document.getElementById('sv-sidebar-avatar');

    if (nameEl) nameEl.textContent = fullName;
    if (emailEl) emailEl.textContent = email;
    if (avatarImg) avatarImg.src = avatarUrl;

    if (sideNameEl) sideNameEl.textContent = fullName;
    if (sideEmailEl) sideEmailEl.textContent = email;
    if (sideAvatarImg) sideAvatarImg.src = avatarUrl;

    // 3. Data Load
    await fetchData();

    // 3. Hide loader
    if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => loader.style.display = 'none', 300);
    }

    // Render
    renderKPI();
    renderSentimentChart();
    renderIntervention();
    renderMajorsChart();
    renderSkillTags();
    renderProgressChart();

    // 4. Setup Realtime Updates
    if (window.supabaseClient && window.supabaseClient.channel) {
        let _svUpdateTimer = null;
        window.supabaseClient
            .channel('supervisor_dashboard_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, payload => {
                if (_svUpdateTimer) clearTimeout(_svUpdateTimer);
                _svUpdateTimer = setTimeout(async () => {
                    await fetchData();
                    renderKPI(); renderSentimentChart(); renderIntervention();
                    renderMajorsChart(); renderSkillTags(); renderProgressChart();
                }, 1500);
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'recommendations' }, payload => {
                if (_svUpdateTimer) clearTimeout(_svUpdateTimer);
                _svUpdateTimer = setTimeout(async () => {
                    await fetchData();
                    renderKPI(); renderSentimentChart(); renderIntervention();
                    renderMajorsChart(); renderSkillTags(); renderProgressChart();
                    if (typeof svShowToast === 'function') svShowToast('تم تحديث التحليلات', 2500);
                }, 1500);
            })
            .subscribe();
    }

    // Avatar dropdown toggle
    const avatarBtn = document.getElementById('sv-avatar-btn');
    const dropdownTop = document.getElementById('sv-user-dropdown-top');
    if (avatarBtn && dropdownTop) {
        avatarBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownTop.classList.toggle('open');
        });
    }
});

// Close modal on Escape
document.addEventListener('keydown', e => { if (e.key === 'Escape') window.closeSvModal(); });

// Global click to close dropdowns
document.addEventListener('click', () => {
    document.getElementById('sv-user-dropdown')?.classList.remove('open');
    document.getElementById('sv-user-dropdown-top')?.classList.remove('open');
});
