/**
 * dm_ui.js
 * Shared UI logic for advanced DM features (Menus, Search, Long-press, Recording, etc.)
 */

// ─── UTILS ───────────────────────────────────────────────────
function _getEl(id) { return document.getElementById(id); }

// ─── MENUS & DROPDOWNS ───────────────────────────────────────
function toggleDMMenu(menuId) {
    const menu = _getEl(menuId);
    if (!menu) return;
    const isVisible = menu.style.display === 'flex';
    // Close others first
    document.querySelectorAll('.dm-dropdown-menu').forEach(m => m.style.display = 'none');
    menu.style.display = isVisible ? 'none' : 'flex';

    // Close on click outside
    if (!isVisible) {
        setTimeout(() => {
            const closer = (e) => {
                if (!menu.contains(e.target)) {
                    menu.style.display = 'none';
                    document.removeEventListener('click', closer);
                }
            };
            document.addEventListener('click', closer);
        }, 10);
    }
}

function toggleDMAttachMenu(side) {
    const menu = _getEl(side === 'admin' ? 'dm-admin-attach-menu' : 'dm-student-attach-menu');
    if (!menu) return;
    const isVisible = menu.style.display === 'grid';
    menu.style.display = isVisible ? 'none' : 'grid';

    if (!isVisible) {
        setTimeout(() => {
            const closer = (e) => {
                const btn = _getEl(side === 'admin' ? 'dm-admin-attach-btn' : 'dm-student-attach-btn');
                if (!menu.contains(e.target) && (!btn || !btn.contains(e.target))) {
                    menu.style.display = 'none';
                    document.removeEventListener('click', closer);
                }
            };
            document.addEventListener('click', closer);
        }, 10);
    }
}

function closeDMAttachMenu(side) {
    const menu = _getEl(side === 'admin' ? 'dm-admin-attach-menu' : 'dm-student-attach-menu');
    if (menu) menu.style.display = 'none';
}

// ─── SEARCH ──────────────────────────────────────────────────
function dmSearchOpen(side) {
    _getEl(side === 'admin' ? 'dm-admin-search-bar' : 'dm-student-search-bar').style.display = 'flex';
    _getEl(side === 'admin' ? 'dm-admin-search-input' : 'dm-student-search-input').focus();
    // Hide menu
    const menu = side === 'admin' ? _getEl('dm-admin-menu') : _getEl('dm-student-menu');
    if (menu) menu.style.display = 'none';
}

function dmSearchClose(side) {
    _getEl(side === 'admin' ? 'dm-admin-search-bar' : 'dm-student-search-bar').style.display = 'none';
    _getEl(side === 'admin' ? 'dm-admin-search-input' : 'dm-student-search-input').value = '';
    // Reset filters
    const containerId = side === 'admin' ? 'dm-admin-messages' : 'sdm-messages';
    dmFilterMessages('', containerId);
}

function dmFilterMessages(query, containerId) {
    const container = _getEl(containerId);
    if (!container) return;
    const messages = container.querySelectorAll('.dm-bubble');
    const q = query.toLowerCase().trim();

    messages.forEach(msg => {
        const text = msg.querySelector('.dm-bubble-text')?.innerText.toLowerCase() || '';
        if (text.includes(q)) {
            msg.style.display = '';
        } else {
            msg.style.display = 'none';
        }
    });
}

// ─── MIC / SEND TOGGLE ───────────────────────────────────────
function dmToggleMicSend(side, val) {
    const micBtn = side === 'admin' ? _getEl('dm-admin-mic-btn') : _getEl('dm-student-mic-btn');
    const sendBtn = side === 'admin' ? _getEl('dm-admin-send-btn') : _getEl('dm-student-send-btn');

    if (!micBtn || !sendBtn) return;

    if (val.trim().length > 0) {
        micBtn.style.display = 'none';
        sendBtn.style.display = 'flex';
    } else {
        micBtn.style.display = 'flex';
        sendBtn.style.display = 'none';
    }
}

