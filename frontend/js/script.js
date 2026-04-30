/* ============================================
   Smart Path — Main Application Script
   Tabs | Sidebar | Chat | Discover | Library
   ============================================ */

// ==========================================
// i18n Translations
// ==========================================
const i18n = {
    ar: {
        brand: "مسار",
        langLabel: "English",
        logout: "تسجيل الخروج",
        newChat: "محادثة جديدة",
        noHistory: "لا توجد محادثات بعد. ابدأ أول محادثة الآن!",
        today: "اليوم",
        yesterday: "أمس",
        older: "أقدم",
        welcomeGreeting: "أهلاً، {name} 👋",
        welcomeSubtitle: "مساعدك المهني الذكي لاكتشاف التخصص الأكاديمي المناسب لك",
        startBtn: "ابدأ المحادثة",
        tabHome: "الرئيسية",
        tabDiscover: "التوصيات",
        tabLibrary: "المكتبة",
        discoverTitle: "التوصيات ✨",
        discoverSubtitle: "نتائج تحليل مساراتك المهنية",
        noRecs: "لا توجد توصيات بعد",
        noRecsHint: "أكمل محادثة في تبويب الرئيسية وسيظهر التقرير هنا",
        libraryTitle: "المكتبة 📚",
        librarySubtitle: "الصور والتقارير المحفوظة",
        noImages: "المكتبة فارغة",
        noImagesHint: "الصور التي تُولّدها أو ترفعها ستظهر هنا",
        placeholder: "اكتب إجابتك هنا...",
        processing: "جاري تحليل بياناتك...",
        firstMsg: "مرحبًا 👋 ما اسمك؟",
        reportBadge: "تقرير تحليل أكاديمي",
        printBtn: "طباعة التقرير",
        primaryLabel: "التوصية الأساسية",
        secondaryLabel: "التوصية البديلة",
        explanationLabel: "لماذا هذا التخصص؟",
        skillsLabel: "المهارات المطلوبة",
        roadmapLabel: "خارطة الطريق المهنية",
        viewDetails: "عرض التفاصيل",
        viewRec: "عرض التوصية الكاملة",
        rename: "إعادة التسمية",
        delete: "حذف",
        deleteConfirm: "هل تريد حذف هذه المحادثة؟",
        chatTitle: "محادثة جديدة",
        toastDeleted: "تم حذف المحادثة",
        toastRenamed: "تم تغيير الاسم",
        toastError: "حدث خطأ، يرجى المحاولة مجدداً",
        toastSaved: "تم حفظ التوصية في قسم التوصيات",
        errorLoad: "فشل تحميل الرسائل",
        loading: "جاري التحميل...",
        noMessages: "لا توجد رسائل في هذه المحادثة بعد.",
        clarifyingMsg: "بالطبع! دعني أشرح لك السؤال بطريقة أوضح...",
        sendError: "تعذّر إرسال الرسالة. تحقق من اتصالك وحاول مجدداً.",
    },
    en: {
        brand: "Masar",
        langLabel: "عربي",
        logout: "Sign Out",
        newChat: "New Chat",
        noHistory: "No conversations yet. Start your first chat now!",
        today: "Today",
        yesterday: "Yesterday",
        older: "Older",
        welcomeGreeting: "Hello, {name} 👋",
        welcomeSubtitle: "Your AI career advisor to discover the right academic major for you",
        startBtn: "Start Conversation",
        tabHome: "Home",
        tabDiscover: "Discover",
        tabLibrary: "Library",
        discoverTitle: "Recommendations ✨",
        discoverSubtitle: "Results from your career path analysis",
        noRecs: "No recommendations yet",
        noRecsHint: "Complete a chat session and your report will appear here",
        libraryTitle: "Library 📚",
        librarySubtitle: "Your saved images and reports",
        noImages: "Library is empty",
        noImagesHint: "Images you generate or upload will appear here",
        placeholder: "Type your answer here...",
        processing: "Analyzing your data...",
        firstMsg: "Hello 👋 What is your name?",
        reportBadge: "Academic Analysis Report",
        printBtn: "Print Report",
        primaryLabel: "Primary Recommendation",
        secondaryLabel: "Alternative Recommendation",
        explanationLabel: "Why this major?",
        skillsLabel: "Required Skills",
        roadmapLabel: "Career Roadmap",
        viewDetails: "View Details",
        viewRec: "View Full Recommendation",
        rename: "Rename",
        delete: "Delete",
        deleteConfirm: "Delete this conversation?",
        chatTitle: "New Chat",
        toastDeleted: "Conversation deleted",
        toastRenamed: "Renamed successfully",
        toastError: "An error occurred. Please try again.",
        toastSaved: "Recommendation saved to Discover",
        errorLoad: "Failed to load messages",
        loading: "Loading...",
        noMessages: "No messages in this conversation yet.",
        clarifyingMsg: "Of course! Let me explain the question more clearly...",
        sendError: "Failed to send message. Check your connection and try again.",
    }
};

// ==========================================
// Smart Memory Layer (localStorage)
// ==========================================
class UserMemory {
    constructor(userId) {
        this.key = `masar_memory_${userId}`;
        this.data = JSON.parse(localStorage.getItem(this.key) || '{}');
    }
    get(field) { return this.data[field]; }
    set(field, value) {
        this.data[field] = value;
        this.data._lastUpdated = new Date().toISOString();
        localStorage.setItem(this.key, JSON.stringify(this.data));
    }
    getAll() { return { ...this.data }; }
    toPromptContext() {
        const known = Object.entries(this.data)
            .filter(([k]) => !k.startsWith('_'))
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n');
        return known ? known : '';
    }
    clearSessionData() {
        const name = this.data.name;
        this.data = {};
        if (name) this.data.name = name;
        this.data._lastUpdated = new Date().toISOString();
        localStorage.setItem(this.key, JSON.stringify(this.data));
    }
}
let memory = null; // initialized after login

// ==========================================
// Guided Questions — School Track (11 Questions)
// With Local Validators + Auto-Comments (API Saver)
// ==========================================

// ── Helper: pick a random item from an array ──
function randomPick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ── Helper: get next question text (with name replacement) ──
function getNextQuestionText(stepOverride) {
    const step = stepOverride !== undefined ? stepOverride : currentStep;
    if (step >= questions.length) return '';
    const q = questions[step];
    const nameVal = userData.name || memory?.get('name') || '';
    return (q[currentLang] || q.ar).replace('{name}', nameVal);
}

// ── Helper: auto-send the next question without LLM ──
function autoSendNextQuestion(prefixComment) {
    if (currentStep >= questions.length) {
        generateRecommendation();
        return;
    }

    // Smart Skip: study_track for grade 9/10
    if (questions[currentStep].key === 'study_track') {
        const gradeVal = userData['grade_level'] || '';
        if (/تاسع|تسع|9|أول.?ثانوي|اول.?ثانوي|10/i.test(gradeVal)) {
            userData['study_track'] = 'غير محدد (مرحلة أساسية/أول ثانوي)';
            if (memory) memory.set('study_track', userData['study_track']);
            currentStep++;
        }
    }

    if (currentStep >= questions.length) {
        generateRecommendation();
        return;
    }

    const qText = getNextQuestionText();

    // Show attachment button always
    const btnAttach = document.getElementById('btn-attachment');
    if (btnAttach) {
        btnAttach.style.display = 'flex';
    }

    const fullMsg = prefixComment ? `${prefixComment}\n\n${qText}` : qText;

    // Small delay for natural feel
    setTimeout(() => {
        renderMessage('assistant', fullMsg);
        saveMsg('assistant', fullMsg);
    }, 400);

    syncStepToServer();
}

