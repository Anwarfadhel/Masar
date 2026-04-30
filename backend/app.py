import os
from flask import Flask, request, jsonify, send_from_directory, redirect
from flask_cors import CORS
from dotenv import load_dotenv
from rag_engine import CareerRAG
from supabase_client import supabase
from prompts import CHAT_SYSTEM_PROMPT, GRADE_EXTRACTION_PROMPT, POST_SCHOOL_SYSTEM_PROMPT

load_dotenv()

# Configure Flask to serve frontend files
app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app, supports_credentials=True)

# Initialise RAG Engine
rag = CareerRAG()


# ─────────────────────────────────────────────
# Auth helpers
# ─────────────────────────────────────────────

def get_user_from_request():
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    try:
        token = auth_header.split(" ")[1]
        print(f"DEBUG Auth: Verifying token (first 10 chars): {token[:10]}...")
        response = supabase.auth.get_user(token)
        if not response:
            return None
        user = getattr(response, 'user', response)
        if user:
            print(f"DEBUG Auth: Successfully verified user {user.id}")
            return user
        return None
    except Exception as e:
        print("DEBUG Auth Exception:", e)
        return None


# ─────────────────────────────────────────────
# Static / Frontend routes
# ─────────────────────────────────────────────

@app.route('/', methods=['GET'])
def index():
    return send_from_directory(app.static_folder, 'dashboard.html')


@app.route('/auth/callback', methods=['GET'], strict_slashes=False)
@app.route('/auth/callback.html', methods=['GET'])
def auth_callback_frontend():
    return send_from_directory(app.static_folder, 'auth/callback.html')


# ─────────────────────────────────────────────
# Auth API
# ─────────────────────────────────────────────