// ─── TOAST NOTIFICATIONS ─────────────────────────────────────
function dmShowToast(message, icon = 'fa-comment-dots') {
    let container = document.getElementById('dm-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'dm-toast-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 19999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
            max-width: 92vw;
            width: max-content;
        `;
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'dm-toast';
    toast.style.cssText = `
        background: rgba(18, 18, 48, 0.9);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(124, 111, 224, 0.3);
        color: #fff;
        padding: 12px 20px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5), inset 0 0 10px rgba(124,111,224,0.2);
        animation: dm-toast-in 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards;
        pointer-events: auto;
        min-width: 250px;
    `;

    toast.innerHTML = `
        <i class="fas ${icon}" style="color:var(--purple-light); font-size:18px"></i>
        <div style="flex:1">${message}</div>
        <i class="fas fa-xmark" style="opacity:0.5; cursor:pointer" onclick="this.parentElement.remove()"></i>
    `;

    container.appendChild(toast);

    // Keyframes for animation if not exists
    if (!document.getElementById('dm-toast-animation')) {
        const style = document.createElement('style');
        style.id = 'dm-toast-animation';
        style.innerHTML = `
            @keyframes dm-toast-in {
                from { opacity: 0; transform: translateY(-20px) scale(0.9); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes dm-toast-out {
                from { opacity: 1; transform: translateY(0) scale(1); }
                to { opacity: 0; transform: translateY(-20px) scale(0.9); }
            }
        `;
        document.head.appendChild(style);
    }

    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.animation = 'dm-toast-out 0.3s forwards';
            setTimeout(() => toast.remove(), 300);
        }
    }, 4000);
}

window.dmShowToast = dmShowToast;

// ─── THREAD LIST FILTER (for student sidebar) ─────────────────
function dmFilterThreads(query, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const items = container.querySelectorAll('.dm-thread-item');
    const q = (query || '').toLowerCase().trim();
    items.forEach(item => {
        const name = item.querySelector('.dm-thread-name')?.textContent.toLowerCase() || '';
        const subtitle = item.querySelector('.dm-thread-email')?.textContent.toLowerCase() || '';
        if (!q || name.includes(q) || subtitle.includes(q)) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });
}

// ─── LONG PRESS (SELECTION MODE) ──────────────────────────────
let _dmLongPressTimer = null;
let _dmSelectedMessages = [];
let _dmSelectionMode = false;

function dmBindLongPress(el, messageId, side) {
    el.addEventListener('mousedown', (e) => _onStart(e, messageId, side));
    el.addEventListener('touchstart', (e) => _onStart(e, messageId, side));
    el.addEventListener('mouseup', _onEnd);
    el.addEventListener('mouseleave', _onEnd);
    el.addEventListener('touchend', _onEnd);

    function _onStart(e, mid, s) {
        if (_dmSelectionMode) {
            dmToggleMessageSelection(el, mid, s);
            return;
        }
        _dmLongPressTimer = setTimeout(() => {
            dmStartSelection(el, mid, s);
        }, 600);
    }
    function _onEnd() {
        clearTimeout(_dmLongPressTimer);
    }
}

function dmStartSelection(el, mid, side) {
    _dmSelectionMode = true;
    _dmSelectedMessages = [];
    // Show bar
    const bar = side === 'admin' ? _getEl('dm-admin-select-bar') : _getEl('dm-student-select-bar');
    if (bar) bar.style.display = 'flex';

    dmToggleMessageSelection(el, mid, side);
}

function dmToggleMessageSelection(el, mid, side) {
    const idx = _dmSelectedMessages.indexOf(mid);
    if (idx > -1) {
        _dmSelectedMessages.splice(idx, 1);
        el.classList.remove('selected');
    } else {
        _dmSelectedMessages.push(mid);
        el.classList.add('selected');
    }

    // Update count
    const countEl = side === 'admin' ? _getEl('dm-admin-select-count') : _getEl('dm-student-select-count');
    if (countEl) countEl.innerText = `${_dmSelectedMessages.length} رسالة`;

    // Update actions visibility based on ownership
    _dmUpdateActionVisibility(side);

    // If zero, exit selection mode
    if (_dmSelectedMessages.length === 0) {
        dmCancelSelection(side);
    }
}

/**
 * Update visibility of Edit/Delete buttons based on selected messages ownership.
 * Edit: only if 1 message selected AND it is mine.
 * Delete: only if ALL selected messages are mine.
 */
function _dmUpdateActionVisibility(side) {
    const bar = side === 'admin' ? _getEl('dm-admin-select-bar') : _getEl('dm-student-select-bar');
    if (!bar) return;

    const editBtn = bar.querySelector('[title="تعديل"]');
    const deleteBtn = bar.querySelector('[title="حذف"]');

    const selectedEls = document.querySelectorAll('.dm-bubble.selected');
    const anySelected = selectedEls.length > 0;
    const singleSelected = _dmSelectedMessages.length === 1;
    const firstIsMine = anySelected && selectedEls[0].classList.contains('mine');

    if (editBtn) {
        // Edit only if exactly one message is selected and it belongs to the user
        editBtn.style.display = (singleSelected && firstIsMine) ? 'flex' : 'none';
    }

    if (deleteBtn) {
        // Delete button is now visible for any selected messages (mine or theirs)
        deleteBtn.style.display = anySelected ? 'flex' : 'none';
    }
}

function dmCancelSelection(side) {
    _dmSelectionMode = false;
    _dmSelectedMessages = [];
    const bar = side === 'admin' ? _getEl('dm-admin-select-bar') : _getEl('dm-student-select-bar');
    if (bar) bar.style.display = 'none';

    // Remove classes
    document.querySelectorAll('.dm-bubble.selected').forEach(el => el.classList.remove('selected'));
}

// Global aliases for HTML
window.dmStudentCancelSelect = () => dmCancelSelection('student');
window.dmAdminCancelSelect = () => dmCancelSelection('admin');

// ─── MESSAGE ACTIONS ─────────────────────────────────────────
async function dmCopySelected(side) {
    if (_dmSelectedMessages.length === 0) return;
    // For now copy text of the first one
    const mid = _dmSelectedMessages[0];
    const bubble = document.querySelector(`.dm-bubble[data-id="${mid}"]`);
    const text = bubble?.querySelector('.dm-bubble-text')?.innerText;
    if (text) {
        await navigator.clipboard.writeText(text);
        if (window.dmShowToast) dmShowToast('تم النسخ للمحافظة');
        else if (window.dmAlert) dmAlert('تم النسخ للمحافظة');
    }
    dmCancelSelection(side);
}

async function dmDeleteSelected(side) {
    if (_dmSelectedMessages.length === 0) return;
    if (window.dmConfirm) {
        const ok = await dmConfirm(`هل تريد حذف ${_dmSelectedMessages.length} رسالة؟`, 'تأكيد الحذف', { isDanger: true });
        if (!ok) return;
    } else {
        if (!confirm(`هل تريد حذف ${_dmSelectedMessages.length} رسالة؟`)) return;
    }

    try {
        for (const mid of _dmSelectedMessages) {
            await window.dmService.dmDeleteMessage(mid);
            const el = document.querySelector(`.dm-bubble[data-id="${mid}"]`);
            if (el) el.remove();
        }
        const count = _dmSelectedMessages.length;
        dmCancelSelection(side);
        if (window.dmShowToast) dmShowToast(count === 1 ? 'تم حذف الرسالة' : `تم حذف ${count} رسائل`);
    } catch (err) {
        console.error('Delete error:', err);
        if (window.dmShowToast) dmShowToast('فشل حذف الرسالة: ' + (err.message || 'خطأ غير معروف'));
        else if (window.dmAlert) dmAlert('فشل الحذف');
    }
}

async function dmEditSelected(side) {
    if (_dmSelectedMessages.length !== 1) {
        if (window.dmAlert) dmAlert('يمكنك تعديل رسالة واحدة فقط');
        return;
    }
    const mid = _dmSelectedMessages[0];
    const bubble = document.querySelector(`.dm-bubble[data-id="${mid}"]`);
    
    if (!bubble?.classList.contains('mine')) {
        if (window.dmShowToast) window.dmShowToast('يمكنك تعديل رسائلك فقط');
        dmCancelSelection(side);
        return;
    }
    const textEl = bubble?.querySelector('.dm-bubble-text');
    
    // Improved text extraction: prefer innerText but handle cases where it might be empty
    const text = textEl?.innerText || textEl?.textContent || "";

    const input = side === 'admin' ? _getEl('dm-admin-input') : _getEl('sdm-input');
    if (!input) return;
    
    input.value = text;
    input.focus();
    input.dataset.editId = mid; // Mark input for editing
    
    // Show visual indicator that we are editing
    const container = side === 'admin' ? _getEl('dm-admin-input-bar-wrap') : _getEl('sdm-input-bar-wrap');
    if (container) container.classList.add('editing-mode');
    
    // Show Cancel button
    const cancelBtn = side === 'admin' ? _getEl('dm-admin-cancel-edit') : _getEl('sdm-cancel-edit');
    if (cancelBtn) cancelBtn.style.display = 'flex';

    dmCancelSelection(side);
    dmToggleMicSend(side, text);
    
    // Auto-resize textarea
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
}

function dmCancelEdit(side) {
    const input = side === 'admin' ? _getEl('dm-admin-input') : _getEl('sdm-input');
    if (!input) return;
    
    input.value = '';
    delete input.dataset.editId;
    
    const container = side === 'admin' ? _getEl('dm-admin-input-bar-wrap') : _getEl('sdm-input-bar-wrap');
    if (container) container.classList.remove('editing-mode');
    
    const cancelBtn = side === 'admin' ? _getEl('dm-admin-cancel-edit') : _getEl('sdm-cancel-edit');
    if (cancelBtn) cancelBtn.style.display = 'none';
    
    dmToggleMicSend(side, '');
    input.style.height = 'auto';
}

window.dmCancelEdit = dmCancelEdit;

// ─── RECORDING (TOGGLE MODE) ──────────────────────────────────
let _dmMediaRecorder = null;
let _dmAudioChunks = [];
let _dmRecordingSide = null;
let _dmRecordingTimerInterval = null;
let _dmRecordingSeconds = 0;
let _dmIsRecording = false;

// Inject recording bar CSS once
(function injectRecordingCSS() {
    if (document.getElementById('dm-recording-style')) return;
    const style = document.createElement('style');
    style.id = 'dm-recording-style';
    style.textContent = `
        .dm-recording-bar {
            display: none;
            align-items: center;
            gap: 10px;
            padding: 8px 14px;
            background: rgba(220, 38, 38, 0.15);
            border: 1px solid rgba(220, 38, 38, 0.4);
            border-radius: 12px;
            margin: 6px 12px;
            animation: dmRecordPulse 1.5s ease-in-out infinite;
        }
        .dm-recording-bar.active { display: flex; }
        @keyframes dmRecordPulse {
            0%, 100% { border-color: rgba(220, 38, 38, 0.4); }
            50% { border-color: rgba(220, 38, 38, 0.9); }
        }
        .dm-rec-dot {
            width: 10px; height: 10px;
            border-radius: 50%;
            background: #dc2626;
            animation: dmDotBlink 1s ease-in-out infinite;
            flex-shrink: 0;
        }
        @keyframes dmDotBlink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.2; }
        }
        .dm-rec-label { color: #f87171; font-size: 13px; font-weight: 600; flex: 1; }
        .dm-rec-timer { color: #f87171; font-size: 13px; font-family: monospace; font-weight: 700; }
        .dm-rec-cancel {
            background: none; border: none;
            color: #f87171; font-size: 13px;
            cursor: pointer; padding: 4px 8px;
            border-radius: 6px;
            transition: background 0.2s;
        }
        .dm-rec-cancel:hover { background: rgba(220,38,38,0.2); }
        .dm-rec-stop {
            background: #dc2626; border: none;
            color: #fff; font-size: 12px;
            cursor: pointer; padding: 5px 12px;
            border-radius: 8px; font-weight: 600;
            transition: background 0.2s;
        }
        .dm-rec-stop:hover { background: #b91c1c; }
        .dm-mic-btn.recording {
            background: rgba(220, 38, 38, 0.3) !important;
            color: #dc2626 !important;
            animation: dmRecordPulse 1s ease-in-out infinite !important;
        }
    `;
    document.head.appendChild(style);
})();

function _getOrCreateRecordingBar(side) {
    const barId = side === 'admin' ? 'dm-admin-rec-bar' : 'dm-student-rec-bar';
    let bar = document.getElementById(barId);
    if (bar) return bar;

    bar = document.createElement('div');
    bar.id = barId;
    bar.className = 'dm-recording-bar';
    bar.innerHTML = `
        <div class="dm-rec-dot"></div>
        <span class="dm-rec-label">جاري التسجيل...</span>
        <span class="dm-rec-timer" id="${barId}-timer">0:00</span>
        <button class="dm-rec-cancel" onclick="dmCancelRecording('${side}')">إلغاء</button>
        <button class="dm-rec-stop" onclick="dmStopRecording('${side}')">✔ إرسال</button>
    `;

    // Insert the bar just before the input bar
    const inputBar = side === 'admin'
        ? document.querySelector('#dm-admin-panel .dm-input-bar')
        : document.getElementById('sdm-input-bar');

    if (inputBar) {
        inputBar.parentNode.insertBefore(bar, inputBar);
    }
    return bar;
}

async function dmToggleRecording(side) {
    if (_dmIsRecording) {
        dmStopRecording(side);
    } else {
        await dmStartRecording(side);
    }
}

async function dmStartRecording(side) {
    if (_dmIsRecording) return; // prevent double-start

    const micBtn = side === 'admin' ? _getEl('dm-admin-mic-btn') : _getEl('dm-student-mic-btn');

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Choose supported MIME type
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : MediaRecorder.isTypeSupported('audio/webm')
                ? 'audio/webm'
                : 'audio/ogg';

        _dmMediaRecorder = new MediaRecorder(stream, { mimeType });
        _dmAudioChunks = [];
        _dmRecordingSide = side;
        _dmIsRecording = true;

        _dmMediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) _dmAudioChunks.push(e.data);
        };

        _dmMediaRecorder.onstop = async () => {
            _dmIsRecording = false;
            _clearRecordingTimer();

            // Hide recording bar
            const bar = _getOrCreateRecordingBar(side);
            bar.classList.remove('active');

            // Restore mic button
            if (micBtn) micBtn.classList.remove('recording');

            // Stop all tracks
            stream.getTracks().forEach(t => t.stop());

            if (_dmAudioChunks.length === 0) return;

            const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
            const audioBlob = new Blob(_dmAudioChunks, { type: mimeType });
            await dmHandleAudioUpload(audioBlob, side, ext);
        };

        _dmMediaRecorder.start(100); // collect data every 100ms

        // Show recording bar
        const bar = _getOrCreateRecordingBar(side);
        bar.classList.add('active');

        // Mic button visual
        if (micBtn) micBtn.classList.add('recording');

        // Start timer
        _dmRecordingSeconds = 0;
        _dmRecordingTimerInterval = setInterval(() => {
            _dmRecordingSeconds++;
            const mins = Math.floor(_dmRecordingSeconds / 60);
            const secs = _dmRecordingSeconds % 60;
            const timerEl = document.getElementById(
                side === 'admin' ? 'dm-admin-rec-bar-timer' : 'dm-student-rec-bar-timer'
            );
            if (timerEl) timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        }, 1000);

    } catch (err) {
        console.error('Mic error:', err);
        _dmIsRecording = false;
        if (micBtn) micBtn.classList.remove('recording');

        let msg = 'لا يمكن الوصول إلى الميكروفون.';
        if (err.name === 'NotAllowedError') msg = 'تم رفض إذن الميكروفون. يرجى السماح له من إعدادات المتصفح.';
        else if (err.name === 'NotFoundError') msg = 'لم يُعثر على ميكروفون في هذا الجهاز.';
        if (window.dmAlert) dmAlert(msg);
        else alert(msg);
    }
}

function _clearRecordingTimer() {
    if (_dmRecordingTimerInterval) {
        clearInterval(_dmRecordingTimerInterval);
        _dmRecordingTimerInterval = null;
    }
    _dmRecordingSeconds = 0;
}

function dmStopRecording(side) {
    if (!_dmIsRecording) return;
    if (_dmMediaRecorder && _dmMediaRecorder.state !== 'inactive') {
        _dmMediaRecorder.stop(); // triggers onstop
    }
}

function dmCancelRecording(side) {
    if (!_dmIsRecording) return;

    _dmIsRecording = false;
    _clearRecordingTimer();

    // Drain chunks so onstop doesn't upload
    _dmAudioChunks = [];

    if (_dmMediaRecorder && _dmMediaRecorder.state !== 'inactive') {
        _dmMediaRecorder.stop();
        // Stop stream tracks
        try { _dmMediaRecorder.stream.getTracks().forEach(t => t.stop()); } catch (_) { }
    }

    // Hide bar
    const bar = _getOrCreateRecordingBar(side);
    bar.classList.remove('active');

    // Restore mic button
    const micBtn = side === 'admin' ? _getEl('dm-admin-mic-btn') : _getEl('dm-student-mic-btn');
    if (micBtn) micBtn.classList.remove('recording');
}

// ─── FILE PREVIEW MODAL ──────────────────────────────────────
function _showFilePreviewModal(file, side, onConfirm) {
    // Remove any existing preview modal
    document.getElementById('dm-file-preview-modal')?.remove();

    const fileType = file.type || '';
    const fileName = file.name || 'ملف';
    const fileSize = file.size < 1024 * 1024
        ? (file.size / 1024).toFixed(1) + ' KB'
        : (file.size / (1024 * 1024)).toFixed(1) + ' MB';

    let previewHtml = '';
    const objectUrl = URL.createObjectURL(file);

    if (fileType.startsWith('image/')) {
        previewHtml = `<img src="${objectUrl}" id="dm-fp-img"
            style="max-width:100%;max-height:280px;border-radius:12px;display:block;margin:0 auto;">`;
    } else if (fileType.startsWith('video/')) {
        previewHtml = `<video src="${objectUrl}" controls
            style="max-width:100%;max-height:260px;border-radius:12px;display:block;margin:0 auto;"></video>`;
    } else if (fileType.startsWith('audio/')) {
        previewHtml = `
            <div style="text-align:center;padding:20px 0">
                <i class="fas fa-waveform" style="font-size:48px;color:var(--purple-light);margin-bottom:12px;display:block"></i>
                <audio src="${objectUrl}" controls style="width:100%;max-width:280px;margin:0 auto;display:block;"></audio>
            </div>`;
    } else {
        const ext = fileName.split('.').pop().toUpperCase();
        previewHtml = `
            <div style="text-align:center;padding:28px 0">
                <div style="width:70px;height:70px;background:rgba(124,111,224,.15);border-radius:16px;
                    display:flex;align-items:center;justify-content:center;margin:0 auto 12px">
                    <i class="fas fa-file-lines" style="font-size:32px;color:var(--purple-light)"></i>
                </div>
                <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:var(--cyan);margin-bottom:4px">${ext}</div>
            </div>`;
    }

    const modal = document.createElement('div');
    modal.id = 'dm-file-preview-modal';
    modal.style.cssText = `
        position:fixed;inset:0;z-index:9999;
        background:rgba(0,0,0,.7);backdrop-filter:blur(8px);
        display:flex;align-items:center;justify-content:center;padding:20px;
    `;
    modal.innerHTML = `
        <div style="background:var(--bg-1);border:1px solid var(--glass-border);border-radius:20px;
            width:min(420px,100%);padding:20px;box-shadow:0 24px 80px rgba(0,0,0,.6);">
            <!-- Header -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
                <span style="font-size:14px;font-weight:700;color:var(--text-1)">معاينة الملف قبل الإرسال</span>
                <button id="dm-fp-cancel-x"
                    style="width:32px;height:32px;border-radius:50%;background:var(--glass-2);border:1px solid var(--glass-border);
                    color:var(--text-2);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px">
                    <i class="fas fa-xmark"></i>
                </button>
            </div>
            <!-- Preview -->
            <div style="background:var(--glass-1);border-radius:12px;padding:12px;margin-bottom:14px">
                ${previewHtml}
            </div>
            <!-- File info -->
            <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;
                background:var(--glass-2);border-radius:10px;margin-bottom:16px">
                <i class="fas fa-paperclip" style="color:var(--text-3);font-size:13px;flex-shrink:0"></i>
                <span style="flex:1;font-size:12px;color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
                    title="${fileName}">${fileName}</span>
                <span style="font-size:11px;color:var(--text-3);flex-shrink:0">${fileSize}</span>
            </div>
            <!-- Buttons -->
            <div style="display:flex;gap:10px">
                <button id="dm-fp-cancel"
                    style="flex:1;padding:11px;border-radius:10px;background:var(--glass-2);
                    border:1px solid var(--glass-border);color:var(--text-2);font-size:13px;font-weight:600;cursor:pointer">
                    إلغاء
                </button>
                <button id="dm-fp-send"
                    style="flex:2;padding:11px;border-radius:10px;
                    background:linear-gradient(135deg,var(--purple),var(--cyan));
                    border:none;color:#fff;font-size:13px;font-weight:700;cursor:pointer;
                    display:flex;align-items:center;justify-content:center;gap:8px">
                    <i class="fas fa-paper-plane"></i> إرسال
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => {
        URL.revokeObjectURL(objectUrl);
        modal.remove();
    };

    document.getElementById('dm-fp-cancel').onclick = closeModal;
    document.getElementById('dm-fp-cancel-x').onclick = closeModal;
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    document.getElementById('dm-fp-send').onclick = async () => {
        const sendBtn = document.getElementById('dm-fp-send');
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الرفع...';
        try {
            await onConfirm();
            closeModal();
        } catch (err) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> إعادة المحاولة';
            console.error('Send error:', err);
        }
    };
}

// ─── ATTACHMENTS ─────────────────────────────────────────────
async function dmHandleFileUpload(input, type, side) {
    const file = input.files ? input.files[0] : input;
    if (!file) { console.warn('dmHandleFileUpload: no file'); return; }

    // Close the attach menu immediately
    const menu = _getEl(side === 'admin' ? 'dm-admin-attach-menu' : 'dm-student-attach-menu');
    if (menu) menu.style.display = 'none';

    const threadId = side === 'admin' ? window._activeThreadId : window._sdmThreadId;
    if (!threadId) {
        if (window.dmAlert) dmAlert('يرجى فتح محادثة أولاً قبل إرسال الملف.');
        else alert('يرجى فتح محادثة أولاً قبل إرسال الملف.');
        if (input.value !== undefined) input.value = '';
        return;
    }

    // Show preview modal — only uploads on confirm
    _showFilePreviewModal(file, side, async () => {
        const url = await window.dmService.dmUploadFile(file);
        if (url) {
            await window.dmService.dmSendMessage(threadId, url);
        } else {
            throw new Error('فشل رفع الملف — لم يُعد رابط صالح');
        }
    });

    // Reset input so same file can be picked again later
    if (input.value !== undefined) input.value = '';
}

async function dmHandleAudioUpload(blob, side, ext) {
    if (!blob || blob.size === 0) return;

    const file = new File([blob], `voice_${Date.now()}.${ext || 'webm'}`, { type: blob.type });

    const threadId = side === 'admin' ? window._activeThreadId : window._sdmThreadId;
    if (!threadId) return;

    // Show preview modal — only uploads on confirm
    _showFilePreviewModal(file, side, async () => {
        // Show uploading indicator inside the modal or just use the existing spinner logic
        const url = await window.dmService.dmUploadFile(file);
        if (url) {
            await window.dmService.dmSendMessage(threadId, url);
        } else {
            throw new Error('فشل رفع التسجيل الصوتي');
        }
    });
}

async function dmSendLocation(side) {
    const threadId = side === 'admin' ? window._activeThreadId : window._sdmThreadId;
    if (!threadId) {
        if (window.dmAlert) dmAlert('يرجى فتح محادثة أولاً.');
        else alert('يرجى فتح محادثة أولاً.');
        return;
    }

    // Close the attach menu immediately
    const menu = _getEl(side === 'admin' ? 'dm-admin-attach-menu' : 'dm-student-attach-menu');
    if (menu) menu.style.display = 'none';

    if (!navigator.geolocation) {
        if (window.dmAlert) dmAlert('متصفحك لا يدعم تحديد الموقع.');
        else alert('متصفحك لا يدعم تحديد الموقع.');
        return;
    }

    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            });
        });

        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

        await window.dmService.dmSendMessage(threadId, googleMapsUrl);
    } catch (err) {
        console.error('Geolocation error:', err);
        let msg = 'فشل في تحديد الموقع.';
        if (err.code === 1) msg = 'تم رفض الوصول إلى الموقع. يرجى السماح من إعدادات المتصفح.';
        if (err.code === 2) msg = 'الموقع غير متاح حالياً.';
        if (err.code === 3) msg = 'انتهى وقت طلب الموقع.';
        
        if (window.dmAlert) dmAlert(msg);
        else alert(msg);
    }
}