const questions = [
    {
        key: "grade_level",
        ar: "أهلاً {name}! 😊 أنت حالياً في أي صف؟ (تاسع، أول ثانوي، ثاني ثانوي، ثالث ثانوي)",
        en: "Hello {name}! 😊 What grade are you in? (Grade 9, 10, 11, or 12)",
        positiveComments: {
            ar: ["ممتاز يا بطل! 💪", "تمام يا غالي! 👏", "حلو، مرحلة مهمة جداً! 🌟", "يا سلام، الله يوفقك! 🎯", "حلو أنك هنا في هذي المرحلة! 😊"],
            en: ["Great! 💪", "Awesome! 👏", "Nice, that's an important stage! 🌟", "Wonderful! 🎯", "Great to have you here! 😊"]
        },
        localValidator: (input) => {
            const map = [
                { pattern: /تاسع|تسع|9|ninth|grade.?9/i, value: 'تاسع' },
                { pattern: /أول.?ثانوي|اول.?ثانوي|10|tenth|grade.?10|أولى|اولى/i, value: 'أول ثانوي' },
                { pattern: /ثاني.?ثانوي|تاني.?ثانوي|11|eleventh|grade.?11/i, value: 'ثاني ثانوي' },
                { pattern: /ثالث.?ثانوي|تالت.?ثانوي|12|twelfth|grade.?12|توجيهي/i, value: 'ثالث ثانوي' }
            ];
            for (const m of map) {
                if (m.pattern.test(input)) return { valid: true, extracted: m.value };
            }
            return { valid: false };
        },
        reaskMessage: {
            ar: "ممكن توضح لي في أي صف أنت؟ (تاسع، أول ثانوي، ثاني ثانوي، أو ثالث ثانوي) 😊",
            en: "Could you clarify which grade you're in? (9th, 10th, 11th, or 12th) 😊"
        }
    },
    {
        key: "study_track",
        ar: "هل أنت في القسم العلمي أم الأدبي؟ (وإذا ما حددت بعد، قولي)",
        en: "Are you in the Science or Arts track? (If not decided yet, let me know)",
        positiveComments: {
            ar: ["تمام! 👍", "ممتاز، قسم حلو! 🎯", "حلو يا بطل! 💪", "اختيار رائع! ✨", "تمام، فهمت عليك! 😊"],
            en: ["Got it! 👍", "Nice track! 🎯", "Great choice! 💪", "Wonderful! ✨", "Understood! 😊"]
        },
        localValidator: (input) => {
            if (/علمي|science|علوم|ساينس/i.test(input)) return { valid: true, extracted: 'علمي' };
            if (/أدبي|ادبي|arts|أداب|آداب/i.test(input)) return { valid: true, extracted: 'أدبي' };
            if (/ما حدد|لسه|مو متأكد|not sure|undecided|ما عرف/i.test(input)) return { valid: true, extracted: 'غير محدد بعد' };
            return { valid: false };
        },
        reaskMessage: {
            ar: "هل أنت في القسم العلمي أم الأدبي؟ أو إذا ما حددت بعد قولي 😊",
            en: "Are you in Science or Arts track? Or haven't decided yet? 😊"
        }
    },
    {
        key: "subjects_love",
        ar: "إيش المواد اللي تحبها وتستمتع فيها؟ 💪 حتى لو ما تجيب فيها درجات عالية",
        en: "Which subjects do you enjoy? 💪 Even if your grades aren't the highest in them",
        positiveComments: {
            ar: ["يا سلام، اختيارات حلوة! 🤩", "ذوقك رائع في المواد! 👏", "ممتاز، هذي مواد مهمة! 💪", "حلو يا بطل، واضح إنك تعرف نفسك! 🌟", "اختيارات تدل على شخصية مميزة! ✨", "والله ذوق! هذي مواد ممتعة فعلاً 😊"],
            en: ["Nice choices! 🤩", "Great taste in subjects! 👏", "Those are important subjects! 💪", "You clearly know yourself! 🌟", "Interesting choices! ✨", "Those are really fun subjects! 😊"]
        },
        localValidator: (input) => {
            // Accept if input has at least 2 Arabic/English characters (a real word)
            const cleaned = input.replace(/[^\u0600-\u06FFa-zA-Z\s]/g, '').trim();
            if (cleaned.length >= 3) return { valid: true, extracted: input.trim() };
            return { valid: false };
        },
        reaskMessage: {
            ar: "قولي إيش المواد اللي تستمتع فيها؟ مثلاً رياضيات، علوم، عربي... 😊",
            en: "Which subjects do you enjoy? For example: Math, Science, Arabic... 😊"
        }
    },
    {
        key: "subjects_strong",
        ar: "وإيش المواد اللي درجاتك فيها عالية فعلاً؟",
        en: "And which subjects do you actually score high in?",
        positiveComments: {
            ar: ["ما شاء الله عليك! 🔥", "درجات عالية تدل على اجتهادك! 💪", "ممتاز يا بطل! 👏", "مبدع! هذي نقاط قوتك 🌟", "يا سلام، شاطر! ✨", "تبارك الله عليك! 😊"],
            en: ["Impressive! 🔥", "High scores show your dedication! 💪", "Excellent! 👏", "These are your strengths! 🌟", "Well done! ✨", "Amazing! 😊"]
        },
        localValidator: (input) => {
            const cleaned = input.replace(/[^\u0600-\u06FFa-zA-Z\s]/g, '').trim();
            if (cleaned.length >= 3) return { valid: true, extracted: input.trim() };
            return { valid: false };
        },
        reaskMessage: {
            ar: "إيش المواد اللي درجاتك فيها عالية؟ مثلاً فيزياء، كيمياء، إنجليزي... 😊",
            en: "Which subjects do you score high in? Like Physics, Chemistry, English... 😊"
        }
    },
    {
        key: "subjects_weak",
        ar: "وإيش المواد اللي تحس إنها صعبة عليك؟ (عادي، كلنا كذا 😄)",
        en: "Which subjects do you find difficult? (It's okay, we all have those 😄)",
        positiveComments: {
            ar: ["عادي يا بطل، كلنا عندنا مواد صعبة! 😊", "لا تقلق، هذا طبيعي جداً 💪", "شكراً على صراحتك! 👏", "ولا يهمك، المهم نعرف ونتعامل معها 🌟", "ما في أحد كامل، وهذا يساعدني أفهمك أكثر ✨"],
            en: ["That's totally normal! 😊", "Don't worry, we all have tough subjects! 💪", "Thanks for being honest! 👏", "No worries, this helps me understand you better 🌟", "Nobody's perfect, and that's okay! ✨"]
        },
        localValidator: (input) => {
            const cleaned = input.replace(/[^\u0600-\u06FFa-zA-Z\s]/g, '').trim();
            if (cleaned.length >= 3) return { valid: true, extracted: input.trim() };
            return { valid: false };
        },
        reaskMessage: {
            ar: "إيش المواد اللي تحس إنها صعبة عليك؟ عادي لا تستحي 😄",
            en: "Which subjects are difficult for you? It's totally okay! 😄"
        }
    },
    {
        key: "grades",
        ar: "كم نسبتك التقريبية في آخر فصل؟ (ممكن ترفق صورة الشهادة وأحللها لك 👍)",
        en: "What was your approximate percentage last semester? (You can attach your report card 👍)",
        positiveComments: {
            ar: ["شكراً! هذي معلومة مهمة جداً 📊", "تمام، فهمت مستواك! 👍", "ممتاز يا بطل، هذا يساعدني كثير! 💪", "حلو، شكراً على المعلومة! 📈", "نسبة حلوة، الله يوفقك! 🌟"],
            en: ["Thanks! This is very helpful 📊", "Got it! 👍", "Great, this helps a lot! 💪", "Thanks for sharing! 📈", "Nice score! 🌟"]
        },
        localValidator: (input) => {
            // Accept numbers, percentages, or descriptive grades
            if (/\d{1,3}\s*%?/.test(input)) return { valid: true, extracted: input.trim() };
            if (/ممتاز|جيد|متوسط|ضعيف|excellent|good|average|pass|مقبول|جيد جداً/i.test(input)) return { valid: true, extracted: input.trim() };
            return { valid: false };
        },
        reaskMessage: {
            ar: "كم نسبتك التقريبية؟ مثلاً 85% أو ممتاز 😊 (أو ارفق صورة الشهادة)",
            en: "What's your approximate percentage? Like 85% or Excellent 😊 (or attach your report card)"
        }
    },
    {
        key: "hobbies",
        ar: "بعيداً عن الدراسة، إيش تحب تسوي بوقت فراغك؟ 🎮🎨⚽",
        en: "Outside of school, what do you enjoy doing? 🎮🎨⚽",
        positiveComments: {
            ar: ["هوايات حلوة ما شاء الله! 🎮", "ممتاز، الهوايات تكشف كثير عن شخصيتك! 🌟", "يا سلام، تبان شخصية مميزة! ✨", "حلو يا بطل، هذي تساعدني أعرفك أكثر! 💪", "اهتمامات رائعة! 😊", "ذوقك في الهوايات يدل على إبداع! 🎨"],
            en: ["Great hobbies! 🎮", "Hobbies reveal a lot about your personality! 🌟", "You seem like a unique person! ✨", "This helps me know you better! 💪", "Wonderful interests! 😊", "Your hobbies show creativity! 🎨"]
        },
        localValidator: (input) => {
            const cleaned = input.replace(/[^\u0600-\u06FFa-zA-Z\s]/g, '').trim();
            if (cleaned.length >= 3) return { valid: true, extracted: input.trim() };
            return { valid: false };
        },
        reaskMessage: {
            ar: "قولي إيش تسوي بوقت فراغك؟ ألعاب، رياضة، رسم، قراءة...؟ 🎮🎨⚽",
            en: "What do you do in your free time? Games, sports, drawing, reading...? 🎮🎨⚽"
        }
    },
    {
        key: "personality_type",
        ar: "هل تحب تشتغل لحالك أو مع فريق؟ وهل تفضل الشغل الفكري أو اليدوي؟",
        en: "Do you prefer working alone or in a team? And do you prefer thinking work or hands-on work?",
        positiveComments: {
            ar: ["فهمت شخصيتك أكثر الحين! 🧠", "معلومة ذهبية يا بطل! ✨", "ممتاز، هذا يساعدني أوجهك صح! 🎯", "حلو، كل شخص وله طريقته! 💡", "شكراً على صراحتك! 👏"],
            en: ["Now I understand your personality better! 🧠", "Golden info! ✨", "This helps me guide you right! 🎯", "Everyone has their own style! 💡", "Thanks for being open! 👏"]
        },
        localValidator: (input) => {
            const cleaned = input.replace(/[^\u0600-\u06FFa-zA-Z\s]/g, '').trim();
            if (cleaned.length >= 3) return { valid: true, extracted: input.trim() };
            return { valid: false };
        },
        reaskMessage: {
            ar: "هل تحب تشتغل لحالك أو مع ناس؟ وتفضل التفكير أو الشغل العملي؟ 🧠🔧",
            en: "Do you prefer working alone or with others? Thinking or hands-on? 🧠🔧"
        }
    },
    {
        key: "role_model",
        ar: "هل في شخص تتطلع له أو مهنة شفتها وقلت 'يا ليتني أكون كذا'؟",
        en: "Is there someone you look up to or a career you saw and thought 'I wish I could do that'?",
        positiveComments: {
            ar: ["يا سلام، طموح حلو! 🚀", "قدوة ممتازة ما شاء الله! 🌟", "حلم جميل يا بطل! ✨", "ذوقك رائع في اختيار القدوة! 💪", "إن شاء الله توصل وأكثر! 🎯"],
            en: ["What a great aspiration! 🚀", "Excellent role model! 🌟", "Beautiful dream! ✨", "Great taste in role models! 💪", "You'll get there and beyond! 🎯"]
        },
        localValidator: (input) => {
            const cleaned = input.replace(/[^\u0600-\u06FFa-zA-Z\s]/g, '').trim();
            if (cleaned.length >= 2) return { valid: true, extracted: input.trim() };
            // Also accept "لا" / "no" as valid
            if (/^(لا|no|مافي|ما في|مو|نو)$/i.test(input.trim())) return { valid: true, extracted: 'لا يوجد قدوة محددة' };
            return { valid: false };
        },
        reaskMessage: {
            ar: "هل في شخص تحبه أو مهنة تحلم فيها؟ حتى لو مجرد فكرة بسيطة 😊",
            en: "Is there someone you admire or a career you dream of? Even a simple idea 😊"
        }
    },
    {
        key: "family_influence",
        ar: "هل أهلك يتوقعون منك تخصص معين؟ أو أنت حر في اختيارك؟",
        en: "Do your parents expect a specific major from you? Or are you free to choose?",
        positiveComments: {
            ar: ["فهمت الوضع! شكراً على صراحتك 🙏", "معلومة مهمة يا بطل! 👍", "تمام، هذا يساعدني أفهم ظروفك! 💡", "حلو إنك تشاركني هذي المعلومة! 😊", "ممتاز، خليني آخذ هذا بالاعتبار! 🎯"],
            en: ["Got it! Thanks for being honest 🙏", "Important info! 👍", "This helps me understand your situation! 💡", "Thanks for sharing! 😊", "Great, I'll keep this in mind! 🎯"]
        },
        localValidator: (input) => {
            const cleaned = input.replace(/[^\u0600-\u06FFa-zA-Z\s]/g, '').trim();
            if (cleaned.length >= 2) return { valid: true, extracted: input.trim() };
            if (/^(لا|no|نعم|yes|اي|ايه|حر|free)$/i.test(input.trim())) return { valid: true, extracted: input.trim() };
            return { valid: false };
        },
        reaskMessage: {
            ar: "هل أهلك يتوقعون تخصص معين؟ أو أنت حر تختار؟ 😊",
            en: "Do your parents expect a specific major? Or are you free to choose? 😊"
        }
    },
    {
        key: "career_dream",
        ar: "لو تخيلت نفسك بعد 10 سنوات، وين تشوف نفسك وإيش تسوي؟ 🚀",
        en: "If you imagine yourself in 10 years, where do you see yourself and what are you doing? 🚀",
        positiveComments: {
            ar: ["طموح رائع ما شاء الله! 🚀", "يا سلام، حلم جميل! 🌟", "إن شاء الله يتحقق وأكثر! ✨", "رؤية واضحة يا بطل! 💪", "ممتاز، هذا اللي كنت أحتاج أعرفه! 🎯", "طموحك يدل على شخصية قيادية! 👏"],
            en: ["What a great ambition! 🚀", "Beautiful dream! 🌟", "I hope it comes true and more! ✨", "Clear vision! 💪", "Great, this is exactly what I needed! 🎯", "Your ambition shows leadership! 👏"]
        },
        localValidator: (input) => {
            const cleaned = input.replace(/[^\u0600-\u06FFa-zA-Z\s]/g, '').trim();
            if (cleaned.length >= 3) return { valid: true, extracted: input.trim() };
            return { valid: false };
        },
        reaskMessage: {
            ar: "تخيل نفسك بعد 10 سنوات، وين تشوف نفسك؟ إيش تتمنى تكون؟ 🚀",
            en: "Imagine yourself in 10 years — where do you see yourself? What do you wish to be? 🚀"
        }
    }
];

// ==========================================
// Clarification Trigger Phrases
// ==========================================
const CLARIFICATION_PHRASES = [
    // Arabic
    'ما فهمت', 'مافهمت', 'ما فاهم', 'مافاهم', 'ما افتهم',
    'ما افتهمت', 'ما افتهم السؤال',
    'اشرح', 'وضح', 'وضح لي', 'اشرح لي', 'شرح لي',
    'ما افهم', 'مافهم', 'لم افهم', 'لم افتهم',
    'ما وضح', 'غير واضح', 'غير مفهوم', 'ما عرفت اش',
    'علمني', 'وضح اكثر',
    // English
    'i don\'t understand', 'i dont understand', 'don\'t understand', 'dont understand',
    'explain', 'clarify', 'what do you mean', 'what does that mean',
    'i\'m confused', 'im confused', 'confused', 'not clear',
    'elaborate', 'can you explain', 'please explain', 'help me understand'
];

// ==========================================
// App State
// ==========================================
let currentLang = localStorage.getItem('sp_lang') || 'ar';

// ── Dynamic user_label based on user type selection ──
function getUserLabel() {
    const spType = localStorage.getItem('sp_user_type');
    return spType === 'post_study' ? 'post_school' : 'school_student';
}
let currentUser = null;
let currentChatId = null;
let currentStep = 0;
let userData = {};
let activeTab = 'home';
let lastRec = null;
let activeContextMenu = null;
let isSending = false;       // prevents double-send during async operations
let isCreatingChat = false;  // prevents race condition during chat creation
let clarifyingStep = false;  // true when bot is re-explaining a guided question
let isRecommendationCompleted = false; // tracks if the data gathering phase is over
let _activeSessionHistory = []; // Gen-2: DB-sourced message history for current session

// ── Session State: يتبع الخطوة الحالية وآخر سؤال للعودة إليه ──
let sessionState = {
    currentStep: 0,
    lastQuestion: '',        // آخر سؤال طرحه الـ AI (للعودة إليه بعد الأسئلة الجانبية)
    collectedKeys: []        // مفاتيح البيانات التي تم جمعها
};


// Swipe Logic State
let touchStartX = 0;
let touchStartY = 0;
let touchCurrentX = 0;
let isSwiping = false;
let startTransform = 0;
let containerWidth = 0;
const tabsOrder = ['home', 'discover', 'library'];
let dotsTimeout = null;

// ==========================================
// INIT
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    applyLang();
    // Immediate personalization if cache exists
    if (localStorage.getItem('sp_user_meta')) applyUserInfo(null);

    await initSupabase();
    if (!supabaseClient) {
        window.location.href = '/auth/login.html';
        return;
    }

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        // Allow visitor mode but set up basic UI listeners
        setupEventListeners();
        initSwipeNavigation();
        return;
    }

    currentUser = session.user;
    applyUserInfo(currentUser);

    // ── Initialize Smart Memory ──
    memory = new UserMemory(currentUser.id);
    // Auto-store name from auth metadata if not already in memory
    if (!memory.get('name')) {
        const meta = currentUser.user_metadata || {};
        const autoName = meta.full_name || currentUser.email?.split('@')[0] || '';
        if (autoName) memory.set('name', autoName);
    }

    // --- COMBINED PROFILE CHECK (school_id + role in one query) ---
    try {
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('user_type, school_id, role')
            .eq('id', currentUser.id)
            .single();
        if (profile) {
            // School ID onboarding check
            if (profile.user_type === 'school' && !profile.school_id) {
                const modal = document.getElementById('school-id-modal');
                if (modal) {
                    modal.classList.remove('hidden');
                    document.body.style.overflow = 'hidden';
                }
            } else {
                document.body.style.overflow = '';
            }
            // Admin panel button visibility
            if (profile.role === 'admin') {
                const adminBtn = document.getElementById('btn-admin-panel');
                if (adminBtn) adminBtn.style.display = 'flex';
            }
        }
    } catch (e) { console.warn('Profile check failed:', e); }

    // Initialize local database
    await window.dbService.initDB();

    fetchSidebarHistory();
    fetchRecommendations();
    fetchLibrary();
    setupEventListeners();
    initSwipeNavigation(); // Initialize Swipe Navigation

    // Show DM icon and refresh unread badge (skip for post_study)
    const dmBtn = document.getElementById('btn-dm-open');
    let userType = localStorage.getItem('sp_user_type');

    // If logged in and userType is missing (e.g., first login or cleared cache), fetch from profile
    if (currentUser && !userType) {
        try {
            const { data: profile } = await supabaseClient
                .from('profiles')
                .select('user_type, role')
                .eq('id', currentUser.id)
                .single();
            if (profile) {
                userType = profile.user_type || profile.role;
                if (userType) localStorage.setItem('sp_user_type', userType);
            }
        } catch (e) { console.warn('User type fetch failed:', e); }
    }

    if (dmBtn) {
        if (userType === 'post_study') {
            dmBtn.style.display = 'none';
        } else {
            dmBtn.style.display = 'flex';
            setTimeout(() => {
                if (typeof refreshStudentBadge === 'function') refreshStudentBadge();
            }, 800);
        }
    }

    supabaseClient?.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
            window.location.href = '/auth/login.html';
        }
    });
});