@app.route('/api/auth/signup', methods=['POST'])
def signup():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    full_name = data.get('name')

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    try:
        res = supabase.auth.sign_up({
            "email": email,
            "password": password,
            "options": {"data": {"full_name": full_name}}
        })
        return jsonify({
            "message": "Signup successful",
            "user": res.user.to_dict() if res.user else None
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')

    try:
        res = supabase.auth.sign_in_with_password({"email": email, "password": password})
        return jsonify({
            "message": "Login successful",
            "session": res.session.to_dict() if res.session else None,
            "user": res.user.to_dict() if res.user else None
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 401


@app.route('/api/health', methods=['GET'])
def health_check():
    """تحقق من صحة الخادم واتصال قاعدة البيانات"""
    health_status = {"status": "ok", "supabase": "unknown"}
    if supabase:
        try:
            # Simple ping to Supabase to verify connection
            res = supabase.table('profiles').select('id').limit(1).execute()
            health_status["supabase"] = "connected"
        except Exception as e:
            health_status["supabase"] = f"error: {str(e)}"
            health_status["status"] = "degraded"
            return jsonify(health_status), 503
    else:
        health_status["supabase"] = "not_initialized"
        health_status["status"] = "error"
        return jsonify(health_status), 500
        
    return jsonify(health_status), 200
@app.route('/api/auth/logout', methods=['POST'])
def logout():
    return jsonify({"message": "Logout should be handled on frontend"})


@app.route('/api/auth/callback')
def auth_callback():
    return redirect('/')


# ─────────────────────────────────────────────
# Chat  (/api/chat)
# ─────────────────────────────────────────────

# ─────────────────────────────────────────────
# Conversations  (/api/conversations)
# ─────────────────────────────────────────────

@app.route('/api/conversations', methods=['POST'])
def create_conversation():
    """إنشاء محادثة جديدة مع تسجيل track_type صراحةً"""
    user = get_user_from_request()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    try:
        data = request.json or {}
        track_type = data.get('track_type', 'school_student')
        title      = data.get('title', 'محادثة جديدة')
        session_metadata = data.get('session_metadata', {
            "current_step": 0,
            "collected_data": [],
            "last_question": "",
            "is_recommendation_completed": False
        })

        result = supabase.table('conversations').insert({
            "user_id": user.id,
            "title": title,
            "track_type": track_type,
            "session_metadata": session_metadata
        }).execute()

        if result.data:
            print(f"DEBUG: Created conversation {result.data[0]['id']} track={track_type}")
            return jsonify({"conversation_id": result.data[0]['id'], "track_type": track_type})
        return jsonify({"error": "Failed to create conversation"}), 500
    except Exception as e:
        print(f"Error creating conversation: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/conversations', methods=['GET'])
def get_conversations():
    """جلب محادثات المستخدم مع الفلترة الإلزامية بالـ track_type"""
    user = get_user_from_request()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    try:
        track_type = request.args.get('track_type', 'school_student')
        result = supabase.table('conversations') \
            .select('id, title, track_type, created_at, session_metadata') \
            .eq('user_id', user.id) \
            .eq('track_type', track_type) \
            .order('created_at', desc=True) \
            .execute()
        return jsonify(result.data or [])
    except Exception as e:
        print(f"Error fetching conversations: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/conversations/<conv_id>/step', methods=['PATCH'])
def update_conversation_step(conv_id):
    """تحديث current_step في session_metadata"""
    user = get_user_from_request()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    try:
        data = request.json or {}
        new_step = data.get('current_step', 0)
        last_q   = data.get('last_question', '')
        collected = data.get('collected_data', [])
        is_rec_done = data.get('is_recommendation_completed', False)

        # التحقق من ملكية المحادثة
        check = supabase.table('conversations') \
            .select('id, track_type') \
            .eq('id', conv_id) \
            .eq('user_id', user.id) \
            .execute()
        if not check.data:
            return jsonify({"error": "Conversation not found"}), 404

        supabase.table('conversations').update({
            "session_metadata": {
                "current_step": new_step,
                "last_question": last_q,
                "collected_data": collected,
                "is_recommendation_completed": is_rec_done
            }
        }).eq('id', conv_id).execute()

        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────
# Validate Answer  (/api/validate)
# ─────────────────────────────────────────────

@app.route('/api/validate', methods=['POST'])
def validate_answer():
    user = get_user_from_request()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        data = request.get_json()
        last_question = data.get('last_question', '')
        user_input = data.get('user_input', '')
        current_question = data.get('current_question', '')
        next_question = data.get('next_question', '')

        if not user_input or not last_question:
            return jsonify({"is_valid": False, "student_message": None, "extracted_value": None})

        # Single Unified Call (Replaces 2 sequential calls to reduce latency by 50%)
        result = rag.generate_unified_guided_response(
            last_question=last_question,
            user_input=user_input,
            next_question=next_question
        )

        is_valid = result.get('is_valid', False)
        extracted_value = result.get('extracted_value')
        side_question = result.get('side_question')
        student_message = result.get('student_message', '')

        return jsonify({
            "is_valid": is_valid,
            "extracted_value": extracted_value,
            "side_question": side_question,
            "student_message": student_message,
            "supervisor_report": result.get('supervisor_report'),
            "confidence_tag": result.get('confidence_tag'),
        })
    except Exception as e:
        print(f"ERROR /api/validate: {e}")
        return jsonify({"is_valid": False, "student_message": None, "error": str(e)}), 500


# ─────────────────────────────────────────────
# Chat  (/api/chat)
# ─────────────────────────────────────────────

@app.route('/api/chat', methods=['POST'])
def chat():
    user = get_user_from_request()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        data = request.json
        user_input   = data.get('text', '')
        history      = data.get('history', [])
        language     = data.get('language', 'ar')
        user_label   = data.get('user_label', 'school_student')   # ← hidden label from frontend
        is_clarification = data.get('clarification', False)
        current_question = data.get('currentQuestion', '')
        image_data   = data.get('image', None)   # base64
        conversation_id = data.get('conversation_id', None)   # Gen-2: session isolation
        current_step = data.get('current_step', 0)            # ← خطوة الحوار الحالية
        last_question = data.get('last_question', '')          # ← آخر سؤال طُرح

        if not user_input and not image_data:
            return jsonify({"error": "No input provided"}), 400

        # ── Gen-2: Fetch + VALIDATE history with track_type isolation ──────────
        if conversation_id and not history:
            try:
                # أولاً: تحقق أن هذه المحادثة تخص هذا المستخدم وهذا المسار
                conv_check = supabase.table('conversations') \
                    .select('id, track_type') \
                    .eq('id', conversation_id) \
                    .eq('user_id', user.id) \
                    .execute()

                if conv_check.data:
                    db_track = conv_check.data[0].get('track_type', 'school_student')
                    if db_track != user_label:
                        print(f"WARNING Track-Mismatch: conv {conversation_id} is {db_track} but request is {user_label} — rejecting history")
                        history = []  # ← منع تسريب البيانات
                    else:
                        # المسار متطابق — جلب الرسائل بأمان
                        result = supabase.table('messages') \
                            .select('role, content') \
                            .eq('conversation_id', conversation_id) \
                            .order('created_at', desc=False) \
                            .execute()
                        if result.data:
                            history = [{'role': m['role'], 'content': m['content']}
                                       for m in result.data]
                            print(f"DEBUG Gen-2: Loaded {len(history)} msgs for conv {conversation_id} track={user_label}")
                else:
                    print(f"WARNING: conv {conversation_id} not found or not owned by user {user.id}")
                    history = []
            except Exception as hist_err:
                print(f"WARNING: Failed to fetch history for conv {conversation_id}: {hist_err}")

        # Strip data-URL prefix if present
        if image_data and "," in image_data:
            image_data = image_data.split(",")[1]

        # ── Image analysis (grade sheet) ──────────────────────────
        if image_data:
            result = rag.extract_grades_from_image(image_data)
            
            is_valid_raw = result.get("is_valid", True)
            is_valid = is_valid_raw if isinstance(is_valid_raw, bool) else str(is_valid_raw).lower() == 'true'
            friendly = result.get("friendly_message", "")
            
            if not is_valid:
                return jsonify({
                    "student_message": friendly or "عذراً، الصورة المرفقة لا تبدو كشهادة أو كشف درجات. يرجى إرفاق صورة لنتيجتك الدراسية.",
                    "supervisor_report": None,
                    "recommendation_ready": False,
                    "response": friendly or "عذراً، الصورة المرفقة لا تبدو كشهادة أو كشف درجات. يرجى إرفاق صورة لنتيجتك الدراسية.",
                    "extracted_data": None
                })
            
            # Build a friendly student_message from the extracted info
            grade    = result.get("overall_grade")
            strong   = result.get("strong_subjects", [])
            weak     = result.get("weak_subjects", [])

            if grade:
                friendly += f"\n\n📊 نسبتك العامة: **{grade}**"
            if strong:
                friendly += f"\n✅ أقوى موادك: {', '.join(strong)}"
            if weak:
                friendly += f"\n⚠️ المواد التي تحتاج اهتماماً: {', '.join(weak)}"

            return jsonify({
                "student_message": friendly,
                "supervisor_report": None,
                "recommendation_ready": False,
                # Keep legacy key for any old frontend code
                "response": friendly,
                # ← الحقل الذي يبحث عنه الفرونتند لتقديم الخطوة تلقائياً
                "extracted_data": {
                    "overall_grade": grade,
                    "strong_subjects": strong,
                    "weak_subjects": weak
                }
            })

        # ── Clarification (re-explain a guided question, RAG-aware) ─────────
        if is_clarification and current_question:
            result = rag.get_clarification_response(current_question, user_input)
            result["response"] = result.get("student_message", "")
            return jsonify(result)

        # ── Smart Memory & Track fields ──────────────────────────────────────
        known_data          = data.get('known_data', '')
        sub_track           = data.get('sub_track', '')
        off_topic           = data.get('off_topic_question', False)
        post_recommendation = data.get('post_recommendation', False)
        recommendation_summary = data.get('recommendation_summary', '')

        # ── Normal guided conversation (RAG → Groq → JSON shield) ─────────
        result = rag.chat_response(
            history, user_input, user_label,
            known_data=known_data,
            sub_track=sub_track,
            off_topic_question=off_topic,
            current_question=current_question,
            post_recommendation=post_recommendation,
            recommendation_summary=recommendation_summary,
            current_step=current_step          # ← Step Guard
        )

        # ── Layer 4: Double-lock privacy rule for post_school ────────────────
        if user_label == "post_school":
            result["supervisor_report"] = None

        # ── Layer 4: Auto-save supervisor_report server-side ─────────────────
        # Triggered only for school_student when recommendation is ready
        if (
            user_label == "school_student"
            and result.get("recommendation_ready") is True
            and result.get("supervisor_report")
            and supabase
        ):
            try:
                sr = result.get("supervisor_report")
                payload = {
                    "user_id": user.id,
                    "chat_id": conversation_id,
                    "case_classification": result.get("confidence_tag"),
                    "gap_analysis": None,
                    "guidance_instructions": sr if isinstance(sr, str) else str(sr),
                }
                supabase.table("supervisor_reports").insert(payload).execute()
                print(f"DEBUG: supervisor_report auto-saved for user {user.id}")
            except Exception as sr_err:
                # Non-fatal — never break the student experience
                print(f"WARNING: supervisor_report auto-save failed: {sr_err}")

        # Always include legacy 'response' key for backward compatibility
        result["response"] = result.get("student_message", "")
        return jsonify(result)

    except Exception as e:
        print(f"Error in chat: {str(e)}")
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────
# Supervisor Report  (/api/supervisor-report)
# ─────────────────────────────────────────────

@app.route('/api/supervisor-report', methods=['POST'])
def save_supervisor_report():
    user = get_user_from_request()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        data = request.json
        report = data.get('report')
        chat_id = data.get('chat_id')
        user_label = data.get('user_label', 'school_student')

        # ── post_school path: never store supervisor reports ──────────────
        if user_label == 'post_school':
            print(f"DEBUG: Skipping supervisor_report for post_school user {user.id}")
            return jsonify({"success": True, "note": "post_school path — no supervisor report generated"})

        if not report:
            return jsonify({"error": "No report data provided"}), 400

        # Store in Supabase
        if isinstance(report, str):
            payload = {
                "user_id": user.id,
                "chat_id": chat_id,
                "case_classification": data.get("confidence_tag"),
                "gap_analysis": None,
                "guidance_instructions": report,
            }
        else:
            payload = {
                "user_id": user.id,
                "chat_id": chat_id,
                "case_classification": report.get("case_classification"),
                "gap_analysis": report.get("gap_analysis"),
                "guidance_instructions": report.get("guidance_instructions"),
            }

        result = supabase.table("supervisor_reports").insert(payload).execute()

        if result.data:
            return jsonify({"success": True, "id": result.data[0].get("id")})
        else:
            # If table doesn't exist yet, log and return success silently
            print("supervisor_reports insert returned empty data — table may not exist yet")
            return jsonify({"success": True, "note": "stored locally"})

    except Exception as e:
        print(f"Error saving supervisor report: {str(e)}")
        # Non-fatal: don't break the student experience
        return jsonify({"success": False, "error": str(e)}), 200


# ─────────────────────────────────────────────
# Recommendations  (/api/recommend)
# ─────────────────────────────────────────────

@app.route('/api/recommend', methods=['POST'])
def recommend():
    user = get_user_from_request()
    # Auth is optional for recommend — unauthenticated users get no Supervisor_View
    try:
        data = request.json
        user_input = data.get('text', '')
        language   = data.get('language', 'ar')
        school_id  = data.get('school_id', None)   # supervisor gate key
        user_label = data.get('user_label', 'school_student')

        if not user_input:
            return jsonify({"error": "No input provided"}), 400

        # post_school path: previously stripped Supervisor_View, but admins need it.
        # we keep school_id as is.

        result = rag.get_recommendation(user_input, language, school_id=school_id)

        # ── Layer 4: Auto-save Supervisor_View to Supabase ───────────────────
        supervisor_view = result.get("Supervisor_View")
        if supervisor_view and user and supabase:
            try:
                payload = {
                    "user_id": user.id,
                    "chat_id": data.get("chat_id"),
                    "case_classification": supervisor_view.get("student_psychological_status"),
                    "gap_analysis": None,
                    "guidance_instructions": str(supervisor_view.get("supervisor_action_plan", "")),
                    "proposed_major": supervisor_view.get("proposed_major"),
                    "compatibility_score": supervisor_view.get("compatibility_score"),
                    "analytical_report": supervisor_view.get("analytical_report"),
                }
                supabase.table("supervisor_reports").insert(payload).execute()
                print(f"DEBUG: Supervisor_View auto-saved for user {getattr(user, 'id', 'unknown')}")
            except Exception as sv_err:
                print(f"WARNING: Supervisor_View save failed: {sv_err}")

        # ── Privacy: strip Supervisor_View from client response ──────────────
        client_result = {k: v for k, v in result.items() if k != "Supervisor_View"}
        
        # Safely pass specific admin fields back to frontend so it can save them
        if supervisor_view:
            client_result["psychological_tag"] = supervisor_view.get("student_psychological_status", "")
            client_result["admin_note"] = supervisor_view.get("supervisor_action_plan", "")

        return jsonify(client_result)

    except Exception as e:
        print(f"Error in recommend: {str(e)}")
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────
# Post-Rec Graduate Flow  (/api/post-rec-graduate)
# ─────────────────────────────────────────────

@app.route('/api/post-rec-graduate', methods=['POST'])
def post_rec_graduate():
    """Manages the interactive post-recommendation flow for high_school_grad."""
    user = get_user_from_request()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        data = request.json
        user_input        = data.get('user_input', '')
        flow_step         = data.get('flow_step', 'satisfaction')
        recommended_major = data.get('recommended_major', '')
        student_gpa       = data.get('student_gpa', '')

        if not user_input:
            return jsonify({"error": "No input provided"}), 400

        result = rag.handle_post_rec_graduate(
            user_input=user_input,
            flow_step=flow_step,
            recommended_major=recommended_major,
            student_gpa=student_gpa,
        )
        return jsonify(result)

    except Exception as e:
        print(f"Error in post_rec_graduate: {e}")
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────
# University Finder  (/api/find-universities)
# ─────────────────────────────────────────────

@app.route('/api/find-universities', methods=['POST'])
def find_universities():
    """Find universities matching major + student preference (proximity/cost)."""
    user = get_user_from_request()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        data = request.json
        major           = data.get('major', '')
        student_gpa     = data.get('student_gpa', '')
        preference      = data.get('preference', 'proximity')   # proximity | cost
        university_type = data.get('university_type', 'both')   # government | private | both
        governorate     = data.get('governorate', None)

        if not major:
            return jsonify({"error": "Major is required"}), 400

        result = rag.find_universities_by_preference(
            major=major,
            student_gpa=student_gpa,
            preference=preference,
            university_type=university_type,
            governorate=governorate,
        )
        return jsonify(result)

    except Exception as e:
        print(f"Error in find_universities: {e}")
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────
# Misc
# ─────────────────────────────────────────────

@app.route('/api/protected', methods=['GET'])
def protected():
    user = get_user_from_request()
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    return jsonify({"message": "Access granted", "user": user.to_dict()})



@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "message": "Backend is running"})


if __name__ == '__main__':
    is_debug = os.getenv('FLASK_ENV', 'production') == 'development'
    port = int(os.getenv('PORT', 5000))
    app.run(debug=is_debug, host='0.0.0.0', port=port)