async function dmSendContact(side) {
    const threadId = side === 'admin' ? window._activeThreadId : window._sdmThreadId;
    if (!threadId) {
        if (window.dmAlert) dmAlert('يرجى فتح محادثة أولاً.');
        else alert('يرجى فتح محادثة أولاً.');
        return;
    }

    // Close the attach menu immediately
    const menu = _getEl(side === 'admin' ? 'dm-admin-attach-menu' : 'dm-student-attach-menu');
    if (menu) menu.style.display = 'none';

    // Must be served over HTTPS for Contacts API
    if (!('contacts' in navigator && 'ContactsManager' in window)) {
        if (window.dmAlert) dmAlert('جهازك أو متصفحك لا يدعم مشاركة جهات الاتصال.');
        else alert('جهازك أو متصفحك لا يدعم مشاركة جهات الاتصال.');
        return;
    }

    const props = ['name', 'tel', 'email'];
    const opts = { multiple: false };

    try {
        const contacts = await navigator.contacts.select(props, opts);
        if (contacts && contacts.length > 0) {
            const contact = contacts[0];
            const name = contact.name ? contact.name[0] : 'جهة اتصال';
            let vCardContent = `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\n`;
            
            if (contact.tel && contact.tel.length > 0) {
                 vCardContent += `TEL;TYPE=CELL:${contact.tel[0]}\n`;
            }
            if (contact.email && contact.email.length > 0) {
                 vCardContent += `EMAIL:${contact.email[0]}\n`;
            }
            vCardContent += `END:VCARD`;

            // Create a blob and upload the vCard to Supabase
            const file = new File([vCardContent], `${name}.vcf`, { type: 'text/vcard' });
            
            _showFilePreviewModal(file, side, async () => {
                const url = await window.dmService.dmUploadFile(file);
                if (url) {
                    await window.dmService.dmSendMessage(threadId, url);
                } else {
                    throw new Error('فشل رفع جهة الاتصال');
                }
            });
        }
    } catch (err) {
        console.error('Contact picker error:', err);
        // Exclude cancel errors from alerting the user
        if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
             if (window.dmAlert) dmAlert('حدث خطأ أثناء محاولة جلب جهة الاتصال.');
             else alert('حدث خطأ أثناء محاولة جلب جهة الاتصال.');
        }
    }
}


