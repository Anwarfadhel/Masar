/**
 * dm_modals.js
 * Unified custom modal system (dmAlert & dmConfirm)
 */

(function() {
    // Inject styles
    if (!document.getElementById('dm-modals-style')) {
        const style = document.createElement('style');
        style.id = 'dm-modals-style';
        style.textContent = `
            .dm-modal-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.6);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                z-index: 15000;
                padding: 20px;
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: 'Cairo', sans-serif;
            }
            .dm-modal-overlay.active {
                opacity: 1;
                visibility: visible;
            }
            .dm-modal {
                background: #0a0a1e;
                border: 1px solid rgba(255, 255, 255, 0.09);
                border-radius: 20px;
                width: min(400px, 100%);
                padding: 28px;
                box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
                transform: translateY(20px) scale(0.95);
                transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                text-align: center;
                color: #f0f0f8;
            }
            .dm-modal-overlay.active .dm-modal {
                transform: translateY(0) scale(1);
            }
            .dm-modal-icon {
                width: 60px;
                height: 60px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.04);
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 16px;
                font-size: 24px;
                color: #9d93e8;
            }
            .dm-modal-title {
                font-size: 19px;
                font-weight: 800;
                margin-bottom: 10px;
            }
            .dm-modal-msg {
                font-size: 15px;
                color: rgba(240, 240, 248, 0.65);
                line-height: 1.6;
                margin-bottom: 28px;
            }
            .dm-modal-btns {
                display: flex;
                gap: 12px;
            }
            .dm-modal-btn {
                flex: 1;
                padding: 13px;
                border-radius: 12px;
                font-size: 14px;
                font-weight: 700;
                transition: all 0.2s;
                cursor: pointer;
                border: none;
                font-family: inherit;
                outline: none;
            }
            .dm-modal-btn.cancel {
                background: rgba(255, 255, 255, 0.07);
                border: 1px solid rgba(255, 255, 255, 0.09);
                color: rgba(240, 240, 248, 0.65);
            }
            .dm-modal-btn.cancel:hover {
                background: rgba(255, 255, 255, 0.11);
                color: #f0f0f8;
            }
            .dm-modal-btn.confirm {
                background: linear-gradient(135deg, #7c6fe0, #56cfb2);
                color: #fff;
                box-shadow: 0 4px 15px rgba(124, 111, 224, 0.3);
            }
            .dm-modal-btn.confirm:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(124, 111, 224, 0.4);
            }
            .dm-modal-btn.danger {
                background: linear-gradient(135deg, #e06fa0, #ff4d4d);
                color: #fff;
            }
            .dm-modal-btn.danger:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(224, 111, 160, 0.4);
            }
        `;
        document.head.appendChild(style);
    }

    function _createDMModal() {
        let overlay = document.getElementById('dm-modal-overlay');
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = 'dm-modal-overlay';
        overlay.className = 'dm-modal-overlay';
        overlay.innerHTML = `
            <div class="dm-modal">
                <div class="dm-modal-icon" id="dm-modal-icon">
                    <i class="fas fa-circle-info"></i>
                </div>
                <div class="dm-modal-title" id="dm-modal-title">تنبيه</div>
                <div class="dm-modal-msg" id="dm-modal-msg">...</div>
                <div class="dm-modal-btns" id="dm-modal-btns">
                    <button class="dm-modal-btn cancel" id="dm-modal-cancel">إلغاء</button>
                    <button class="dm-modal-btn confirm" id="dm-modal-confirm">موافق</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.onclick = (e) => {
            if (e.target === overlay) {
                const cancelBtn = document.getElementById('dm-modal-cancel');
                if (cancelBtn && cancelBtn.style.display !== 'none') cancelBtn.click();
                else document.getElementById('dm-modal-confirm')?.click();
            }
        };
        return overlay;
    }

    window.dmAlert = function(message, title = 'تنبيه', icon = 'fa-circle-info') {
        const overlay = _createDMModal();
        const titleEl = document.getElementById('dm-modal-title');
        const msgEl = document.getElementById('dm-modal-msg');
        const iconEl = document.getElementById('dm-modal-icon');
        const cancelBtn = document.getElementById('dm-modal-cancel');
        const confirmBtn = document.getElementById('dm-modal-confirm');

        titleEl.innerText = title;
        msgEl.innerText = message;
        iconEl.innerHTML = `<i class="fas ${icon}"></i>`;
        cancelBtn.style.display = 'none';
        confirmBtn.innerText = 'حسناً';
        confirmBtn.className = 'dm-modal-btn confirm';

        overlay.classList.add('active');

        return new Promise((resolve) => {
            confirmBtn.onclick = () => {
                overlay.classList.remove('active');
                resolve();
            };
        });
    };

    window.dmConfirm = function(message, title = 'تأكيد', options = {}) {
        const overlay = _createDMModal();
        const titleEl = document.getElementById('dm-modal-title');
        const msgEl = document.getElementById('dm-modal-msg');
        const iconEl = document.getElementById('dm-modal-icon');
        const cancelBtn = document.getElementById('dm-modal-cancel');
        const confirmBtn = document.getElementById('dm-modal-confirm');

        const {
            okText = 'موافق',
            cancelText = 'إلغاء',
            icon = 'fa-circle-question',
            isDanger = false
        } = options;

        titleEl.innerText = title;
        msgEl.innerText = message;
        iconEl.innerHTML = `<i class="fas ${icon}"></i>`;
        cancelBtn.style.display = 'block';
        cancelBtn.innerText = cancelText;
        confirmBtn.innerText = okText;
        confirmBtn.className = isDanger ? 'dm-modal-btn danger' : 'dm-modal-btn confirm';

        overlay.classList.add('active');

        return new Promise((resolve) => {
            confirmBtn.onclick = () => {
                overlay.classList.remove('active');
                resolve(true);
            };
            cancelBtn.onclick = () => {
                overlay.classList.remove('active');
                resolve(false);
            };
        });
    };
})();
