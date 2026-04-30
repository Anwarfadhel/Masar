/* ============================================================
   School ID Generator — نظام توليد معرف المدرسة التلقائي
   يعتمد على: window.yemenSchools (schools_data.js)
   ============================================================ */

(function () {
    'use strict';

    // ─── رموز المحافظات (3 أحرف إنجليزية) ────────────────────────
    const GOVERNORATE_CODES = {
        'أمانة العاصمة': 'SAN',
        'عدن':            'ADN',
        'تعز':            'TAZ',
        'إب':             'IBB',
        'الحديدة':        'HOD',
        'حضرموت':         'HAD',
        'مأرب':           'MAR',
        'صعدة':           'SAD',
        'عمران':          'AMR',
        'ذمار':           'DHA',
        'البيضاء':        'BAY',
        'شبوة':           'SHA',
        'المهرة':         'MAH',
        'لحج':            'LAH',
        'أبين':           'ABY',
        'الضالع':         'DAL',
        'ريمة':           'RAY',
        'حجة':            'HAJ',
        'الجوف':          'JOF',
        'المحويت':        'MAW',
    };

    // ─── رموز نوع المدرسة ─────────────────────────────────────────
    const SCHOOL_TYPE_CODES = {
        'حكومي': 'GOV',
        'أهلي':  'PRI',
    };

    // ─── توليد checksum من النص ───────────────────────────────────
    function generateChecksum(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const c = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + c;
            hash |= 0; // تحويل إلى 32-bit integer
        }
        return Math.abs(hash % 10000).toString().padStart(4, '0');
    }

    // ─── بناء معرف المدرسة ────────────────────────────────────────
    /**
     * الصيغة: SCH-{GOV}-{TYPE}-{XXXX}
     * مثال:   SCH-SAN-GOV-4291
     */
    function buildSchoolId(governorate, directorate, schoolType, schoolName) {
        const govCode  = GOVERNORATE_CODES[governorate]
            ?? governorate.replace(/\s+/g, '').substring(0, 3).toUpperCase();
        const typeCode = SCHOOL_TYPE_CODES[schoolType] ?? 'SCH';
        const seed     = `${governorate}|${directorate}|${schoolType}|${schoolName}`;
        const checksum = generateChecksum(seed);
        return `SCH-${govCode}-${typeCode}-${checksum}`;
    }

    // ─── ملء قائمة منسدلة ────────────────────────────────────────
    function populateSelect(selectEl, options, placeholder) {
        selectEl.innerHTML = `<option value="" disabled selected>${placeholder}</option>`;
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt;
            o.textContent = opt;
            selectEl.appendChild(o);
        });
        selectEl.disabled = (options.length === 0);
    }

    // ─── تحريك مؤشرات الخطوات ────────────────────────────────────
    /**
     * stepIndex: 0-3 (0=محافظة, 1=مديرية, 2=نوع, 3=اسم)
     * تُلوّن كل الخطوات حتى stepIndex بلون var(--purple)
     */
    function updateStepIndicators(stepIndex) {
        const steps = document.querySelectorAll('.sid-step');
        steps.forEach((el, i) => {
            if (i <= stepIndex) {
                el.style.background = 'var(--purple)';
                el.style.opacity    = '1';
            } else {
                el.style.background = 'rgba(255,255,255,0.1)';
                el.style.opacity    = '0.6';
            }
        });
    }

    // ─── عرض / إخفاء معاينة المعرف ────────────────────────────────
    function showPreview(previewEl, copyBtn, id) {
        if (!previewEl) return;
        previewEl.dataset.id = id;
        const idSpan = previewEl.querySelector('.sid-generated-id');
        if (idSpan) idSpan.textContent = id;
        previewEl.classList.add('visible');
        if (copyBtn) copyBtn.style.display = 'flex';
    }

    function resetPreview(previewEl, copyBtn) {
        if (!previewEl) return;
        delete previewEl.dataset.id;
        previewEl.classList.remove('visible');
        if (copyBtn) copyBtn.style.display = 'none';
        // تعطيل زر الإرسال
        const submitBtn = document.getElementById('sid-submit-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
            delete submitBtn.dataset.generatedId;
            delete submitBtn.dataset.schoolName;
        }
    }

    // ─── تأثير pulse على حقل القائمة التالي ─────────────────────
    function pulseNextSelect(selectEl) {
        if (!selectEl || selectEl.disabled) return;
        selectEl.style.borderColor = 'var(--purple)';
        selectEl.style.boxShadow   = '0 0 0 3px rgba(124,111,224,0.25)';
        setTimeout(() => {
            selectEl.style.borderColor = '';
            selectEl.style.boxShadow   = '';
        }, 1200);
    }

    // ─── مستمع مشترك: أيقونة اتجاه السهم عند فتح القائمة ─────────
    function attachChevronListeners(selectEl, wrapperEl) {
        const chevron = wrapperEl?.querySelector('.sid-chevron');
        if (!chevron) return;
        selectEl.addEventListener('focus', () => {
            chevron.style.transform = 'rotate(180deg)';
        });
        selectEl.addEventListener('blur', () => {
            chevron.style.transform = '';
        });
    }

    // ─── المهيئ الرئيسي ──────────────────────────────────────────
    function initSchoolIdModal() {
        const data = window.yemenSchools;
        if (!data) {
            console.warn('[SchoolIdGenerator] window.yemenSchools غير متاح بعد.');
            // إعادة المحاولة بعد 300ms إذا لم يتحمل الملف بعد
            setTimeout(initSchoolIdModal, 300);
            return;
        }

        // ─ مراجع العناصر
        const selGov    = document.getElementById('sid-governorate');
        const selDir    = document.getElementById('sid-directorate');
        const selType   = document.getElementById('sid-school-type');
        const selName   = document.getElementById('sid-school-name');
        const preview   = document.getElementById('sid-id-preview');
        const copyBtn   = document.getElementById('sid-copy-btn');
        const submitBtn = document.getElementById('sid-submit-btn');

        if (!selGov) return; // النافذة غير موجودة في هذه الصفحة

        // ─ ربط مستمعي السهم
        [selGov, selDir, selType, selName].forEach(sel => {
            attachChevronListeners(sel, sel?.parentElement);
        });

        // ─ ملء المحافظات
        const governorates = Object.keys(data);
        populateSelect(selGov, governorates, 'اختر المحافظة');
        updateStepIndicators(-1); // لا خطوة مكتملة بعد

        // ══ الحدث: اختيار المحافظة ══
        selGov.addEventListener('change', () => {
            const gov = selGov.value;
            const dirs = Object.keys(data[gov] || {}).filter(d => d && d.trim() !== '');

            populateSelect(selDir,  dirs, 'اختر المديرية');
            populateSelect(selType, [],   'اختر نوع المدرسة');
            populateSelect(selName, [],   'اختر اسم المدرسة');

            selDir.disabled  = (dirs.length === 0);
            selType.disabled = true;
            selName.disabled = true;

            resetPreview(preview, copyBtn);
            updateStepIndicators(0);
            pulseNextSelect(selDir);
        });

        // ══ الحدث: اختيار المديرية ══
        selDir.addEventListener('change', () => {
            const gov  = selGov.value;
            const dir  = selDir.value;
            const types = Object.keys(data[gov]?.[dir] || {}).filter(t => {
                return t && (data[gov][dir][t]?.length > 0);
            });

            populateSelect(selType, types, 'اختر نوع المدرسة');
            populateSelect(selName, [],    'اختر اسم المدرسة');

            selType.disabled = (types.length === 0);
            selName.disabled = true;

            resetPreview(preview, copyBtn);
            updateStepIndicators(1);
            pulseNextSelect(selType);
        });

        // ══ الحدث: اختيار نوع المدرسة ══
        selType.addEventListener('change', () => {
            const gov   = selGov.value;
            const dir   = selDir.value;
            const type  = selType.value;
            const names = data[gov]?.[dir]?.[type] || [];

            populateSelect(selName, names, 'اختر اسم المدرسة');
            selName.disabled = (names.length === 0);

            resetPreview(preview, copyBtn);
            updateStepIndicators(2);
            pulseNextSelect(selName);
        });

        // ══ الحدث: اختيار اسم المدرسة → توليد المعرف ══
        selName.addEventListener('change', () => {
            const gov  = selGov.value;
            const dir  = selDir.value;
            const type = selType.value;
            const name = selName.value;

            if (gov && dir && type && name) {
                const id = buildSchoolId(gov, dir, type, name);
                showPreview(preview, copyBtn, id);
                updateStepIndicators(3); // جميع الخطوات مكتملة

                // تخزين المعرف واسم المدرسة في dataset الزر للاستخدام عند الإرسال
                if (submitBtn) {
                    submitBtn.dataset.generatedId = id;
                    submitBtn.dataset.schoolName  = name;
                    submitBtn.disabled = false;
                }
            }
        });

        // ══ زر النسخ ══
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const id = preview?.dataset?.id;
                if (!id) return;
                navigator.clipboard.writeText(id).then(() => {
                    copyBtn.innerHTML = '<i class="fas fa-check"></i>';
                    copyBtn.style.color = '#28c76f';
                    setTimeout(() => {
                        copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
                        copyBtn.style.color = '';
                    }, 2000);
                }).catch(err => console.warn('Clipboard error:', err));
            });
        }
    }

    // ─── واجهة برمجية عامة ───────────────────────────────────────
    window.schoolIdGenerator = {
        /** تهيئة النافذة (تُستدعى من admin.js) */
        init: initSchoolIdModal,
        /** توليد معرف برمجياً (للاختبار أو الاستخدام الخارجي) */
        buildSchoolId,
    };

})();