// ==========================================
// LANGUAGE
// ==========================================
function toggleLang() {
    currentLang = currentLang === 'ar' ? 'en' : 'ar';
    localStorage.setItem('sp_lang', currentLang);
    applyLang();
    if (currentUser) applyUserInfo(currentUser);
}

function t(key) { return i18n[currentLang][key] || key; }

function applyLang() {
    const isAr = currentLang === 'ar';
    document.documentElement.setAttribute('lang', currentLang);
    document.documentElement.setAttribute('dir', isAr ? 'rtl' : 'ltr');

    const set = (id, key) => { const el = document.getElementById(id); if (el) el.textContent = t(key); };
    set('t-brand', 'brand');
    set('t-lang-label', 'langLabel');
    set('t-logout', 'logout');
    set('t-new-chat', 'newChat');
    set('t-no-history', 'noHistory');
    set('t-welcome-subtitle', 'welcomeSubtitle');
    set('t-start-btn', 'startBtn');
    set('t-tab-home', 'tabHome');
    set('t-tab-discover', 'tabDiscover');
    set('t-tab-library', 'tabLibrary');
    set('t-sidebar-home', 'tabHome');
    set('t-sidebar-discover', 'tabDiscover');
    set('t-sidebar-library', 'tabLibrary');
    set('t-discover-title', 'discoverTitle');
    set('t-discover-subtitle', 'discoverSubtitle');
    set('t-no-recs', 'noRecs');
    set('t-no-recs-hint', 'noRecsHint');
    set('t-library-title', 'libraryTitle');
    set('t-library-subtitle', 'librarySubtitle');
    set('t-no-images', 'noImages');
    set('t-no-images-hint', 'noImagesHint');
    set('t-processing', 'processing');
    set('t-report-badge', 'reportBadge');
    set('t-print-btn', 'printBtn');
    set('t-primary-label', 'primaryLabel');
    set('t-secondary-label', 'secondaryLabel');
    set('t-explanation-label', 'explanationLabel');
    set('t-skills-label', 'skillsLabel');
    set('t-roadmap-label', 'roadmapLabel');

    const ph = document.getElementById('chat-textarea');
    if (ph) ph.placeholder = t('placeholder');
    const chatTitle = document.getElementById('chat-title');
    if (chatTitle && !currentChatId) chatTitle.textContent = t('chatTitle');
}