// ─── MEDIA VIEW OVERLAY ──────────────────────────────────────
function _categorizeMessage(msg) {
    const content = (msg.content || '').trim();
    const result = { links: [], documents: [], media: [] };

    if (!content) return result;

    // URL message
    if (content.startsWith('http') || content.startsWith('/')) {
        const url = content;
        const lowUrl = url.toLowerCase().split('?')[0];
        if (lowUrl.match(/\.(jpeg|jpg|gif|png|webp|svg|bmp)$/)) {
            result.media.push({ type: 'image', url, msg });
        } else if (lowUrl.match(/\.(mp4|webm|mov|avi|mkv)$/)) {
            result.media.push({ type: 'video', url, msg });
        } else if (lowUrl.match(/\.(mp3|wav|ogg|webm|m4a)$/) || lowUrl.includes('voice_')) {
            result.media.push({ type: 'audio', url, msg });
        } else if (lowUrl.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt)$/)) {
            const name = url.split('/').pop().split('?')[0] || 'مستند';
            result.documents.push({ url, name, msg });
        } else {
            result.links.push({ url, msg });
        }
        return result;
    }

    // Text: extract URLs
    const urlRe = /https?:\/\/[^\s]+/g;
    const matches = content.match(urlRe);
    if (matches) {
        matches.forEach(url => result.links.push({ url: url.replace(/[.,;:!?)]+$/, ''), msg }));
    }
    return result;
}