function applyUserInfo(user) {
    const cachedMeta = localStorage.getItem('sp_user_meta');
    const cachedEmail = localStorage.getItem('sp_user_email');

    let meta = user ? user.user_metadata : (cachedMeta ? JSON.parse(cachedMeta) : {});
    let email = user ? user.email : cachedEmail;

    const guestName = currentLang === 'ar' ? 'صديقنا' : 'Friend';
    const name = meta?.full_name || email?.split('@')[0] || guestName;
    const greeting = t('welcomeGreeting').replace('{name}', name);
    const el = document.getElementById('greeting-text');
    if (el) el.textContent = greeting;
    const ddName = document.getElementById('dd-user-name');
    if (ddName) ddName.textContent = name;
    const ddEmail = document.getElementById('dd-user-email');
    if (ddEmail) ddEmail.textContent = email || '...';
    const avatarEl = document.getElementById('user-avatar-img');
    if (avatarEl) avatarEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=7c6fe0&color=fff&size=72`;
}

// ==========================================
// EVENT LISTENERS
// ==========================================
function setupEventListeners() {
    // Send button
    document.getElementById('btn-send')?.addEventListener('click', handleSend);

    // Filter attachments button
    const btnAttachment = document.getElementById('btn-attachment');
    const attachmentMenu = document.getElementById('attachment-menu');
    const fileUploadImage = document.getElementById('file-upload-image');
    const fileUploadCamera = document.getElementById('file-upload-camera');

    if (btnAttachment && attachmentMenu) {
        btnAttachment.addEventListener('click', (e) => {
            e.stopPropagation();
            attachmentMenu.classList.toggle('open');
            btnAttachment.classList.toggle('active');
        });

        document.getElementById('btn-upload-image')?.addEventListener('click', (e) => {
            e.stopPropagation();
            fileUploadImage?.click();
            attachmentMenu.classList.remove('open');
            btnAttachment.classList.remove('active');
        });

        document.getElementById('btn-take-photo')?.addEventListener('click', (e) => {
            e.stopPropagation();
            fileUploadCamera?.click();
            attachmentMenu.classList.remove('open');
            btnAttachment.classList.remove('active');
        });

        // Close menu on outside click
        document.addEventListener('click', (e) => {
            if (!attachmentMenu.contains(e.target) && e.target !== btnAttachment) {
                attachmentMenu.classList.remove('open');
                btnAttachment.classList.remove('active');
            }
        });

        // Handle file selection
        fileUploadImage?.addEventListener('change', handleImageSelection);
        fileUploadCamera?.addEventListener('change', handleImageSelection);
    }

    // Textarea Enter
    document.getElementById('chat-textarea')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });

    // Auto resize textarea
    document.getElementById('chat-textarea')?.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 140) + 'px';
    });

    // Hide bottom nav when typing on mobile (virtual keyboard)
    const chatInput = document.getElementById('chat-textarea');
    const bottomNav = document.querySelector('.bottom-nav');
    const mainContent = document.querySelector('.main-content');
    let blurTimeout;
    if (chatInput && bottomNav) {
        chatInput.addEventListener('focus', () => {
            if (blurTimeout) clearTimeout(blurTimeout);
            if (window.innerWidth <= 768) {
                bottomNav.style.display = 'none';
                if (mainContent) mainContent.style.bottom = '0';
            }
        });
        chatInput.addEventListener('blur', () => {
            // Delay showing bottom nav to allow 'click' events on buttons to fire first
            blurTimeout = setTimeout(() => {
                if (window.innerWidth <= 768) {
                    bottomNav.style.display = '';
                    if (mainContent) mainContent.style.bottom = '';
                }
            }, 150);
        });
    }

    // User dropdown toggle
    document.getElementById('btn-user-avatar')?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('user-dropdown').classList.toggle('open');
    });
    document.addEventListener('click', () => {
        document.getElementById('user-dropdown')?.classList.remove('open');
        if (activeContextMenu) { activeContextMenu.remove(); activeContextMenu = null; }
    });

    // Delete current chat
    document.getElementById('btn-delete-chat')?.addEventListener('click', () => {
        if (currentChatId) deleteConversation(currentChatId, true);
    });

    // Sidebar open/close (toggle with hamburger/X)
    const sidebarBtn = document.getElementById('btn-open-sidebar');
    if (sidebarBtn) {
        sidebarBtn.addEventListener('click', () => {
            const sidebar = document.getElementById('sidebar');
            if (sidebar.classList.contains('open')) closeSidebar();
            else openSidebar();
        });
    }

    // Header Chat Rename
    document.getElementById('btn-edit-chat-name')?.addEventListener('click', () => {
        if (!currentChatId) return;

        const titleEl = document.getElementById('chat-title');
        const oldTitle = titleEl.textContent;

        const input = document.createElement('input');
        input.className = 'header-rename-input';
        input.value = oldTitle;
        titleEl.replaceWith(input);
        input.focus();
        input.select();

        // Hide edit button while editing
        const editBtn = document.getElementById('btn-edit-chat-name');
        editBtn.style.display = 'none';

        const finish = async () => {
            const newTitle = input.value.trim() || oldTitle;
            const span = document.createElement('span');
            span.className = 'chat-header-title';
            span.id = 'chat-title';
            span.textContent = newTitle;
            input.replaceWith(span);
            editBtn.style.display = 'flex'; // Restore button

            if (newTitle !== oldTitle) {
                try {
                    await window.dbService.updateLocalConversationTitle(currentChatId, newTitle);
                    showToast(t('toastRenamed'), 'success');
                    fetchSidebarHistory(); // update the sidebar to reflect the new name
                } catch { showToast(t('toastError'), 'error'); }
            }
        };
        input.addEventListener('blur', finish);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') input.blur();
            if (e.key === 'Escape') {
                input.value = oldTitle; // cancel
                input.blur();
            }
        });
    });
}

// ==========================================
// TABS & SWIPE NAVIGATION
// ==========================================
function showDots() {
    const dots = document.getElementById('dots-container');
    if (!dots) return;
    if (dotsTimeout) clearTimeout(dotsTimeout);
    dots.classList.add('active');
}

function hideDots(delay = 600) {
    const dots = document.getElementById('dots-container');
    if (!dots) return;
    if (dotsTimeout) clearTimeout(dotsTimeout);
    dotsTimeout = setTimeout(() => {
        dots.classList.remove('active');
        dotsTimeout = null;
    }, delay);
}

async function switchTab(name, btn) {
    if (name !== 'home') {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            window.location.href = '/auth/login.html';
            return;
        }
    }
    const prevTab = activeTab;
    const isRTL = document.documentElement.dir === 'rtl';
    const index = tabsOrder.indexOf(name);
    const container = document.getElementById('page-container');

    // Show indicators temporarily
    showDots();

    // Close attachment menu if open
    if (typeof toggleAttachmentMenu === 'function') {
        const menu = document.getElementById('attachment-menu');
        const btn = document.getElementById('btn-attachment');
        if (menu && menu.classList.contains('open')) {
            menu.classList.remove('open');
            if (btn) btn.classList.remove('active');
        }
    }

    // Deactivate all
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.bottom-nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.sidebar-nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.dot').forEach(i => i.classList.remove('active'));

    // Activate target
    const panel = document.getElementById(`tab-${name}`);
    if (panel) panel.classList.add('active');

    // Sync button states (both bottom nav and sidebar)
    document.querySelectorAll(`.bottom-nav-btn[data-tab="${name}"], .sidebar-nav-item[data-tab="${name}"]`).forEach(b => b.classList.add('active'));

    // Sync indicator
    document.querySelector(`.dot[data-tab="${name}"]`)?.classList.add('active');

    activeTab = name;

    // Apply translation to container
    if (container) {
        const offset = index * 100;
        container.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
        container.style.transform = isRTL ? `translateX(${offset}vw)` : `translateX(-${offset}vw)`;

        // Hide dots after transition finishes + delay
        hideDots(1000);
    } else {
        hideDots();
    }

    // Refresh data on switch
    if (name === 'discover') fetchRecommendations();
    if (name === 'library') fetchLibrary();

    // Reset to landing view if returning to home from an active chat
    if (name === 'home') {
        const desc = document.getElementById('project-description');
        const chatView = document.getElementById('chat-view');
        if (chatView && desc && !chatView.classList.contains('hidden')) {
            chatView.classList.add('hidden');
            desc.classList.remove('hidden'); // Ensure hidden class is removed
            desc.style.display = 'block';
            desc.style.opacity = '0';
            requestAnimationFrame(() => {
                desc.style.transition = 'opacity 0.4s ease';
                desc.style.opacity = '1';
            });
            currentChatId = null;
            _activeSessionHistory = []; // Gen-2: prevent context leaking
        }
    }

    // Close sidebar on mobile after navigating
    if (window.innerWidth < 1024) closeSidebar();

    // تحسين: Haptic Feedback بنمط مختلف حسب التبويب المختار
    if (prevTab !== name && typeof navigator.vibrate === 'function') {
        if (name === 'home') {
            // اهتزاز خفيف للرئيسية
            navigator.vibrate(8);
        } else {
            // اهتزاز مزدوج للتبويبات الإضافية
            navigator.vibrate([8, 40, 16]);
        }
    }
}

function initSwipeNavigation() {
    return; // Disabled by user request: Navigate only via buttons
}

// ==========================================
// SIDEBAR
// ==========================================
function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('open');
    fetchSidebarHistory();
    updateSidebarToggleIcon(true);
    document.body.classList.add('sidebar-open');
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
    updateSidebarToggleIcon(false);
    document.body.classList.remove('sidebar-open');
}

function handleSidebarNav(tabName) {
    // إذا كانت واجهة شات المشرف مفتوحة، اغلقها أولاً
    try {
        if (typeof closeStudentDM === 'function') {
            const drawer = document.getElementById('student-dm-drawer');
            if (drawer && drawer.classList.contains('open')) {
                closeStudentDM();
            }
        }
    } catch (_) { /* ignore */ }

    // انتقل للتبويب المطلوب
    switchTab(tabName, document.querySelector(`.sidebar-nav-item[data-tab="${tabName}"]`));

    // أغلق السايدبار
    closeSidebar();
}

function updateSidebarToggleIcon(isOpen) {
    const btn = document.getElementById('btn-open-sidebar');
    if (!btn) return;
    const lines = btn.querySelectorAll('.hamburger-line');
    const xIcon = btn.querySelector('.sidebar-toggle-x');
    lines.forEach(line => {
        line.style.display = isOpen ? 'none' : 'block';
    });
    if (xIcon) xIcon.style.display = isOpen ? 'block' : 'none';
}

/**
 * استخراج آخر جملة استفهامية من نص رسالة الـ AI
 * تُستخدم لحفظ آخر سؤال في sessionState.lastQuestion
 */
function extractLastQuestion(text) {
    if (!text) return '';
    // البحث عن آخر جملة تنتهي بعلامة استفهام
    const matches = text.match(/[^.!؟?]*[؟?]/g);
    if (matches && matches.length > 0) {
        return matches[matches.length - 1].trim();
    }
    return '';
}

async function fetchSidebarHistory() {
    if (!currentUser) return;
    const loading = document.getElementById('sidebar-loading');
    const history = document.getElementById('sidebar-history');
    const empty = document.getElementById('sidebar-empty');

    loading.style.display = 'block';
    history.innerHTML = '';
    empty.classList.add('hidden');

    try {
        // ← فلترة المحادثات بناءً على المسار الحالي (عزل البيانات)
        const currentTrack = getUserLabel();
        const data = await window.dbService.getLocalConversations(currentUser.id, currentTrack);
        loading.style.display = 'none';

        if (!data || data.length === 0) {
            empty.classList.remove('hidden');
            return;
        }

        // Group by date
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yest = new Date(today.getTime() - 86400000);

        const groups = { today: [], yesterday: [], older: [] };
        data.forEach(conv => {
            const d = new Date(conv.created_at);
            const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            if (day >= today) groups.today.push(conv);
            else if (day >= yest) groups.yesterday.push(conv);
            else groups.older.push(conv);
        });

        const labels = { today: t('today'), yesterday: t('yesterday'), older: t('older') };
        for (const [group, convs] of Object.entries(groups)) {
            if (!convs.length) continue;
            const section = document.createElement('div');
            section.className = 'history-section';
            section.innerHTML = `<div class="history-section-label">${labels[group]}</div>`;
            convs.forEach(conv => section.appendChild(createHistoryItem(conv)));
            history.appendChild(section);
        }
    } catch (e) {
        loading.style.display = 'none';
        empty.classList.remove('hidden');
    }
}

function createHistoryItem(conv) {
    const item = document.createElement('div');
    item.className = `history-item ${conv.id === currentChatId ? 'active' : ''}`;
    item.dataset.convId = conv.id;
    item.innerHTML = `
    <i class="far fa-message history-item-icon"></i>
    <span class="history-item-title">${escapeHtml(conv.title)}</span>
    <button class="history-item-menu" data-id="${conv.id}" data-title="${escapeHtml(conv.title)}" title="More options">
      <i class="fas fa-ellipsis-vertical"></i>
    </button>
  `;
    item.addEventListener('click', (e) => {
        if (!e.target.closest('.history-item-menu')) {
            loadConversation(conv.id, conv.title);
        }
    });
    item.querySelector('.history-item-menu').addEventListener('click', (e) => {
        e.stopPropagation();
        showContextMenu(e, conv.id, conv.title, item);
    });
    return item;
}

function showContextMenu(e, convId, convTitle, itemEl) {
    if (activeContextMenu) { activeContextMenu.remove(); activeContextMenu = null; }
    const menu = document.createElement('div');
    menu.className = 'context-menu';

    // ── Fix: استخدام getBoundingClientRect() للحصول على الموضع الصحيح على الهاتف
    // e.clientX/Y يكون 0 على بعض متصفحات iOS عند النقر باللمس
    const triggerRect = (e.currentTarget || e.target).getBoundingClientRect();
    let posX = triggerRect.left;
    let posY = triggerRect.bottom + 4;

    // إذا كان هناك قيم صحيحة من الحدث نفسه، نستخدمها
    if (e.clientX && e.clientY && !(e.clientX === 0 && e.clientY === 0)) {
        posX = e.clientX;
        posY = e.clientY;
    }

    menu.style.left = `${posX}px`;
    menu.style.top  = `${posY}px`;
    menu.innerHTML = `
    <button class="context-menu-item" id="ctx-rename">
      <i class="fas fa-pen"></i> ${t('rename')}
    </button>
    <button class="context-menu-item danger" id="ctx-delete">
      <i class="fas fa-trash-alt"></i> ${t('delete')}
    </button>
  `;
    document.body.appendChild(menu);
    activeContextMenu = menu;

    // تصحيح الموضع إذا خرج عن حدود الشاشة بعد الرسم
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right  > window.innerWidth)  menu.style.left = `${posX - menuRect.width}px`;
    if (menuRect.bottom > window.innerHeight) menu.style.top  = `${posY - menuRect.height - 8}px`;

    menu.querySelector('#ctx-rename').addEventListener('click', (ev) => {
        ev.stopPropagation();
        menu.remove(); activeContextMenu = null;
        startRename(itemEl, convId, convTitle);
    });
    menu.querySelector('#ctx-delete').addEventListener('click', (ev) => {
        ev.stopPropagation();
        menu.remove(); activeContextMenu = null;
        deleteConversation(convId, false);
    });
}

function startRename(itemEl, convId, oldTitle) {
    const titleEl = itemEl.querySelector('.history-item-title');
    const input = document.createElement('input');
    input.className = 'rename-input';
    input.value = oldTitle;
    titleEl.replaceWith(input);
    input.focus();
    input.select();

    const finish = async () => {
        const newTitle = input.value.trim() || oldTitle;
        const span = document.createElement('span');
        span.className = 'history-item-title';
        span.textContent = newTitle;
        input.replaceWith(span);
        if (newTitle !== oldTitle) {
            try {
                await window.dbService.updateLocalConversationTitle(convId, newTitle);
                showToast(t('toastRenamed'), 'success');
                if (currentChatId === convId) document.getElementById('chat-title').textContent = newTitle;
            } catch { showToast(t('toastError'), 'error'); }
        }
    };
    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
}

async function deleteConversation(id, isCurrentChat) {
    if (window.dmConfirm) {
        if (!await dmConfirm(t('deleteConfirm'), t('delete'), { isDanger: true })) return;
    } else {
        if (!confirm(t('deleteConfirm'))) return;
    }

    // Remove from DOM immediately for instant feedback
    const itemEl = document.querySelector(`.history-item[data-conv-id="${id}"]`);
    if (itemEl) {
        const section = itemEl.closest('.history-section');
        itemEl.remove();
        // If section is now empty (only the label remains), remove the section too
        if (section && section.querySelectorAll('.history-item').length === 0) {
            section.remove();
        }
        // If sidebar-history is now empty, show empty state
        const historyEl = document.getElementById('sidebar-history');
        if (historyEl && historyEl.innerHTML.trim() === '') {
            document.getElementById('sidebar-empty')?.classList.remove('hidden');
        }
    }

    if (isCurrentChat || currentChatId === id) {
        currentChatId = null;
        currentStep = 0;
        userData = {};
        clarifyingStep = false;
        _activeSessionHistory = []; // Gen-2: clear session history
        document.getElementById('chat-view')?.classList.add('hidden');
        document.getElementById('project-description')?.classList.remove('hidden');
    }

    try {
        await window.dbService.deleteLocalConversation(id);
        showToast(t('toastDeleted'), 'info');
    } catch {
        showToast(t('toastError'), 'error');
    }
    // Background sync to ensure consistency
    fetchSidebarHistory();
}

async function loadConversation(id, title) {
    closeSidebar();

    // Close Student DM drawer if open
    try {
        if (typeof closeStudentDM === 'function') {
            const drawer = document.getElementById('student-dm-drawer');
            if (drawer && drawer.classList.contains('open')) {
                closeStudentDM();
            }
        }
    } catch (_) { }
    if (currentChatId === id) { switchTab('home', document.querySelector('[data-tab="home"]')); return; }

    currentChatId = id;
    currentStep = 99; // safe default — will be overridden by session_metadata below
    clarifyingStep = false;
    userData = {};
    _activeSessionHistory = []; // Gen-2: reset before loading

    // ── Gen-2: Restore session metadata from Supabase ──
    if (memory) memory.clearSessionData();
    try {
        const conv = await window.dbService.getLocalConversation(id);
        if (conv && conv.session_metadata) {
            const meta = conv.session_metadata;
            // Restore the actual step — allows guided flow to resume properly
            const savedStep = meta.current_step;
            if (typeof savedStep === 'number' && savedStep >= 0) {
                currentStep = savedStep;
            } else {
                currentStep = 99; // fallback for legacy conversations
            }
            isRecommendationCompleted = meta.is_recommendation_completed || false;
            // Restore collected userData keys from session
            if (meta.collected_data && Array.isArray(meta.collected_data)) {
                meta.collected_data.forEach(key => {
                    if (memory && memory.get(key)) {
                        userData[key] = memory.get(key);
                    }
                });
            }
            // Restore known_data into memory
            if (meta.known_data && memory) {
                Object.entries(meta.known_data).forEach(([k, v]) => {
                    if (v) memory.set(k, v);
                });
            }
        }
    } catch (e) {
        console.warn('Gen-2: Could not restore session metadata:', e);
    }

    // ── Restore Recommendation Context ──
    try {
        const rec = await window.dbService.getLocalRecommendationByConversationId(id);
        if (rec) {
            isRecommendationCompleted = true;
            // Reconstruct minimal lastRec shape required by the chat prompt builder
            lastRec = {
                student_stage: rec.student_status_tags?.[0] || 'school_student',
                primary_recommendation: {
                    major: rec.primary_major,
                    compatibility_bar: rec.compatibility_score
                }
            };
            try {
                if (rec.admin_executive_summary) {
                    const parsed = JSON.parse(rec.admin_executive_summary);
                    if (parsed.alternative) {
                        lastRec.alternative_recommendation = { major: parsed.alternative };
                    }
                }
            } catch (e) { /* ignore parse error */ }
        } else {
            isRecommendationCompleted = false;
            lastRec = null;
        }
    } catch (e) {
        console.warn("Could not fetch recommendation for this chat", e);
        isRecommendationCompleted = false;
        lastRec = null;
    }

    switchTab('home', document.querySelector('[data-tab="home"]'));
    const projectDescription = document.getElementById('project-description');
    if (projectDescription) projectDescription.classList.add('hidden');
    const chatView = document.getElementById('chat-view');
    if (chatView) chatView.classList.remove('hidden');
    document.getElementById('chat-title').textContent = title;

    const msgs = document.getElementById('chat-messages');
    msgs.innerHTML = `<div class="empty-state" style="padding:40px 20px"><div class="dna-spinner" style="margin:0 auto 12px"></div><p>${t('loading')}</p></div>`;

    try {
        const data = await window.dbService.getLocalMessages(id);
        msgs.innerHTML = '';
        if (!data || data.length === 0) {
            msgs.innerHTML = `<div class="empty-state" style="padding:60px 20px"><div class="empty-state-icon"><i class="fas fa-comment-slash"></i></div><p style="margin-top:12px;opacity:.7">${t('noMessages')}</p></div>`;
        } else {
            // Gen-2: Store full history from DB for AI context
            _activeSessionHistory = data.map(msg => ({
                role: msg.role,
                content: (msg.content && msg.content.startsWith('data:image')) ? '[Image Attached]' : msg.content
            }));

            data.forEach(msg => {
                // Determine if it's an image based on the parameter or contents (starts with data:image)
                const isImage = msg.type === 'image' || (msg.content && msg.content.startsWith('data:image'));
                renderMessage(msg.role, msg.content, false, true, isImage ? 'image' : 'text');
            });
            scrollToBottom();
        }
        updateHistoryActive(id);
    } catch {
        msgs.innerHTML = `<div class="empty-state"><p>${t('errorLoad')}</p></div>`;
    }
}

function updateHistoryActive(id) {
    document.querySelectorAll('.history-item').forEach(el => {
        el.classList.toggle('active', el.dataset.convId === id);
    });
}

// ==========================================
// CHAT
// ==========================================
async function startNewChat() {
    if (isCreatingChat) return; // prevent race condition
    isCreatingChat = true;
    closeSidebar();
    currentChatId = null;
    currentStep = 0;
    userData = {};
    clarifyingStep = false;
    isSending = false;
    isRecommendationCompleted = false;
    _activeSessionHistory = []; // Gen-2: clean slate

    const welcome = document.getElementById('project-description');
    const chatView = document.getElementById('chat-view');
    const msgs = document.getElementById('chat-messages');

    if (welcome) welcome.classList.add('hidden');
    if (chatView) chatView.classList.remove('hidden');
    msgs.innerHTML = '';
    document.getElementById('chat-title').textContent = t('chatTitle');
    updateHistoryActive(null);
    setBtnSendLoading(false);

    // Clear previous chat data from memory so the new chat starts fresh
    if (memory) {
        memory.clearSessionData();
    }

    const isPostSchool = getUserLabel() === 'post_school';
    const userName = memory?.get('name') || '';

    // Gen-2: Build initial session metadata
    const sessionMeta = {
        user_label: getUserLabel(),
        known_data: { name: userName },
        current_step: 0,
        is_recommendation_completed: false
    };

    // Show attachment button for all tracks
    const btnAttach = document.getElementById('btn-attachment');
    if (btnAttach) btnAttach.style.display = 'flex';

    if (isPostSchool) {
        // ── POST-SCHOOL MODE: Free-form AI-driven conversation ──
        currentStep = 0; // Fix: start from 0 so Step Guard works

        setTimeout(async () => {
            // Fix: if user clicked a chat while waiting, abort creating a new one
            if (currentChatId !== null) { isCreatingChat = false; return; }

            await addTypingIndicator();

            // Create conversation in DB with session metadata
            try {
                const title = userName || t('chatTitle');
                const conv = await window.dbService.createLocalConversation(
                    currentUser.id, title, sessionMeta, 'post_school'
                );
                currentChatId = conv.id;
                fetchSidebarHistory();
            } catch {
                // Non-fatal
            }

            // Send initial request with empty history (strict isolation)
            try {
                const data = await apiFetch('/api/chat', {
                    method: 'POST',
                    body: JSON.stringify({
                        text: '[بداية محادثة جديدة]',
                        history: [],
                        conversation_id: currentChatId,
                        language: currentLang,
                        user_label: 'post_school',
                        known_data: memory ? memory.toPromptContext() : '',
                        sub_track: memory?.get('sub_track') || ''
                    })
                });
                removeTypingIndicator();
                const greeting = data.student_message || data.response || `أهلاً ${userName}! هل أنت خريج ثانوية أم طالب جامعي؟`;
                renderMessage('assistant', greeting);
                saveMsg('assistant', greeting);
            } catch {
                removeTypingIndicator();
                const fallback = currentLang === 'ar'
                    ? `أهلاً ${userName}! 👋 أنا مستشارك المهني. هل أنت خريج ثانوية أم طالب جامعي حالياً؟`
                    : `Hello ${userName}! 👋 I'm your career advisor. Are you a high school graduate or a current university student?`;
                renderMessage('assistant', fallback);
                saveMsg('assistant', fallback);
            }

            document.getElementById('chat-textarea')?.focus();
            isCreatingChat = false;
        }, 400);
    } else {
        // ── SCHOOL STUDENT MODE: Guided questions flow ──
        // Auto-set name from memory and set chat title
        if (userName) {
            userData.name = userName;
            document.getElementById('chat-title').textContent = userName;
        }

        setTimeout(async () => {
            // Fix: if user clicked a chat while waiting, abort creating a new one
            if (currentChatId !== null) { isCreatingChat = false; return; }

            await addTypingIndicator();
            removeTypingIndicator();

            // First message: personalized greeting + first question (grade_level)
            let firstMsg = questions[0][currentLang] || questions[0].ar;
            if (userName) firstMsg = firstMsg.replace('{name}', userName);
            else firstMsg = firstMsg.replace('{name}', currentLang === 'ar' ? 'صديقنا' : 'Friend');
            renderMessage('assistant', firstMsg);

            // Create the conversation in DB with session metadata
            try {
                const title = userName || t('chatTitle');
                const conv = await window.dbService.createLocalConversation(
                    currentUser.id, title, sessionMeta, 'school_student'
                );
                currentChatId = conv.id;
                await saveMsg('assistant', firstMsg);
                fetchSidebarHistory();
            } catch {
                // Non-fatal
            }

            document.getElementById('chat-textarea')?.focus();
            isCreatingChat = false;
        }, 400);
    }
}

// ── Send button loading state ──
function setBtnSendLoading(loading) {
    const btn = document.getElementById('btn-send');
    if (!btn) return;
    if (loading) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.style.opacity = '0.7';
    } else {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        btn.style.opacity = '';
    }
}

// ── Detect if user is asking for clarification ──
function isClarificationRequest(text) {
    const normalised = text.trim().toLowerCase();
    return CLARIFICATION_PHRASES.some(phrase => normalised.includes(phrase));
}

// ── Main send handler ──
async function handleSend() {
    if (isSending) return;  // double-send guard

    const ta = document.getElementById('chat-textarea');
    const text = ta?.value?.trim();
    if (!text) return;

    ta.value = '';
    ta.style.height = 'auto';
    ta.focus(); // Keep keyboard open on mobile
    isSending = true;
    setBtnSendLoading(true);

    try {
        // Fallback: create conversation if startNewChat's eager creation failed
        if (!currentChatId) {
            try {
                const title = text.split(' ').slice(0, 5).join(' ') || t('chatTitle');
                const trackType = getUserLabel();
                const sessionMeta = {
                    user_label: trackType,
                    known_data: memory ? memory.toPromptContext() : '',
                    current_step: currentStep,
                    is_recommendation_completed: isRecommendationCompleted
                };
                const conv = await window.dbService.createLocalConversation(currentUser.id, title, sessionMeta, trackType);
                currentChatId = conv.id;
                fetchSidebarHistory();
            } catch {
                showToast(t('sendError'), 'error');
                return;
            }
        }

        renderMessage('user', text);

        // Save user message after currentChatId is guaranteed
        saveMsg('user', text);

        // ── Graduate post-rec flow intercept ──────────────────────────────────
        if (graduatePostRec?.active) {
            const handled = await handleGraduatePostRec(text);
            if (handled) return;
        }

        if (getUserLabel() !== 'post_school' && currentStep < questions.length) {

            // Check if the user is asking for clarification instead of answering
            if (isClarificationRequest(text) && !clarifyingStep) {
                clarifyingStep = true;
                const currentQ = questions[currentStep];
                const questionText = currentQ[currentLang] || currentQ.ar;

                await addTypingIndicator();
                removeTypingIndicator();

                try {
                    const data = await apiFetch('/api/chat', {
                        method: 'POST',
                        body: JSON.stringify({
                            text,
                            currentQuestion: questionText,
                            clarification: true,
                            language: currentLang,
                            user_label: getUserLabel()
                        })
                    });
                    const clarifyMsg = data.student_message || data.response || '';
                    renderMessage('assistant', clarifyMsg);
                    saveMsg('assistant', clarifyMsg);
                    sendSupervisorReportIfPresent(data);
                } catch {
                    const fallback = currentLang === 'ar'
                        ? `دعني أوضح لك السؤال: ${questionText}\n\nحاول الإجابة بكلماتك الخاصة، لا توجد إجابة خاطئة! 😊`
                        : `Let me clarify the question: ${questionText}\n\nTry to answer in your own words — there's no wrong answer! 😊`;
                    renderMessage('assistant', fallback);
                    saveMsg('assistant', fallback);
                }
                // Do NOT advance currentStep — wait for a proper answer
                return;
            }

            // ── Off-topic question detection (Answer + Redirect) ──
            const isOffTopicQ = /[؟?]\s*$/.test(text) ||
                /^(ما هو|ما هي|كيف|ليش|وش يعني|إيش|what is|how|why|what does)/i.test(text);

            if (isOffTopicQ && !['career_dream', 'role_model'].includes(questions[currentStep].key)) {
                const currentQ = questions[currentStep];
                const questionText = currentQ[currentLang] || currentQ.ar;
                let qTextClean = questionText.replace('{name}', userData.name || '');

                await addTypingIndicator();
                try {
                    const data = await apiFetch('/api/chat', {
                        method: 'POST',
                        body: JSON.stringify({
                            text,
                            currentQuestion: qTextClean,
                            off_topic_question: true,
                            language: currentLang,
                            user_label: getUserLabel(),
                            known_data: memory ? memory.toPromptContext() : ''
                        })
                    });
                    removeTypingIndicator();
                    const aiMsg = data.student_message || data.response || '';
                    renderMessage('assistant', aiMsg);
                    saveMsg('assistant', aiMsg);
                    sendSupervisorReportIfPresent(data);
                } catch {
                    removeTypingIndicator();
                    const fallback = currentLang === 'ar'
                        ? `سؤال حلو! 😊 لكن خلني أجاوبك بعدين بالتفصيل.\nوالحين نرجع لسؤالنا: ${qTextClean}`
                        : `Great question! 😊 Let me answer that later in detail.\nNow back to our question: ${qTextClean}`;
                    renderMessage('assistant', fallback);
                    saveMsg('assistant', fallback);
                }
                // Do NOT advance — stay on current question
                return;
            }

            // ── LOCAL-FIRST Validation (API Saver) ──
            const currentQ = questions[currentStep];
            const qTextRaw = currentQ[currentLang] || currentQ.ar;
            const nameForQ = userData.name || memory?.get('name') || '';
            const qTextForValidation = qTextRaw.replace('{name}', nameForQ);

            // ── Step 1: Try LOCAL validation first (no API call!) ──
            const localResult = currentQ.localValidator ? currentQ.localValidator(text) : null;

            if (localResult && localResult.valid) {
                // ✅ LOCAL validation passed — save and advance WITHOUT calling LLM
                console.log(`✅ LOCAL validation passed for [${currentQ.key}]: "${localResult.extracted}"`);
                clarifyingStep = false;
                const cleanValue = localResult.extracted || text;
                userData[currentQ.key] = cleanValue;
                if (memory) memory.set(currentQ.key, cleanValue);
                currentStep++;

                // Build response locally: positive comment + next question
                const comment = randomPick(currentQ.positiveComments[currentLang] || currentQ.positiveComments.ar);
                autoSendNextQuestion(comment); // This already calls syncStepToServer() internally

            } else {
                // ❌ LOCAL validation failed — check if it's clearly junk or ambiguous
                const isJunkInput = /^[\s\u0600-\u06FF]{0,1}$|^(هه+|لول|ههه|خخخ|asdf|\.+|!+)$/i.test(text.trim());

                if (isJunkInput) {
                    // 🗑️ Clearly junk — re-ask locally without LLM
                    console.log(`🗑️ Junk input detected for [${currentQ.key}]: "${text}"`);
                    clarifyingStep = true;
                    const reaskMsg = currentQ.reaskMessage[currentLang] || currentQ.reaskMessage.ar;
                    const funnyPrefix = currentLang === 'ar'
                        ? randomPick(["دوم الضحكة يا رب! 😄 بس خلنا نجاوب على سؤالنا:", "هههه حلوة! 😊 بس خلنا نرجع لموضوعنا:", "يا بطل، خلنا نركز شوي 😄:"])
                        : randomPick(["Haha nice! 😄 But let's get back to our question:", "Good one! 😊 Now let's focus:", "Let's get back on track 😄:"]);
                    const fullReask = `${funnyPrefix}\n\n${reaskMsg}`;
                    renderMessage('assistant', fullReask);
                    saveMsg('assistant', fullReask);
                } else {
                    // 🤔 Ambiguous answer — fall back to LLM for validation
                    console.log(`🤔 Ambiguous input for [${currentQ.key}], falling back to LLM: "${text}"`);

                    // Determine next question text (for the AI to transition smoothly)
                    let nextStepTemp = currentStep + 1;
                    if (nextStepTemp < questions.length && questions[nextStepTemp].key === 'study_track') {
                        const gradeVal = (currentQ.key === 'grade_level' ? text : (userData['grade_level'] || ''));
                        if (gradeVal.includes('تاسع') || gradeVal.includes('أول')) {
                            nextStepTemp++;
                        }
                    }
                    let nextQText = '';
                    if (nextStepTemp < questions.length) {
                        const nq = questions[nextStepTemp];
                        nextQText = (nq[currentLang] || nq.ar).replace('{name}', nameForQ);
                    }

                    await addTypingIndicator();
                    try {
                        const valResult = await apiFetch('/api/validate', {
                            method: 'POST',
                            body: JSON.stringify({
                                last_question: qTextForValidation,
                                user_input: text,
                                current_question: qTextForValidation,
                                next_question: nextQText
                            })
                        });
                        removeTypingIndicator();

                        if (valResult.is_valid) {
                            // ── Valid answer (confirmed by LLM) — save and advance ──
                            clarifyingStep = false;
                            const cleanValue = valResult.extracted_value || text;
                            userData[currentQ.key] = cleanValue;
                            if (memory) memory.set(currentQ.key, cleanValue);
                            currentStep++;

                            // Show AI response (positive comment + next question)
                            const aiMsg = valResult.student_message || '';
                            if (aiMsg) {
                                renderMessage('assistant', aiMsg);
                                saveMsg('assistant', aiMsg);
                            }

                            // Smart Skip for study_track
                            if (currentStep < questions.length && questions[currentStep].key === 'study_track') {
                                const gradeVal = userData['grade_level'] || '';
                                if (gradeVal.includes('تاسع') || gradeVal.includes('أول')) {
                                    currentStep++;
                                    userData['study_track'] = 'غير محدد (مرحلة أساسية/أول ثانوي)';
                                    if (memory) memory.set('study_track', userData['study_track']);
                                }
                            }

                            if (currentStep < questions.length) {
                                const btnAttach = document.getElementById('btn-attachment');
                                if (btnAttach) {
                                    btnAttach.style.display = 'flex';
                                }
                            } else {
                                generateRecommendation();
                            }

                            syncStepToServer();

                        } else {
                            // ── Invalid (confirmed by LLM) — show LLM re-ask ──
                            clarifyingStep = true;
                            const reaskMsg = valResult.student_message || currentQ.reaskMessage[currentLang] || (currentLang === 'ar'
                                ? 'ممكن تجاوب على السؤال بشكل أوضح؟ 😊'
                                : 'Could you answer the question more clearly? 😊');
                            renderMessage('assistant', reaskMsg);
                            saveMsg('assistant', reaskMsg);

                            if (valResult.supervisor_report) {
                                sendSupervisorReportIfPresent(valResult);
                            }
                        }

                    } catch (err) {
                        removeTypingIndicator();
                        console.error('Validation API error:', err);
                        // Fallback: use local re-ask message
                        const reaskMsg = currentQ.reaskMessage[currentLang] || currentQ.reaskMessage.ar;
                        renderMessage('assistant', reaskMsg);
                        saveMsg('assistant', reaskMsg);
                    }
                }
            }

        } else {
            // ── Free-form AI chat ──
            const history = getSessionHistory(); // Gen-2: DB-sourced history
            addTypingIndicator();

            // ── Post-school: detect sub_track from early answers ──
            if (getUserLabel() === 'post_school' && memory) {
                if (!memory.get('sub_track')) {
                    if (/خريج|متخرج|خلصت|ثانوي|graduate/i.test(text)) {
                        memory.set('sub_track', 'graduate');
                    } else if (/طالب|جامع|أدرس|university|student|كلية/i.test(text)) {
                        memory.set('sub_track', 'university_student');
                    }
                }
                // Auto-rename chat title on first real answer
                if (history.length === 2) {
                    const newTitle = text.trim();
                    document.getElementById('chat-title').textContent = newTitle;
                    if (currentChatId) {
                        window.dbService.updateLocalConversationTitle(currentChatId, newTitle);
                        fetchSidebarHistory();
                    }
                }
            }

            try {
                // ── Build recommendation summary for post-recommendation context ──
                let recSummary = '';
                if (isRecommendationCompleted && lastRec) {
                    try {
                        const stage = lastRec.student_stage || 'school_student';
                        if (stage === 'university_student') {
                            const ca = lastRec.current_assessment;
                            recSummary = `التخصص الحالي: ${ca?.major || ''}، الحالة: ${ca?.status || ''}، ${ca?.status_explanation || ''}`;
                        } else {
                            const pr = lastRec.primary_recommendation;
                            recSummary = `التخصص الموصى به: ${pr?.major || ''}، نسبة التوافق: ${pr?.compatibility_bar || ''}%`;
                            if (pr?.university) recSummary += `، الجامعة: ${pr.university}`;
                            const alt = lastRec.alternative_recommendation;
                            if (alt?.major) recSummary += `، البديل: ${alt.major} (${alt.compatibility_bar || ''}%)`;
                        }
                        // Add userData summary for school_student
                        if (getUserLabel() === 'school_student' && Object.keys(userData).length > 0) {
                            recSummary += '\n' + Object.entries(userData).map(([k, v]) => `${k}: ${v}`).join('\n');
                        }
                    } catch { /* non-fatal */ }
                }

                const data = await apiFetch('/api/chat', {
                    method: 'POST',
                    body: JSON.stringify({
                        text,
                        history,
                        conversation_id: currentChatId, // Gen-2: for server-side fallback
                        language: currentLang,
                        user_label: getUserLabel(),
                        track_type: getUserLabel(),          // ← عزل المسار
                        current_step: currentStep,           // ← Step Guard
                        last_question: sessionState?.lastQuestion || '',
                        known_data: memory ? memory.toPromptContext() : '',
                        sub_track: memory?.get('sub_track') || '',
                        post_recommendation: isRecommendationCompleted,
                        recommendation_summary: recSummary
                    })
                });
                removeTypingIndicator();
                const aiMsg = data.student_message || data.response || '';
                renderMessage('assistant', aiMsg);
                saveMsg('assistant', aiMsg);
                sendSupervisorReportIfPresent(data);

                currentStep++; // ── زيادة الخطوة لمسار مابعد المدرسة ──
                // ── تحديث sessionState بعد كل رد ──
                sessionState.lastQuestion = extractLastQuestion(aiMsg);
                sessionState.currentStep = currentStep; // مزامنة مع currentStep العالمي
                syncStepToServer(); // ── تحديث الخطوة في الخادم ──

                if (data.recommendation_ready === true) {
                    generateRecommendation();
                }
            } catch {
                removeTypingIndicator();
                showToast(t('sendError'), 'error');
            }
        }
    } finally {
        isSending = false;
        setBtnSendLoading(false);
    }
}