async function _showMediaModal(side) {
    const threadId = side === 'admin' ? window._activeThreadId : window._sdmThreadId;
    if (!threadId) {
        alert('يرجى فتح محادثة أولاً.');
        return;
    }

    const menu = _getEl(side === 'admin' ? 'dm-admin-menu' : 'dm-student-menu');
    if (menu) menu.style.display = 'none';

    document.getElementById('dm-media-modal')?.remove();

    let messages = [];
    try {
        messages = await window.dmService.dmGetMessages(threadId);
    } catch (e) {
        console.error('dmMediaOpen fetch:', e);
        if (window.dmAlert) dmAlert('فشل تحميل الرسائل.');
        else alert('فشل تحميل الرسائل.');
        return;
    }

    const allLinks = [];
    const allDocs = [];
    const allMedia = [];
    messages.forEach(msg => {
        const cat = _categorizeMessage(msg);
        allLinks.push(...cat.links);
        allDocs.push(...cat.documents);
        allMedia.push(...cat.media);
    });

    const modal = document.createElement('div');
    modal.id = 'dm-media-modal';
    modal.style.cssText = `
        position:fixed;inset:0;z-index:9999;
        background:rgba(0,0,0,.75);backdrop-filter:blur(8px);
        display:flex;align-items:center;justify-content:center;padding:20px;
    `;

    const renderEmpty = (msg) =>
        `<div class="dm-media-empty"><i class="fas fa-folder-open"></i><p>${msg}</p></div>`;

    const renderLinks = () => {
        if (allLinks.length === 0) return renderEmpty('لا توجد روابط في هذه المحادثة');
        return allLinks.map(({ url }) => `
            <a href="${url}" target="_blank" rel="noopener" class="dm-media-link">
                <i class="fas fa-link"></i>
                <span>${url.length > 50 ? url.slice(0, 50) + '...' : url}</span>
                <i class="fas fa-external-link-alt"></i>
            </a>
        `).join('');
    };

    const renderDocs = () => {
        if (allDocs.length === 0) return renderEmpty('لا توجد مستندات في هذه المحادثة');
        return allDocs.map(({ url, name }) => `
            <a href="${url}" target="_blank" rel="noopener" class="dm-media-doc">
                <i class="fas fa-file-lines"></i>
                <span>${name}</span>
                <i class="fas fa-download"></i>
            </a>
        `).join('');
    };

    const renderMedia = () => {
        if (allMedia.length === 0) return renderEmpty('لا توجد وسائط في هذه المحادثة');
        return allMedia.map(({ type, url }) => {
            if (type === 'image') {
                return `<a href="${url}" target="_blank" class="dm-media-item"><img src="${url}" alt=""></a>`;
            }
            if (type === 'video') {
                return `<div class="dm-media-item"><video src="${url}" controls></video></div>`;
            }
            if (type === 'audio') {
                return `<div class="dm-media-item"><audio src="${url}" controls></audio></div>`;
            }
            return '';
        }).join('');
    };

    const tabStyle = (active) => `
        padding:10px 18px;border:none;background:${active ? 'rgba(124,111,224,.2)' : 'transparent'};
        color:var(--text-1);font-size:14px;font-weight:600;cursor:pointer;
        border-radius:var(--r-sm);transition:all .2s;
    `;

    modal.innerHTML = `
        <div class="dm-media-modal-box" style="
            background:var(--bg-2);border:1px solid var(--glass-border);border-radius:20px;
            width:min(520px,100%);max-height:85vh;display:flex;flex-direction:column;
            box-shadow:0 24px 80px rgba(0,0,0,.6);
        ">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--glass-border)">
                <span style="font-size:16px;font-weight:700;color:var(--text-1)">
                    <i class="fas fa-photo-film" style="margin-inline-end:8px;color:var(--purple-light)"></i>
                    الوسائط والملفات
                </span>
                <button id="dm-media-close" style="width:36px;height:36px;border-radius:50%;background:var(--glass-2);border:1px solid var(--glass-border);
                    color:var(--text-2);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px">
                    <i class="fas fa-xmark"></i>
                </button>
            </div>
            <div style="display:flex;gap:8px;padding:12px 20px;border-bottom:1px solid var(--glass-border);flex-shrink:0">
                <button id="dm-media-tab-links" class="dm-media-tab" data-tab="links" style="${tabStyle(false)}">
                    <i class="fas fa-link"></i> الروابط
                </button>
                <button id="dm-media-tab-docs" class="dm-media-tab" data-tab="docs" style="${tabStyle(false)}">
                    <i class="fas fa-file-lines"></i> المستندات
                </button>
                <button id="dm-media-tab-media" class="dm-media-tab" data-tab="media" style="${tabStyle(false)}">
                    <i class="fas fa-image"></i> الوسائط
                </button>
            </div>
            <div id="dm-media-content" style="flex:1;overflow-y:auto;padding:20px;min-height:120px">
                <div id="dm-media-panel-links" class="dm-media-panel" style="display:none">
                    <div class="dm-media-list">${renderLinks()}</div>
                </div>
                <div id="dm-media-panel-docs" class="dm-media-panel" style="display:none">
                    <div class="dm-media-list">${renderDocs()}</div>
                </div>
                <div id="dm-media-panel-media" class="dm-media-panel" style="display:none">
                    <div class="dm-media-grid">${renderMedia()}</div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Tab switching
    const tabs = modal.querySelectorAll('.dm-media-tab');
    const panels = {
        links: _getEl('dm-media-panel-links'),
        docs: _getEl('dm-media-panel-docs'),
        media: _getEl('dm-media-panel-media')
    };

    const showTab = (tabId) => {
        tabs.forEach(t => {
            t.style.background = t.dataset.tab === tabId ? 'rgba(124,111,224,.2)' : 'transparent';
        });
        Object.entries(panels).forEach(([k, el]) => {
            if (el) el.style.display = k === tabId ? 'block' : 'none';
        });
    };

    const defaultTab = allMedia.length > 0 ? 'media' : (allDocs.length > 0 ? 'docs' : 'links');
    showTab(defaultTab);
    tabs.forEach(t => {
        t.style.background = t.dataset.tab === defaultTab ? 'rgba(124,111,224,.2)' : 'transparent';
        t.onclick = () => showTab(t.dataset.tab);
    });

    const close = () => modal.remove();
    _getEl('dm-media-close').onclick = close;
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
}

window.dmMediaOpen = (side) => _showMediaModal(side);
window.dmClearChat = async (side) => {
    const threadId = side === 'admin' ? window._activeThreadId : window._sdmThreadId;
    if (!threadId) {
        alert('يرجى فتح محادثة أولاً.');
        return;
    }

    if (window.dmConfirm) {
        const ok = await dmConfirm('هل أنت متأكد من مسح جميع الرسائل في هذه المحادثة؟', 'مسح المحادثة', { isDanger: true });
        if (!ok) return;
    } else {
        if (!confirm('هل أنت متأكد من مسح جميع الرسائل في هذه المحادثة؟')) return;
    }

    const msgContainerId = side === 'admin' ? 'dm-admin-messages' : 'sdm-messages';

    try {
        await window.dmService.dmClearThreadMessages(threadId);
        const container = _getEl(msgContainerId);
        if (container) container.innerHTML = '';
        const menu = _getEl(side === 'admin' ? 'dm-admin-menu' : 'dm-student-menu');
        if (menu) menu.style.display = 'none';
    } catch (err) {
        console.error('Clear chat err:', err);
        if (window.dmAlert) dmAlert('فشل مسح المحادثة');
        else alert('فشل مسح المحادثة');
    }
};
// ─── SAFE LINK CONFIRMATION ──────────────────────────────────
window.confirmSafeLink = function (url, e) {
    if (e) e.preventDefault();

    // Remove existing
    document.getElementById('dm-link-confirm-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'dm-link-confirm-modal';
    modal.style.cssText = `
        position:fixed;inset:0;z-index:10000;
        background:rgba(0,0,0,.7);backdrop-filter:blur(10px);
        display:flex;align-items:center;justify-content:center;padding:20px;
        animation: dmFadeIn 0.2s ease;
    `;

    modal.innerHTML = `
        <div style="background:var(--bg-1);border:1px solid var(--glass-border);border-radius:24px;
            width:min(400px,100%);padding:24px;box-shadow:0 32px 100px rgba(0,0,0,.7);text-align:center;">
            
            <div style="width:64px;height:64px;background:rgba(124,111,224,0.15);border-radius:50%;
                display:flex;align-items:center;justify-content:center;margin:0 auto 20px">
                <i class="fas fa-shield-halved" style="font-size:28px;color:var(--purple-light)"></i>
            </div>

            <h3 style="color:var(--text-1);margin-bottom:12px;font-size:18px;font-weight:800">تنبيه أمان</h3>
            
            <p style="color:var(--text-2);font-size:14px;line-height:1.6;margin-bottom:20px">
                أنت على وشك مغادرة المنصة والانتقال إلى رابط خارجي:<br>
                <span style="color:var(--cyan);word-break:break-all;font-weight:600;display:block;margin-top:8px">${url}</span>
            </p>

            <div style="display:flex;gap:12px">
                <button id="dm-link-cancel" style="flex:1;padding:12px;border-radius:12px;background:var(--glass-2);
                    border:1px solid var(--glass-border);color:var(--text-2);font-weight:600;cursor:pointer;transition:all .2s">
                    إلغاء
                </button>
                <button id="dm-link-go" style="flex:2;padding:12px;border-radius:12px;background:linear-gradient(135deg,var(--purple),var(--cyan));
                    border:none;color:#fff;font-weight:700;cursor:pointer;transition:all .2s">
                    انتقال الآن
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    document.getElementById('dm-link-cancel').onclick = close;
    document.getElementById('dm-link-go').onclick = () => {
        window.open(url, '_blank', 'noopener,noreferrer');
        close();
    };
    modal.onclick = (ev) => { if (ev.target === modal) close(); };
};