// ── Sync currentStep to server after each valid advancement ──
async function syncStepToServer() {
    if (!currentChatId) return;
    try {
        await apiFetch(`/api/conversations/${currentChatId}/step`, {
            method: 'PATCH',
            body: JSON.stringify({
                current_step: currentStep,
                last_question: sessionState?.lastQuestion || '',
                collected_data: Object.keys(userData),
                is_recommendation_completed: isRecommendationCompleted
            })
        });
    } catch (e) {
        console.warn('Step sync failed (non-fatal):', e);
    }
}

async function generateRecommendation() {
    isRecommendationCompleted = true; // Mark phase as completed
    const overlay = document.getElementById('processing-overlay');
    overlay.classList.remove('hidden');

    let combinedInput = "";
    const history = getSessionHistory();
    const historyText = history.map(m => `${m.role}: ${m.content}`).join('\n');

    if (getUserLabel() === 'post_school') {
        combinedInput = historyText;
    } else {
        // For school_student, try userData first, but fallback to history if empty
        const userDataText = Object.entries(userData)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\n');
        
        combinedInput = userDataText || historyText;
    }

    if (!combinedInput) {
        console.warn("No context found for recommendation. Falling back to default prompt.");
        combinedInput = "الطالب يرغب في الحصول على توصية مهنية بناءً على الحوار السابق.";
    }

    try {
        // Fetch school_id from profile for supervisor gating
        let schoolId = null;
        if (currentUser && getUserLabel() === 'school_student') {
            try {
                const { data: profile } = await supabaseClient
                    .from('profiles')
                    .select('school_id')
                    .eq('id', currentUser.id)
                    .single();
                schoolId = profile?.school_id || null;
            } catch { /* non-fatal */ }
        }

        const data = await apiFetch('/api/recommend', {
            method: 'POST',
            body: JSON.stringify({
                text: combinedInput,
                language: currentLang,
                user_label: getUserLabel(),
                school_id: schoolId,
                chat_id: currentChatId
            })
        });
        overlay.classList.add('hidden');

        // ── NEW schema: Student_View.primary_recommendation ──────────────────
        if (data.error) {
            showToast(`${data.error}`, 'error');
            return;
        }

        const studentView = data.Student_View;
        const stage = data.student_stage || 'school_student';

        // DEBUG: log full API response to console for diagnosis
        console.log('DEBUG recommend API response:', JSON.stringify(data, null, 2));

        if (!studentView) {
            showToast(currentLang === 'ar' ? 'لم تصل بيانات التوصية من الخادم.' : 'No recommendation data received.', 'error');
            return;
        }

        lastRec = studentView;
        lastRec.student_stage = stage; // Save stage for rendering the modal later

        let summary = '';
        let primaryMajor = '';
        let compatPct = '';
        let altStr = '';
        let skillsList = [];

        const primary = studentView.primary_recommendation;
        const alternative = studentView.alternative_recommendation;
        
        if (!primary || !primary.major) {
            showToast(currentLang === 'ar' ? 'حدث خطأ في قراءة التوصية، يرجى المحاولة.' : 'Error parsing AI recommendation.', 'error');
            return;
        }
        
        primaryMajor = primary.major;
        compatPct = primary.compatibility_bar ?? primary.compatibility_score ?? '';
        
        // Add university name if present (high_school_grad)
        const uniText = primary.university ? ` في **${primary.university}**` : '';
        
        if (stage === 'university_student') {
            summary = currentLang === 'ar'
                ? `تحليل وضعك الجامعي مكتمل! مسارك في تخصص **${primaryMajor}** يبدو واعداً جداً بنسبة توافق **${compatPct}%** 🎓`
                : `University assessment complete! Your path in **${primaryMajor}** looks promising at **${compatPct}%** 🎓`;
        } else {
            summary = currentLang === 'ar'
                ? `بناءً على تحليلي، التخصص الأكثر ملاءمةً لك هو **${primaryMajor}**${uniText} بنسبة توافق **${compatPct}%**. 🎓`
                : `Based on my analysis, the best major for you is **${primaryMajor}**${uniText} with a **${compatPct}%** compatibility. 🎓`;
        }
            
        altStr = alternative && alternative.major ? `التوصية البديلة: ${alternative.major} (${alternative.compatibility_bar ?? ''}%)` : '';
        skillsList = studentView.required_skills || [];

        renderMessage('assistant', summary, true);
        saveMsg('assistant', summary);

        // ── POST-RECOMMENDATION FLOW (per track) ──────────────────────────────
        if (stage === 'school_student' || stage === 'university_student') {
            // Simple free-chat message after 2 seconds
            setTimeout(() => {
                let followUpMsg = '';
                if (stage === 'school_student') {
                    followUpMsg = currentLang === 'ar'
                        ? '📋 اطلع على توصيتك بتمعن يا بطل 🎯 وإذا احتجت أي توضيح أو عندك سؤال، أنا هنا لأساعدك!'
                        : '📋 Take a good look at your recommendation! If you have any questions, I\'m here to help!';
                } else {
                    followUpMsg = currentLang === 'ar'
                        ? '🎓 اطلع على توصيتك بتمعن يا بطل! وإذا احتجت مساعدة في أي خطوة من خطة تطويرك، أنا موجود دائماً! 💪'
                        : '🎓 Check out your recommendation carefully! I\'m here if you need help with any step in your development plan! 💪';
                }
                addTypingIndicator().then(() => {
                    removeTypingIndicator();
                    renderMessage('assistant', followUpMsg);
                    saveMsg('assistant', followUpMsg);
                });
            }, 2000);

        } else if (stage === 'high_school_grad') {
            // Graduate: start interactive post-rec flow
            const gradMajor = primaryMajor;
            const gradGpa   = userData['grades'] || memory?.get('grades') || '';
            setTimeout(() => {
                startGraduatePostRecFlow(gradMajor, gradGpa);
            }, 2000);
        }

        // Save to local recommendations store
        try {
            // Serialize stage_guidance fully so yearly_plan survives the save
            let roadmapToSave = [];
            if (studentView.stage_guidance?.yearly_plan) {
                if (Array.isArray(studentView.stage_guidance.yearly_plan)) {
                    studentView.stage_guidance.yearly_plan.forEach(y => {
                        if (typeof y === 'string') {
                            roadmapToSave.push(y);
                        } else if (typeof y === 'object' && y !== null) {
                            roadmapToSave.push(`${y.year || ''}: ${Array.isArray(y.tasks) ? y.tasks.join(' | ') : (y.tasks || '')}`);
                        }
                    });
                } else if (typeof studentView.stage_guidance.yearly_plan === 'string') {
                    roadmapToSave.push(studentView.stage_guidance.yearly_plan);
                }
            } else if (studentView.stage_guidance?.guidance_text) {
                roadmapToSave = [studentView.stage_guidance.guidance_text];
            }

            const packedSummary = JSON.stringify({
                alternative: altStr,
                skills: skillsList,
                admin_note: data.admin_note || '',
                // Preserve full stage_guidance for reload
                stage_guidance: studentView.stage_guidance || null
            });

            await window.dbService.saveLocalRecommendation(currentUser.id, currentChatId, {
                primary_major: primaryMajor,
                compatibility_score: compatPct,
                explanation: studentView.why_this_major || studentView.current_assessment?.status_explanation || '',
                roadmap: roadmapToSave,
                student_status_tags: [data.psychological_tag].filter(Boolean),
                admin_executive_summary: packedSummary
            });
            showToast(t('toastSaved'), 'success');
        } catch { /* silent */ }

    } catch {
        overlay.classList.add('hidden');
        showToast(t('toastError'), 'error');
    }
}


// ── Graduate Post-Recommendation Flow State Machine ──────────────────────────
// Manages: satisfaction → priority → location/cost → university results
const graduatePostRec = {
    active: false,
    flowStep: 'satisfaction',   // satisfaction | priority | location | cost
    recommendedMajor: '',
    studentGpa: '',
    universityType: 'both',     // government | private | both
    preference: null,           // proximity | cost
};

async function startGraduatePostRecFlow(major, gpa) {
    graduatePostRec.active        = true;
    graduatePostRec.flowStep      = 'satisfaction';
    graduatePostRec.recommendedMajor = major;
    graduatePostRec.studentGpa    = gpa;
    graduatePostRec.universityType = 'both';
    graduatePostRec.preference    = null;

    await addTypingIndicator();
    try {
        const data = await apiFetch('/api/post-rec-graduate', {
            method: 'POST',
            body: JSON.stringify({
                user_input: '[بداية مرحلة اختيار الجامعة]',
                flow_step: 'satisfaction',
                recommended_major: major,
                student_gpa: gpa,
            })
        });
        removeTypingIndicator();
        const msg = data.student_message || '';
        if (msg) { renderMessage('assistant', msg); saveMsg('assistant', msg); }
        if (data.flow_step_next) graduatePostRec.flowStep = data.flow_step_next;
    } catch {
        removeTypingIndicator();
        const fallback = currentLang === 'ar'
            ? `ممتاز! هل ناسبتك التوصية؟ وهل تفضل الدراسة في جامعة حكومية أم خاصة أم كلاهما مناسب لك؟ 🎓`
            : `Great! Did the recommendation suit you? Do you prefer a public or private university? 🎓`;
        renderMessage('assistant', fallback);
        saveMsg('assistant', fallback);
    }
}