/**
 * Detects HTTP links and wraps them in a span with onclick="confirmSafeLink"
 * Automatically escapes HTML for safety.
 */
window.dmDetectLinks = function (text) {
    if (!text) return '';
    // Escape HTML first
    let escaped = window.dmEscapeHTML(text);

    const urlPattern = /(https?:\/\/[^\s<]+)/g;
    return escaped.replace(urlPattern, (url) => {
        // Clean URL from trailing punctuation often caught in regex
        const cleanUrl = url.replace(/[.,;:!?)]+$/, '');
        return `<a href="${cleanUrl}" class="dm-inline-link" onclick="window.confirmSafeLink('${cleanUrl}', event)" style="color:var(--cyan);text-decoration:underline;cursor:pointer">${cleanUrl}</a>`;
    });
};

/**
 * Robust HTML escaping
 */
window.dmEscapeHTML = function (text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function (m) { return map[m]; });
};

/**
 * Image Popup Modal - Opens a large view of images with a premium UI
 */
window.dmOpenImageModal = function (url) {
    if (!url) return;
    // Remove existing if any
    document.getElementById('dm-image-popup-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'dm-image-popup-overlay';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 11000;
        background: rgba(8, 8, 16, 0.9); backdrop-filter: blur(15px);
        display: flex; flex-direction: column; 
        animation: dmFadeIn 0.3s var(--ease-out); opacity: 1;
    `;

    const fileName = url.split('/').pop().split('?')[0] || 'Image';

    overlay.innerHTML = `
        <div class="dm-img-modal-header" style="height: 70px; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; background: rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.08); backdrop-filter: blur(5px);">
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 40px; height: 40px; border-radius: 10px; background: var(--glass-2); display: flex; align-items: center; justify-content: center; color: var(--cyan);">
                    <i class="fas fa-image"></i>
                </div>
                <div style="display: flex; flex-direction: column;">
                    <span style="color: #fff; font-size: 14px; font-weight: 700;">عرض الصورة</span>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <button id="dm-img-dl-btn" style="height: 40px; padding: 0 16px; border-radius: 10px; background: rgba(86, 207, 178, 0.1); border: 1px solid rgba(86, 207, 178, 0.2); color: var(--cyan); cursor: pointer; font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 8px; transition: all 0.2s;">
                    <i class="fas fa-download"></i>
                    <span>تحميل</span>
                </button>
                <button id="dm-img-close-btn" style="width: 40px; height: 40px; border-radius: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; transition: all 0.2s;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
        <div class="dm-img-modal-body" style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 30px; position: relative; overflow: hidden;">
            <div style="position: absolute; inset: 0; cursor: zoom-out;" id="dm-img-bg-close"></div>
            <img src="${url}" style="max-width: 100%; max-height: 100%; border-radius: 12px; 
                box-shadow: 0 40px 100px rgba(0,0,0,0.8); border: 1px solid rgba(255,255,255,0.1);
                z-index: 1; transition: transform 0.3s var(--ease-out);" id="dm-preview-img">
        </div>
        <div id="dm-dl-status" style="position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%) translateY(100px); 
            background: rgba(86, 207, 178, 0.9); backdrop-filter: blur(10px); color: #000; 
            padding: 12px 24px; border-radius: 12px; font-weight: 700; font-size: 14px; 
            box-shadow: 0 10px 30px rgba(0,0,0,0.3); transition: all 0.3s var(--ease-out); z-index: 12000; 
            display: flex; align-items: center; gap: 10px; opacity: 0;">
            <i class="fas fa-check-circle"></i>
            <span>بدأ تحميل الصورة بنجاح ...</span>
        </div>
    `;

    document.body.appendChild(overlay);

    const close = () => {
        overlay.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
        overlay.style.opacity = '0';
        overlay.style.transform = 'scale(1.02)';
        setTimeout(() => overlay.remove(), 250);
    };

    overlay.querySelector('#dm-img-bg-close').onclick = close;
    overlay.querySelector('#dm-img-close-btn').onclick = close;

    // Direct Download Logic (prevents new tab)
    const dlBtn = overlay.querySelector('#dm-img-dl-btn');
    dlBtn.onclick = async () => {
        try {
            dlBtn.style.opacity = '0.5';
            dlBtn.style.pointerEvents = 'none';

            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);

            // Show confirmation toast
            const status = overlay.querySelector('#dm-dl-status');
            status.style.opacity = '1';
            status.style.transform = 'translateX(-50%) translateY(0)';
            setTimeout(() => {
                status.style.opacity = '0';
                status.style.transform = 'translateX(-50%) translateY(100px)';
            }, 3000);

        } catch (err) {
            console.error('Download error:', err);
            if (window.dmAlert) dmAlert('عذراً، تعذر تحميل الصورة مباشرة. قد يكون السبب قيود المتصفح.');
            else alert('عذراً، تعذر تحميل الصورة مباشرة. قد يكون السبب قيود المتصفح.');
            window.open(url, '_blank'); // fallback
        } finally {
            dlBtn.style.opacity = '1';
            dlBtn.style.pointerEvents = 'auto';
        }
    };

    dlBtn.onmouseover = () => { dlBtn.style.background = 'rgba(86, 207, 178, 0.15)'; dlBtn.style.transform = 'translateY(-1px)'; };
    dlBtn.onmouseout = () => { dlBtn.style.background = 'rgba(86, 207, 178, 0.1)'; dlBtn.style.transform = 'translateY(0)'; };

    // Close on Escape
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            close();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
};

// (dmAlert & dmConfirm removed, moved to dm_modals.js)