async function handleGraduatePostRec(userText) {
    if (!graduatePostRec.active) return false;

    await addTypingIndicator();
    try {
        const data = await apiFetch('/api/post-rec-graduate', {
            method: 'POST',
            body: JSON.stringify({
                user_input: userText,
                flow_step: graduatePostRec.flowStep,
                recommended_major: graduatePostRec.recommendedMajor,
                student_gpa: graduatePostRec.studentGpa,
            })
        });
        removeTypingIndicator();

        const msg = data.student_message || '';
        if (msg) { renderMessage('assistant', msg); saveMsg('assistant', msg); }

        // Update state from LLM response
        if (data.flow_step_next) graduatePostRec.flowStep = data.flow_step_next;
        if (data.extracted_preference) {
            if (data.extracted_preference === 'government' || data.extracted_preference === 'private' || data.extracted_preference === 'both') {
                graduatePostRec.universityType = data.extracted_preference;
            } else if (data.extracted_preference === 'proximity') {
                graduatePostRec.preference = 'proximity';
            } else if (data.extracted_preference === 'cost') {
                graduatePostRec.preference = 'cost';
            }
        }

        // ── Trigger university search when action is determined ──
        if (data.flow_action === 'search_by_cost') {
            graduatePostRec.preference = 'cost';
            await searchUniversities(null);
        } else if (data.flow_action === 'search_by_location' && data.extracted_location) {
            graduatePostRec.preference = 'proximity';
            await searchUniversities(data.extracted_location);
        }

        // Mark flow as done if completed
        if (data.flow_step_next === 'done') {
            graduatePostRec.active = false;
        }

    } catch {
        removeTypingIndicator();
        showToast(t('sendError'), 'error');
    }
    return true; // Signal that this message was handled by the post-rec flow
}

async function searchUniversities(governorate) {
    await addTypingIndicator();
    try {
        const data = await apiFetch('/api/find-universities', {
            method: 'POST',
            body: JSON.stringify({
                major:           graduatePostRec.recommendedMajor,
                student_gpa:     graduatePostRec.studentGpa,
                preference:      graduatePostRec.preference || 'proximity',
                university_type: graduatePostRec.universityType,
                governorate:     governorate || null,
            })
        });
        removeTypingIndicator();

        const msg = data.recommendation_message || '';
        if (msg) { renderMessage('assistant', msg); saveMsg('assistant', msg); }

        graduatePostRec.active = false; // Flow complete
    } catch {
        removeTypingIndicator();
        const fallback = currentLang === 'ar'
            ? 'تعذّر البحث عن الجامعات الآن. يمكنك التواصل مع إدارة القبول في الجامعات المتاحة في محافظتك مباشرةً. 🎓'
            : 'Could not search for universities right now. Please contact the admission office in your area directly. 🎓';
        renderMessage('assistant', fallback);
        saveMsg('assistant', fallback);
    }
}


function renderMessage(role, content, showRecBtn = false, skipSave = false, type = 'text') {
    const msgs = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `msg ${role === 'ai' ? 'assistant' : role}`;

    const icon = (role === 'assistant' || role === 'ai') ? 'fa-brain' : 'fa-user';

    let contentHtml = '';
    if (type === 'image') {
        contentHtml = `<img src="${content}" class="chat-msg-image" alt="Uploaded Image" onclick="openImageModal(this.src)">`;
    } else {
        contentHtml = formatContent(content);
    }

    const isAI = (role === 'assistant' || role === 'ai');
    const avatarContent = isAI
        ? `<div class="brand-logo-premium" style="width:100%; height:100%; border-radius:16px; box-shadow:none; animation:none;"><img src="img/logo.png" class="logo-img"></div>`
        : `<i class="fas ${icon}"></i>`;

    div.innerHTML = `
    <div class="msg-avatar">${avatarContent}</div>
    <div>
      <div class="msg-bubble">${contentHtml}${showRecBtn ? `
        <div class="recommendation-inline">
          <button class="btn-view-rec" onclick="openReportModal()">
            <i class="fas fa-file-contract"></i> ${t('viewRec')}
          </button>
        </div>` : ''}
      </div>
    </div>
  `;
    msgs.appendChild(div);
    scrollToBottom();
}

function formatContent(text) {
    if (!text) return '';
    // Use the central link detector from dm_ui.js which also handles escaping
    let html = typeof window.dmDetectLinks === 'function'
        ? window.dmDetectLinks(text)
        : (window.dmEscapeHTML ? window.dmEscapeHTML(text) : text);

    // Basic markdown: **bold**
    return html
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
}

// Gen-2: Prefer DB-sourced history over DOM scraping
function getSessionHistory() {
    if (_activeSessionHistory && _activeSessionHistory.length > 0) {
        return _activeSessionHistory;
    }
    return buildChatHistory();
}

function buildChatHistory() {
    // Fallback: Send up to 15 messages from DOM
    return Array.from(document.querySelectorAll('.msg')).slice(-15).map(el => {
        const isUser = el.classList.contains('user');
        const bubble = el.querySelector('.msg-bubble');
        const img = bubble?.querySelector('.chat-msg-image');

        let content = '';
        if (img) content = '[Image Attached]';
        else content = bubble?.textContent?.trim() || '';

        return {
            role: isUser ? 'user' : 'assistant',
            content: content
        };
    });
}

// ==========================================
// IMAGE HANDLING
// ==========================================
async function handleImageSelection(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Show confirmation before sending
    if (window.dmConfirm) {
        const ok = await window.dmConfirm(
            currentLang === 'ar' ? 'هل تريد إرسال هذه الصورة للتحليل؟' : 'Do you want to send this image for analysis?',
            currentLang === 'ar' ? 'تأكيد الإرسال' : 'Confirm Send',
            { icon: 'fa-image' }
        );
        if (!ok) {
            event.target.value = '';
            return;
        }
    }

    // Reset input
    event.target.value = '';

    // Create unique chat if it doesn't exist
    if (!currentChatId) {
        try {
            const title = t('chatTitle'); // "New Chat"
            const trackType = getUserLabel();
            const sessionMeta = {
                user_label: trackType,
                known_data: memory ? memory.toPromptContext() : '',
                current_step: currentStep,
                is_recommendation_completed: isRecommendationCompleted
            };
            const conv = await window.dbService.createLocalConversation(currentUser.id, title, sessionMeta, trackType);
            currentChatId = conv.id;
            fetchSidebarHistory();
        } catch {
            showToast(t('sendError'), 'error');
            return;
        }
    }

    // 1. Show temporary loading message
    const msgs = document.getElementById('chat-messages');
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'msg user';
    loadingDiv.innerHTML = `
        <div class="msg-avatar"><i class="fas fa-user"></i></div>
        <div class="msg-bubble" style="opacity: 0.7;">
            <div class="image-loading-state">
                <i class="fas fa-spinner fa-spin"></i>
                <span id="t-processing-image">${currentLang === 'ar' ? 'جارٍ معالجة الصورة...' : 'Processing image...'}</span>
            </div>
        </div>
    `;
    msgs.appendChild(loadingDiv);
    scrollToBottom();

    // 2. Read file as Base64 Data URL
    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64Image = e.target.result;

        // Remove loading state
        loadingDiv.remove();

        // 3. Render image in chat bubble
        renderMessage('user', base64Image, false, true, 'image');

        // 4. Save to local dictionary (messages table) as a special message
        // Storing a large base64 string directly in messages might be heavy, but it's local IndexedDB so it's acceptable.
        try {
            await window.dbService.saveLocalMessage(currentChatId, 'user', base64Image, 'image');

            // 5. Add to Library Collection
            await window.dbService.saveLocalLibraryItem(currentUser.id, base64Image, 'Chat Upload');

            // 6. Send to Backend for analysis (Grade Vision)
            await addTypingIndicator();
            const res = await apiFetch('/api/chat', {
                method: 'POST',
                body: JSON.stringify({
                    image: base64Image,
                    language: currentLang,
                    user_label: getUserLabel()
                })
            });
            removeTypingIndicator();
            const visionMsg = res.student_message || res.response || '';
            if (visionMsg) {
                renderMessage('ai', visionMsg);
                await saveMsg('ai', visionMsg);
            }

            // SMART HOOK: If we extracted a grade, save it to userData
            if (res.extracted_data && res.extracted_data.overall_grade) {
                userData['grades'] = res.extracted_data.overall_grade;
                // If the student uploaded the image while being at the GPA step, advance!
                if (getUserLabel() !== 'post_school' && questions[currentStep] && questions[currentStep].key === 'grades') {
                    currentStep++;
                    // Trigger next question
                    setTimeout(() => {
                        if (currentStep < questions.length) {
                            const q = questions[currentStep];
                            let qNextText = q[currentLang] || q.ar;
                            if (userData.name) qNextText = qNextText.replace('{name}', userData.name);
                            renderMessage('assistant', qNextText);
                            saveMsg('assistant', qNextText);
                            // Keep attachment button visible
                            // document.getElementById('btn-attachment').style.display = 'none';
                        } else {
                            generateRecommendation();
                        }
                    }, 1500);
                }
            }
            sendSupervisorReportIfPresent(res);

            // If library tab is active or just to refresh it
            fetchLibrary();
        } catch (error) {
            removeTypingIndicator();
            console.error('Failed to save image:', error);
            showToast(currentLang === 'ar' ? 'فشلت معالجة الصورة' : 'Image processing failed.', 'error');
        }
    };

    reader.onerror = () => {
        loadingDiv.remove();
        showToast(currentLang === 'ar' ? 'فشلت قراءة الصورة' : 'Failed to read image', 'error');
    };

    reader.readAsDataURL(file);
}

// ==========================================
// SUPERVISOR REPORT — silent background send
// ==========================================
/**
 * If the API response contains a non-null supervisor_report,
 * POST it silently to /api/supervisor-report.
 * If recommendation_ready is true, trigger generateRecommendation().
 */
async function sendSupervisorReportIfPresent(data) {
    if (!data) return;
    const report = data.supervisor_report;
    if (report && (typeof report === 'object' || typeof report === 'string')) {
        try {
            await apiFetch('/api/supervisor-report', {
                method: 'POST',
                body: JSON.stringify({
                    report: report,
                    chat_id: currentChatId,
                    user_label: getUserLabel(),
                    confidence_tag: data.confidence_tag || null
                })
            });
            console.log('Supervisor report saved.');
        } catch (e) {
            // Non-fatal — student experience must not be affected
            console.warn('Could not save supervisor report:', e);
        }
    }
}

// Typing indicator
let typingEl = null;
function addTypingIndicator() {
    return new Promise(resolve => {
        const msgs = document.getElementById('chat-messages');
        typingEl = document.createElement('div');
        typingEl.className = 'msg assistant';
        typingEl.id = 'typing-indicator';
        typingEl.innerHTML = `
      <div class="msg-avatar"><div class="brand-logo-premium" style="width:100%; height:100%; border-radius:16px; box-shadow:none; animation:none;"><img src="img/logo.png" class="logo-img"></div></div>
      <div class="msg-bubble">
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    `;
        msgs.appendChild(typingEl);
        scrollToBottom();
        setTimeout(resolve, 900 + Math.random() * 800);
    });
}

function removeTypingIndicator() {
    document.getElementById('typing-indicator')?.remove();
    typingEl = null;
}

function scrollToBottom() {
    const msgs = document.getElementById('chat-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

async function saveMsg(role, content, type = 'text') {
    if (!currentChatId) return;
    try {
        await window.dbService.saveLocalMessage(currentChatId, role, content, type);
        // Gen-2: Keep in-memory session history in sync
        const normRole = (role === 'ai' || role === 'assistant') ? 'assistant' : 'user';
        const histContent = (content && content.startsWith('data:image')) ? '[Image Attached]' : content;
        _activeSessionHistory.push({ role: normRole, content: histContent });
    } catch { /* silent */ }
}

// ==========================================
// DISCOVER TAB
// ==========================================
async function fetchRecommendations() {
    if (!currentUser) return;
    const list = document.getElementById('recommendations-list');
    const loading = document.getElementById('discover-loading');
    const empty = document.getElementById('discover-empty');

    list.innerHTML = '';
    loading.style.display = 'flex';
    loading.style.flexDirection = 'column';
    empty.classList.add('hidden');

    try {
        const currentTrack = getUserLabel();
        const data = await window.dbService.getLocalRecommendations(currentUser.id, currentTrack);
        loading.style.display = 'none';

        if (!data || data.length === 0) {
            empty.classList.remove('hidden');
            return;
        }

        data.forEach((rec, i) => {
            const card = document.createElement('div');
            card.className = 'rec-card';
            card.style.animationDelay = `${i * 0.08}s`;

            const date = new Date(rec.created_at).toLocaleDateString(
                currentLang === 'ar' ? 'ar-SA' : 'en-US',
                { year: 'numeric', month: 'long', day: 'numeric' }
            );

            card.innerHTML = `
        <div class="rec-card-header">
          <div class="rec-card-icon">🎓</div>
          <div class="rec-card-title">${escapeHtml(rec.primary_major || '—')}</div>
          <div class="rec-card-score">${rec.compatibility_score || 0}%</div>
        </div>
        <div class="rec-card-summary">${escapeHtml(rec.explanation || '').slice(0, 180)}...</div>
        <div class="rec-card-footer">
          <span class="rec-card-date">${date}</span>
          <button class="btn-view-details" onclick="openRecDetailModal(${JSON.stringify(rec).replace(/"/g, '&quot;')})">
            ${t('viewDetails')}
          </button>
        </div>
      `;
            list.appendChild(card);
        });
    } catch {
        loading.style.display = 'none';
        empty.classList.remove('hidden');
    }
}

function openRecDetailModal(rec) {
    // Attempt to unpack the new JSON shape from admin_executive_summary
    let altStr = rec.admin_executive_summary;
    let savedSkills = [];
    let savedStageGuidance = null;
    try {
        if (altStr && altStr.trim().startsWith('{')) {
            const packed = JSON.parse(altStr);
            altStr = packed.alternative || '';
            savedSkills = packed.skills || [];
            savedStageGuidance = packed.stage_guidance || null;
        }
    } catch { /* old legacy plain text */ }

    // Rebuild a Student_View-compatible object from the saved flat rec
    lastRec = {
        primary_recommendation: {
            major: rec.primary_major,
            compatibility_bar: rec.compatibility_score,
            compatibility_score: rec.compatibility_score
        },
        alternative_recommendation: altStr
            ? { major: altStr.replace(/^التوصية البديلة: /, '').replace(/ \(.*\)$/, '') }
            : null,
        why_this_major: rec.explanation,
        required_skills: savedSkills,
        stage_guidance: savedStageGuidance || (rec.roadmap && rec.roadmap.length
            ? { guidance_text: Array.isArray(rec.roadmap) ? rec.roadmap[0] : rec.roadmap }
            : null)
    };
    openReportModal();
}

// ==========================================
// LIBRARY TAB
// ==========================================
async function fetchLibrary() {
    if (!currentUser) return;
    const grid = document.getElementById('library-grid');
    const loading = document.getElementById('library-loading');
    const empty = document.getElementById('library-empty');

    grid.innerHTML = '';
    loading.style.display = 'block';
    empty.classList.add('hidden');

    try {
        const data = await window.dbService.getLocalLibraryItems(currentUser.id);
        loading.style.display = 'none';

        if (!data || data.length === 0) {
            empty.classList.remove('hidden');
            return;
        }

        data.forEach(item => {
            const el = document.createElement('div');
            el.className = 'library-item';
            el.innerHTML = `
        <img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title || '')}" loading="lazy">
        <div class="library-item-overlay"><i class="fas fa-expand"></i></div>
      `;
            el.addEventListener('click', () => openImageModal(item.image_url));
            grid.appendChild(el);
        });
    } catch {
        loading.style.display = 'none';
        empty.classList.remove('hidden');
    }
}

function openImageModal(src) {
    document.getElementById('image-modal-img').src = src;
    document.getElementById('image-modal').classList.remove('hidden');
}

function closeImageModal() {
    document.getElementById('image-modal').classList.add('hidden');
    document.getElementById('image-modal-img').src = '';
}

document.getElementById('image-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('image-modal')) closeImageModal();
});

// ==========================================
// REPORT MODAL
// ==========================================
function openReportModal() {
    const studentView = lastRec;
    if (!studentView) return;

    const stage = studentView.student_stage || 'school_student';
    let primaryMajor, score, secondaryMajor, explanation, skills, roadmap;

    if (stage === 'university_student') {
        const current = studentView.current_assessment;
        primaryMajor = current?.major || 'التخصص الحالي';
        score = current?.status?.includes('جيد') ? 100 : 75;
        secondaryMajor = 'خطة التطوير والشهادات';
        explanation = current?.status_explanation || '';
        
        skills = [];
        if (studentView.strengthening_plan) {
            skills.push(...(studentView.strengthening_plan.focus_subjects || []));
            skills.push(...(studentView.strengthening_plan.missing_skills || []));
        }
        
        roadmap = [];
        if (studentView.certifications) {
            studentView.certifications.forEach(c => roadmap.push(`شهادة: ${c.name} (${c.provider})`));
        }
        if (studentView.practical_projects) {
            studentView.practical_projects.forEach(p => roadmap.push(`مشروع: ${p}`));
        }
        if (studentView.stage_guidance?.timeline) {
            if (Array.isArray(studentView.stage_guidance.timeline)) {
                studentView.stage_guidance.timeline.forEach(t => {
                    const tasksStr = Array.isArray(t.tasks) ? t.tasks.join('، ') : (t.tasks || '');
                    roadmap.push(`${t.period || ''}: ${tasksStr}`);
                });
            }
        }
    } else {
        const primary = studentView.primary_recommendation || {};
        const secondary = studentView.alternative_recommendation || {};
        
        primaryMajor = primary.major || '—';
        if (stage === 'high_school_grad' && primary.university) {
            primaryMajor += ` (${primary.university})`;
        }
        
        score = primary.compatibility_bar ?? primary.compatibility_score ?? 0;
        
        secondaryMajor = secondary.major || '—';
        if (stage === 'high_school_grad' && secondary.university) {
            secondaryMajor += ` (${secondary.university})`;
        }
        
        explanation = studentView.why_this_major || '';
        skills = studentView.required_skills || [];
        
        roadmap = [];
        if (stage === 'high_school_grad' && studentView.admission_requirements) {
            const req = studentView.admission_requirements;
            roadmap.push(`الحد الأدنى: ${req.minimum_grade || '—'}`);
            roadmap.push(`التقديم: ${req.application_deadline || '—'}`);
            if (req.entrance_exam) roadmap.push(`اختبار القبول: ${req.entrance_exam}`);
        }
        
        if (studentView.stage_guidance) {
            if (Array.isArray(studentView.stage_guidance.yearly_plan)) {
                studentView.stage_guidance.yearly_plan.forEach(y => {
                    if (typeof y === 'string') {
                        roadmap.push(y);
                    } else if (typeof y === 'object' && y !== null) {
                        const tasksStr = Array.isArray(y.tasks) ? y.tasks.join('، ') : (y.tasks || '');
                        roadmap.push(`${y.year || ''}: ${tasksStr}`);
                    }
                });
            } else if (typeof studentView.stage_guidance.yearly_plan === 'string') {
                roadmap.push(studentView.stage_guidance.yearly_plan);
            } else if (Array.isArray(studentView.stage_guidance.action_steps)) {
                roadmap.push(...studentView.stage_guidance.action_steps);
            } else if (studentView.stage_guidance.guidance_text) {
                roadmap.push(studentView.stage_guidance.guidance_text);
            }
        }
    }

    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        supabaseClient.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                const name = session.user?.user_metadata?.full_name || session.user?.user_metadata?.name || session.user?.email?.split('@')[0] || userData.name || '—';
                const email = session.user?.email || '—';
                document.getElementById('report-student-name').textContent = name;
                const emailEl = document.getElementById('report-student-email');
                if (emailEl) emailEl.textContent = email;
            } else {
                document.getElementById('report-student-name').textContent = typeof userData !== 'undefined' && userData.name ? userData.name : primaryMajor;
            }
        }).catch(() => {
            document.getElementById('report-student-name').textContent = typeof userData !== 'undefined' && userData.name ? userData.name : primaryMajor;
        });
    } else {
        document.getElementById('report-student-name').textContent = typeof userData !== 'undefined' && userData.name ? userData.name : primaryMajor;
    }

    document.getElementById('report-primary-major').textContent = primaryMajor;
    document.getElementById('report-score').textContent = score + '%';

    requestAnimationFrame(() => {
        document.getElementById('report-score-fill').style.width = score + '%';
    });

    document.getElementById('report-secondary-major').textContent = secondaryMajor;
    document.getElementById('report-explanation').textContent = explanation || '—';

    // Skills
    const skillsEl = document.getElementById('report-skills');
    skillsEl.innerHTML = '';
    if (Array.isArray(skills) && skills.length > 0) {
        skills.forEach(sk => {
            const tag = document.createElement('span');
            tag.className = 'skill-tag';
            tag.textContent = sk;
            skillsEl.appendChild(tag);
        });
    } else {
        skillsEl.innerHTML = '<span style="opacity:.5">—</span>';
    }

    // Roadmap
    const roadmapEl = document.getElementById('report-roadmap');
    roadmapEl.innerHTML = '';
    if (Array.isArray(roadmap) && roadmap.length > 0) {
        roadmap.forEach((step, i) => {
            const s = document.createElement('div');
            s.className = 'roadmap-step';
            s.innerHTML = `
        <div class="roadmap-step-num">${i + 1}</div>
        <div class="roadmap-step-text">${escapeHtml(typeof step === 'string' ? step : step.step || step.description || JSON.stringify(step))}</div>
      `;
            roadmapEl.appendChild(s);
        });
    }

    document.getElementById('report-modal').classList.remove('hidden');
}

function closeReportModal() {
    document.getElementById('report-modal').classList.add('hidden');
}

// Close report on backdrop click
document.getElementById('report-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('report-modal')) closeReportModal();
});

// ==========================================
// TOAST SYSTEM
// ==========================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'toast-out 0.35s var(--ease) both';
        setTimeout(() => toast.remove(), 350);
    }, 3000);
}

// ==========================================
// AUTH
// ==========================================
async function handleLogout() {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) dropdown.classList.remove('open');
    if (typeof logout === 'function') {
        await logout(); // delegates to auth.js: signOut + localStorage cleanup + redirect
    } else {
        // Fallback if auth.js not loaded
        localStorage.removeItem('sp_user_meta');
        localStorage.removeItem('sp_user_email');
        localStorage.removeItem('sp_user_role');
        window.location.href = '/auth/login.html';
    }
}

// ==========================================
// API HELPER
// ==========================================
// ── Cached auth token (refreshed by onAuthStateChange) ──
let _cachedAuthToken = null;
if (typeof supabaseClient !== 'undefined' && supabaseClient) {
    supabaseClient.auth.onAuthStateChange((_event, session) => {
        _cachedAuthToken = session?.access_token || null;
    });
    // Prime cache on load
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
        _cachedAuthToken = session?.access_token || null;
    }).catch(() => {});
}

async function apiFetch(endpoint, options = {}) {
    // Use cached token; fallback to fresh fetch only if cache is empty
    let token = _cachedAuthToken;
    if (!token) {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            token = session?.access_token || null;
            _cachedAuthToken = token;
        } catch { /* proceed without token */ }
    }
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options.headers
    };
    const res = await fetch(endpoint, { ...options, headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

// ==========================================
// VISUAL VIEWPORT (SMART KEYBOARD FIX)
// ==========================================
function initVisualViewportFix() {
    if (!window.visualViewport) return;

    const updateViewport = () => {
        if (window.innerWidth > 1024) {
            document.body.style.height = '';
            document.documentElement.style.height = '';
            return;
        }

        // Set body to exact visual viewport height to avoid browser scrolling the header out of view
        const vvHeight = window.visualViewport.height;
        document.body.style.height = `${vvHeight}px`;
        document.documentElement.style.height = `${vvHeight}px`;

        // Scroll to top to ensure header stays pinned
        window.scrollTo({ top: 0, behavior: 'instant' });
    };

    window.visualViewport.addEventListener('resize', updateViewport);
    window.visualViewport.addEventListener('scroll', () => {
        window.scrollTo({ top: 0, behavior: 'instant' });
    });

    // Initial call
    updateViewport();
}

// Ensure the fix runs when DOM is ready
document.addEventListener('DOMContentLoaded', initVisualViewportFix);

// ==========================================
// UTILS
// ==========================================
function escapeHtml(str) {
    if (typeof str !== 'string') return String(str || '');
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ─── Student School ID Onboarding (Premium Logic) ──────────────────────────────
window.submitSchoolId = async function () {
    const input = document.getElementById('school-id-input');
    const btn = document.getElementById('btn-submit-school-id');
    const val = (input.value || '').trim().toUpperCase();

    if (!val) {
        alert('يرجى إدخال رمز المدرسة.');
        return;
    }

    btn.disabled = true;
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '<span>جاري التحقق...</span> <i class="fas fa-spinner fa-spin"></i>';

    try {
        // 1. Verify if the school exists and get its name
        const { data: schools, error: schoolErr } = await supabaseClient
            .from('schools')
            .select('id, name')
            .eq('id', val);

        if (schoolErr) throw schoolErr;

        if (!schools || schools.length === 0) {
            alert('❌ الرمز الذي أدخلته غير موجود. يرجى التأكد من كتابته بشكل صحيح (مثل: SCHOOL-01) أو مراجعة المشرف.');
            btn.innerHTML = oldHtml;
            btn.disabled = false;
            return;
        }

        const foundSchool = schools[0];
        const confirmJoin = confirm(`هل أنت متأكد من الانضمام إلى: "${foundSchool.name}"؟`);

        if (!confirmJoin) {
            btn.innerHTML = oldHtml;
            btn.disabled = false;
            return;
        }

        // 2. Set the school ID in profile
        const { error: updateErr } = await supabaseClient
            .from('profiles')
            .update({ school_id: val })
            .eq('id', currentUser.id);

        if (updateErr) throw updateErr;

        // 3. UI Success flow
        btn.innerHTML = '<span>تمت العملية بنجاح!</span> <i class="fas fa-check-circle"></i>';
        btn.style.background = '#2ecc71';

        setTimeout(() => {
            const modal = document.getElementById('school-id-modal');
            if (modal) modal.classList.add('hidden');
            document.body.style.overflow = ''; // Unlock scrolling

            // Refresh local state and history
            if (typeof fetchSidebarHistory === 'function') fetchSidebarHistory();
            if (typeof fetchRecommendations === 'function') fetchRecommendations();
        }, 1000);

    } catch (e) {
        console.error('Error submitting school id:', e);
        alert('⚠️ حدث خطأ أثناء الاتصال بالخادم. يرجى المحاولة مرة أخرى.');
        btn.innerHTML = oldHtml;
        btn.disabled = false;
    }
};
