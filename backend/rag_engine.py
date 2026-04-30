import os
import json
import re
import logging
import sys

from llama_index.core import VectorStoreIndex, Document, Settings
from llama_index.core.embeddings import MockEmbedding
from dotenv import load_dotenv

from key_manager import KeyManager
from prompts import (
    CHAT_SYSTEM_PROMPT,
    GRADE_EXTRACTION_PROMPT,
    RECOMMENDATION_SYSTEM_PROMPT,
    STAGE_DETECTION_INSTRUCTION,
    POST_SCHOOL_SYSTEM_PROMPT,
    FREE_CHAT_SYSTEM_PROMPT,
    EXTRACTION_SYSTEM_PROMPT,
    GENERATION_SYSTEM_PROMPT,
    POST_REC_GRADUATE_PROMPT,
    UNIVERSITY_FINDER_PROMPT,
)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────
# Conversation Flow Manager  (خطوات الحوار + مراقبة الجاهزية)
# ──────────────────────────────────────────────────────────────────────────

class ConversationFlowManager:
    """
    يدير الخطوات المتسلسلة للحوار ويمنع القفز من جمع البيانات إلى التوصية.
    """

    # عدد الحقول المطلوبة قبل السماح بالتوصية
    MIN_REQUIRED = {"school_student": 6, "post_school": 5}

    @classmethod
    def is_ready_for_recommendation(cls, current_step: int, track_type: str) -> bool:
        """
        لا تنتقل للتوصية إلا بعد اكتمال الحد الأدنى من الخطوات.
        يعتمد على current_step المُرسَل من الـ Frontend.
        """
        threshold = cls.MIN_REQUIRED.get(track_type, 6)
        return current_step >= threshold


class CareerRAG:
    """
    4-Layer Academic Guidance RAG Engine
    ─────────────────────────────────────
    Layer 1 – Data Orchestration : LlamaIndex + MockEmbedding
    Layer 2 – Semantic Memory    : VectorStoreIndex retriever
    Layer 3 – Reasoning Engine   : Groq via KeyManager
    Layer 4 – Supervisor Shield  : Strict JSON output + routing
    """

    def __init__(self):
        load_dotenv()
        self.key_manager = KeyManager()

        # ── Layer 1 & 2: Build vector index from career dataset ─────────────
        self.embed_model = MockEmbedding(embed_dim=768)
        Settings.embed_model = self.embed_model
        # Disable any default LLM from LlamaIndex (we drive the LLM ourselves)
        Settings.llm = None

        persist_dir = os.path.join(os.path.dirname(__file__), '..', 'data', 'storage')
        if os.path.exists(persist_dir):
            from llama_index.core import StorageContext, load_index_from_storage
            storage_context = StorageContext.from_defaults(persist_dir=persist_dir)
            self.index = load_index_from_storage(storage_context)
            print("CareerRAG initialised — Loaded VectorStoreIndex from cache.")
        else:
            data_path = os.path.join(
                os.path.dirname(__file__), '..', 'data', 'career_dataset.json'
            )
            with open(data_path, 'r', encoding='utf-8') as f:
                self.career_data = json.load(f)

            documents = self._build_documents(self.career_data)
            self.index = VectorStoreIndex.from_documents(documents)
            self.index.storage_context.persist(persist_dir=persist_dir)
            print("CareerRAG initialised — Built and cached VectorStoreIndex.")

        # Higher top-k for richer context injection (reduced to 4 to stay under 8k token limit)
        self.retriever = self.index.as_retriever(similarity_top_k=4)

    # ──────────────────────────────────────────────────────────────────────────
    # Layer 2: Document Builder (Rich-Text Mapping)
    # ──────────────────────────────────────────────────────────────────────────

    def _build_documents(self, data: list) -> list:
        """Convert dataset records → LlamaIndex Documents (rich-text format)."""
        documents = []
        for item in data:
            collection = item.get('collection', 'general')
            parts = [f"[{collection.upper()}]"]
            for k, v in item.items():
                if k in ('id', 'collection'):
                    continue
                if isinstance(v, list):
                    parts.append(f"{k}: {', '.join(str(x) for x in v)}")
                else:
                    parts.append(f"{k}: {v}")
            text = " | ".join(parts)
            doc = Document(text=text, metadata=item)
            documents.append(doc)
        return documents

    # ──────────────────────────────────────────────────────────────────────────
    # Layer 4: JSON Parsing + Repair Fallback
    # ──────────────────────────────────────────────────────────────────────────

    def _repair_json(self, raw: str) -> dict | None:
        """
        Best-effort repair of malformed JSON from the LLM.
        Handles:
          • Escaped quotes inside values
          • Trailing commas
          • Missing closing brace
          • LLM wrapping JSON in markdown fences
        """
        text = raw.strip()

        # Strip markdown fences
        for fence in ("```json", "```"):
            if fence in text:
                parts = text.split(fence)
                if len(parts) >= 3:
                    text = parts[1].strip()
                    break

        # Extract first {...} block
        start = text.find('{')
        end   = text.rfind('}')
        if start == -1:
            return None
        if end == -1:
            text = text[start:] + '}'
        else:
            text = text[start:end + 1]

        # Remove trailing commas before }, ]
        text = re.sub(r',\s*([}\]])', r'\1', text)

        # Try to parse after repair
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
            
        # Try replacing single quotes with double quotes as a desperate measure
        try:
            text_quotes = text.replace("'", '"')
            return json.loads(text_quotes)
        except json.JSONDecodeError:
            pass

        # Use ast.literal_eval as a last resort for python-like dict syntax
        try:
            import ast
            parsed = ast.literal_eval(text)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass

        # Last resort: extract key values manually for the required keys
        result = {}
        for key in ('student_message', 'supervisor_report', 'confidence_tag', 'recommendation_ready'):
            pattern = rf'"{key}"\s*:\s*'
            m = re.search(pattern, text)
            if m:
                remainder = text[m.end():]
                if remainder.startswith('"'):
                    str_m = re.match(r'"((?:[^"\\]|\\.)*)"', remainder)
                    if str_m:
                        result[key] = str_m.group(1)
                    else:
                        # Cut-off string fallback: just take everything after the opening quote
                        clean_str = remainder[1:].strip()
                        # Remove any trailing unclosed braces or brackets
                        clean_str = re.sub(r'[\}\]]+$', '', clean_str).strip()
                        if clean_str.endswith('\\'):
                            clean_str = clean_str[:-1]
                        result[key] = clean_str
                # Value is null / true / false
                elif remainder.startswith('null'):
                    result[key] = None
                elif remainder.startswith('true'):
                    result[key] = True
                elif remainder.startswith('false'):
                    result[key] = False

        return result if 'student_message' in result else None

    def _parse_json_response(self, raw: str) -> dict | None:
        """Extract + parse JSON from LLM output, with robust repair fallback."""
        if not raw:
            return None

        text = raw.strip()

        # Strip markdown fences
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()

        # Try direct parse
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Try to find the first '{' and the LAST possible valid '}'
        start = text.find('{')
        if start != -1:
            # We try to find the largest valid JSON object within the string
            # by moving the end pointer backwards if it fails
            potential_json = text[start:]
            while '}' in potential_json:
                end = potential_json.rfind('}')
                if end == -1: break
                try:
                    candidate = potential_json[:end + 1]
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    potential_json = potential_json[:end] # Shrink and try again
        
        # Final fallback: repair logic
        return self._repair_json(raw)

    # ──────────────────────────────────────────────────────────────────────────
    # Layer 1 + 3: RAG Context Retrieval Helper
    # ──────────────────────────────────────────────────────────────────────────

    def _retrieve_context(self, query: str) -> str:
        """Retrieve top-K relevant documents and return as a formatted string."""
        try:
            nodes = self.retriever.retrieve(query)
            if not nodes:
                return "لا توجد بيانات مطابقة متاحة."
            return "\n\n".join([node.get_content() for node in nodes])
        except Exception as e:
            logger.error(f"Retrieval error: {e}")
            return ""

    # ──────────────────────────────────────────────────────────────────────────
    # Gen-2: Sliding Window + Summary for History Preparation
    # ──────────────────────────────────────────────────────────────────────────

    def _prepare_history(self, full_history: list, max_recent: int = 20) -> str:
        """
        Smart history preparation: keeps recent messages verbatim,
        compresses older messages into a concise summary.
        Enforces ~4K token budget (Arabic: ~1 token per 2-3 chars → 12000 chars max).
        """
        MAX_CHARS = 12000  # ≈ 4K tokens for Arabic/mixed text
        if not full_history:
            return ""

        if len(full_history) <= max_recent:
            result = "\n".join([f"{m['role']}: {m['content']}" for m in full_history])
            return result[-MAX_CHARS:] if len(result) > MAX_CHARS else result

        # Split into old + recent
        old_messages = full_history[:-max_recent]
        recent_messages = full_history[-max_recent:]

        # Compress old messages into key data points
        old_summary = self._summarize_old_messages(old_messages)
        recent_str = "\n".join([f"{m['role']}: {m['content']}" for m in recent_messages])

        combined = f"## ملخص المحادثة السابقة:\n{old_summary}\n\n## آخر الرسائل:\n{recent_str}"
        return combined[-MAX_CHARS:] if len(combined) > MAX_CHARS else combined

    def _summarize_old_messages(self, messages: list) -> str:
        """
        Extract key data points from old messages for context compression.
        Focuses on user answers (the information that matters for recommendations).
        """
        summary_parts = []
        for m in messages:
            content = m.get('content', '')
            if m.get('role') == 'user' and len(content) > 3:
                # Truncate long messages to save tokens
                summary_parts.append(content[:120])

        if not summary_parts:
            return "لا توجد بيانات سابقة ملخصة."

        # Keep the most important 10 user responses
        return " | ".join(summary_parts[-10:])

    # ──────────────────────────────────────────────────────────────────────────
    # Layer 3 + 4: Main Conversation Handler
    # ──────────────────────────────────────────────────────────────────────────

    def chat_response(self, history: list, user_input: str, user_label: str = "school_student",
                       known_data: str = "", sub_track: str = "", off_topic_question: bool = False,
                       current_question: str = "", post_recommendation: bool = False,
                       recommendation_summary: str = "", current_step: int = 0) -> dict:
        """
        Handle a guided conversation turn with full RAG context injection.

        Flow:
          1. Retrieve relevant context via VectorStoreIndex  (Layer 1+2)
          2. Build prompt with system rules + context + history  (Layer 3)
          3. Call Groq via KeyManager with automatic key rotation  (Layer 3)
          4. Parse + enforce strict JSON shape  (Layer 4)
          5. Enforce supervisor_report = null for post_school  (Layer 4)

        Args:
          known_data       : Pre-known user data from UserMemory (injected into prompt)
          sub_track        : 'graduate' or 'university_student' (post_school sub-routing)
          off_topic_question: True when student asked a side question instead of answering
          current_question : The guided question the student was supposed to answer
          post_recommendation: True if the recommendation phase is complete
          recommendation_summary: Summary of the recommendation that was given (for post-rec context)

        Returns:
          dict with keys: student_message, supervisor_report, recommendation_ready
        """
        is_post_school = (user_label == "post_school")
        
        if post_recommendation:
            system_prompt = FREE_CHAT_SYSTEM_PROMPT
        else:
            system_prompt = POST_SCHOOL_SYSTEM_PROMPT if is_post_school else CHAT_SYSTEM_PROMPT
            
        participant_label = "المستخدم" if is_post_school else "الطالب"

        # ── Layer 1+2: Semantic retrieval BEFORE LLM call ────────────────────
        context_str = self._retrieve_context(user_input)

        # ── Gen-2: Sliding Window history preparation ────────────────────────
        history_str = self._prepare_history(history)

        # Build optional sections
        known_section = ""
        if known_data:
            known_section = f"\n## بيانات معروفة مسبقاً (لا تسأل عنها مرة أخرى):\n{known_data}\n"

        sub_track_section = ""
        if sub_track:
            if sub_track == 'university_student':
                sub_track_section = (
                    "\n## 🔴 المسار المُحدد: طالب جامعي يدرس حالياً (إلزامي)\n"
                    "هذا المستخدم طالب جامعي يدرس في الجامعة الآن.\n"
                    "يُمنع منعاً باتاً استخدام أسئلة مسار \"خريج ثانوية\" (المعدل، القسم، المدينة، نوع الجامعة).\n"
                    "اتبع حصراً قائمة أسئلة \"▸ إذا طالب جامعي\" بالترتيب، بدءاً من السؤال التالي الناقص.\n"
                )
            elif sub_track == 'graduate':
                sub_track_section = (
                    "\n## 🔴 المسار المُحدد: خريج ثانوية يبحث عن تخصص (إلزامي)\n"
                    "هذا المستخدم خريج ثانوية ويبحث عن جامعة وتخصص.\n"
                    "يُمنع منعاً باتاً استخدام أسئلة مسار \"طالب جامعي\" (التخصص الحالي، الرضا، التحويل).\n"
                    "اتبع حصراً قائمة أسئلة \"▸ إذا خريج ثانوية\" بالترتيب، بدءاً من السؤال التالي الناقص.\n"
                )
            else:
                sub_track_section = f"\n## المسار الفرعي للمستخدم: {sub_track}\n"

        off_topic_section = ""
        if off_topic_question and current_question:
            off_topic_section = (
                f"\n## تنبيه: الطالب سأل سؤالاً جانبياً بدلاً من الإجابة.\n"
                f"السؤال الأصلي الذي كان يجب أن يجيب عليه: \"{current_question}\"\n"
                f"المطلوب: أجب عن سؤاله بإجابة مختصرة ومفيدة (3-4 أسطر)، "
                f"ثم اختم بـ: \"والحين نرجع لسؤالنا 😊: {current_question}\"\n"
            )

        # ── Post-recommendation context injection ────────────────────────────
        rec_summary_section = ""
        if post_recommendation and recommendation_summary:
            rec_summary_section = (
                f"\n## ⚠️ ملخص التوصية التي أُعطيت مسبقاً (تذكّرها دائماً، لا تتجاهلها):\n"
                f"{recommendation_summary}\n"
            )

        prompt = (
            f"{system_prompt}\n\n"
            f"## السياق المسترجع من قاعدة البيانات (استخدمه في ردك):\n"
            f"{context_str}\n\n"
            f"## نوع المستخدم: {user_label}\n"
            f"{known_section}"
            f"{sub_track_section}"
            f"{rec_summary_section}"
            f"{off_topic_section}\n"
            f"## سجل المحادثة:\n{history_str}\n\n"
            f"{participant_label}: {user_input}\n"
            f"المستشار (JSON فقط):"
        )

        # ── Layer 3: Call Groq with key rotation ──────────────────────────────
        try:
            raw = self.key_manager.generateGeminiResponse(prompt)
            parsed = self._parse_json_response(raw)
        except Exception as e:
            print(f"Exception in chat_response LLM call: {e}")
            return {
                "student_message": "\u0639\u0630\u0631\u0627\u064b\u060c \u0648\u0627\u062c\u0647\u062a \u0645\u0634\u0643\u0644\u0629 \u062a\u0642\u0646\u064a\u0629 \u0628\u0633\u064a\u0637\u0629. \u0623\u0639\u062f \u0625\u0631\u0633\u0627\u0644 \u0631\u0633\u0627\u0644\u062a\u0643 \u0648\u0633\u0623\u0631\u062f \u0639\u0644\u064a\u0643 \u0641\u0648\u0631\u0627\u064b \ud83d\ude0a",
                "supervisor_report": None,
                "recommendation_ready": False
            }

        # ── Layer 4: Enforce strict output shape ─────────────────────────────
        if parsed and "student_message" in parsed:
            parsed.setdefault("supervisor_report", None)
            parsed.setdefault("confidence_tag", None)
            parsed.setdefault("recommendation_ready", False)

            if is_post_school:
                parsed["supervisor_report"] = None

            if not post_recommendation:
                parsed = self._enforce_single_question(parsed)

            if not post_recommendation:
                parsed = self._validate_track_context(parsed, user_label, current_step)

            return parsed

        # Fallback
        print(f"WARNING: Could not parse LLM response. Raw: {raw[:200] if raw else 'None'}")
        
        fallback_msg = "عذراً، واجهت مشكلة تقنية. أعد إرسال رسالتك 😊"
        if raw and not raw.strip().startswith('{') and raw != "AI service is temporarily unavailable":
            fallback_msg = raw
            
        return {
            "student_message": fallback_msg,
            "supervisor_report": None,
            "recommendation_ready": False
        }


    # ──────────────────────────────────────────────────────────────────────────
    # Layer 4 — Flow Enforcement Shield
    # ──────────────────────────────────────────────────────────────────────────

    def _enforce_single_question(self, response: dict) -> dict:
        """
        يضمن تقنياً عدم احتواء الرد على أكثر من سؤال واحد.
        الاستراتيجية: نحتفظ بالسؤال الأخير (لأن البوت عادةً يضع تعليقاً أولاً ثم السؤال الفعلي آخراً).
        أي علامات استفهام سابقة تُستبدل بنقطة حتى لا يبدو الرد فيه أكثر من سؤال.
        """
        msg = response.get('student_message', '')
        if not msg:
            return response

        # جمع مواضع علامات الاستفهام (عربية وإنجليزية)
        q_positions = [i for i, c in enumerate(msg) if c in ('?', '؟')]

        if len(q_positions) <= 1:
            return response  # ✅ سؤال واحد أو بلا سؤال — مقبول

        # استبدال كل علامات الاستفهام ما عدا الأخيرة بنقطة
        msg_chars = list(msg)
        for pos in q_positions[:-1]:
            msg_chars[pos] = '.'
        trimmed = ''.join(msg_chars)

        print(f"DEBUG Flow-Shield: Replaced {len(q_positions) - 1} extra question marks, kept last. "
              f"Original len={len(msg)}")
        response['student_message'] = trimmed
        return response

    def _validate_track_context(self, response: dict, user_label: str, current_step: int) -> dict:
        """
        يتحقق أن الـ LLM لا يصدر recommendation_ready=true قبل اكتمال البيانات.
        يستخدم ConversationFlowManager كـ Step Guard.
        """
        if response.get('recommendation_ready') is True:
            if not ConversationFlowManager.is_ready_for_recommendation(current_step, user_label):
                print(f"WARNING Step-Guard: LLM wanted recommendation_ready=true "
                      f"at step {current_step} for {user_label} — blocked.")
                response['recommendation_ready'] = False
                # أضف سؤالاً إن لم يكن في الرد سؤال
                msg = response.get('student_message', '')
                if '?' not in msg and '؟' not in msg:
                    response['student_message'] = (
                        msg + "\n\nما زلنا بحاجة لبعض المعلومات قبل إعداد توصيتك. "
                        "هل يمكنك مشاركتي طموحك المهني؟ 🎯"
                    )
        return response

    # ──────────────────────────────────────────────────────────────────────────
    # Validation Engine: Extract + Generate for Guided Flow
    # ──────────────────────────────────────────────────────────────────────────

    def validate_answer(self, last_question: str, user_input: str) -> dict:
        """
        Use EXTRACTION_SYSTEM_PROMPT to classify if user_input is a valid answer.
        Returns: {is_valid: bool, extracted_value: str|None, side_question: str|None}
        """
        try:
            prompt = EXTRACTION_SYSTEM_PROMPT.format(
                last_question=last_question,
                user_input=user_input
            )
            raw = self.key_manager.generateGeminiResponse(prompt)
            parsed = self._parse_json_response(raw)

            if parsed and 'is_valid' in parsed:
                parsed.setdefault('extracted_value', None)
                parsed.setdefault('side_question', None)
                return parsed

            # Fallback: if we can't parse, be conservative and reject
            print(f"WARNING validate_answer: Could not parse. Raw: {raw[:200] if raw else 'None'}")
            return {"is_valid": False, "extracted_value": None, "side_question": None}
        except Exception as e:
            print(f"ERROR validate_answer: {e}")
            return {"is_valid": False, "extracted_value": None, "side_question": None}

    def generate_guided_response(self, is_valid: bool, user_input: str, side_question: str,
                                  current_question: str, next_question: str) -> dict:
        """
        Use GENERATION_SYSTEM_PROMPT to produce the AI's guided response.
        Returns standard chat JSON shape.
        """
        try:
            prompt = GENERATION_SYSTEM_PROMPT.format(
                user_input=user_input,
                is_valid=str(is_valid).lower(),
                side_question=side_question or 'null',
                current_question=current_question,
                next_question=next_question or ''
            )
            raw = self.key_manager.generateGeminiResponse(prompt)
            parsed = self._parse_json_response(raw)

            if parsed and 'student_message' in parsed:
                parsed.setdefault('supervisor_report', None)
                parsed.setdefault('confidence_tag', None)
                parsed.setdefault('recommendation_ready', False)
                # Force recommendation_ready to False in guided flow
                parsed['recommendation_ready'] = False
                return parsed

            # Fallback
            return {
                "student_message": raw or "دعني أعيد صياغة السؤال...",
                "supervisor_report": None,
                "recommendation_ready": False
            }
        except Exception as e:
            print(f"ERROR generate_guided_response: {e}")
            return {
                "student_message": "عذراً، حدث خطأ بسيط. أعد إرسال رسالتك 😊",
                "supervisor_report": None,
                "recommendation_ready": False
            }

    def generate_unified_guided_response(self, last_question: str, user_input: str, next_question: str) -> dict:
        """
        Unified call that performs both validation and response generation in one LLM turn.
        Reduces latency by 50% compared to sequential calls.
        """
        try:
            from prompts import UNIFIED_GUIDED_PROMPT
            prompt = UNIFIED_GUIDED_PROMPT.format(
                last_question=last_question,
                user_input=user_input,
                next_question=next_question or last_question
            )
            raw = self.key_manager.generateGeminiResponse(prompt)
            parsed = self._parse_json_response(raw)

            if parsed and 'is_valid' in parsed and 'student_message' in parsed:
                parsed.setdefault('extracted_value', None)
                parsed.setdefault('side_question', None)
                parsed.setdefault('supervisor_report', None)
                parsed.setdefault('confidence_tag', 'واثق')
                parsed['recommendation_ready'] = False
                return parsed

            # Fallback
            return {
                "is_valid": False,
                "extracted_value": None,
                "side_question": None,
                "student_message": raw or "دعني أحاول فهمك بشكل أفضل...",
                "supervisor_report": None,
                "recommendation_ready": False
            }
        except Exception as e:
            print(f"ERROR generate_unified_guided_response: {e}")
            return {
                "is_valid": False,
                "extracted_value": None,
                "side_question": None,
                "student_message": "عذراً، حدث خطأ بسيط. أعد إرسال رسالتك 😊",
                "supervisor_report": None,
                "recommendation_ready": False
            }

    # ──────────────────────────────────────────────────────────────────────────
    # Vision Processing: Grade Sheet Extraction
    # ──────────────────────────────────────────────────────────────────────────

    def extract_grades_from_image(self, image_data: str) -> dict:
        """
        Send grade-sheet image to Groq Vision and return structured JSON.
        image_data: base64 string (without data-URL prefix).
        """
        raw = self.key_manager.generateGeminiResponse(
            GRADE_EXTRACTION_PROMPT, image_data=image_data
        )
        parsed = self._parse_json_response(raw)
        if parsed:
            return parsed

        return {
            "overall_grade": None,
            "strong_subjects": [],
            "weak_subjects": [],
            "all_grades": {},
            "friendly_message": raw or "تعذّر تحليل الصورة، يرجى إدخال النسبة يدوياً."
        }

    # ──────────────────────────────────────────────────────────────────────────
    # Recommendation Engine (RAG-powered, Layer 1–4)
    # ──────────────────────────────────────────────────────────────────────────

    def _validate_recommendation(self, parsed: dict) -> bool:
        """Return True only if parsed contains the correct dual-view structure."""
        if not isinstance(parsed, dict):
            return False
            
        # Sometimes LLMs nest the response under a top-level key like "recommendation"
        if "Student_View" not in parsed:
            for v in parsed.values():
                if isinstance(v, dict) and "Student_View" in v:
                    parsed.update(v)
                    break

        sv = parsed.get("Student_View")
        if not isinstance(sv, dict):
            return False
            
        student_stage = parsed.get("student_stage")
        
        # ── LLM Tolerance: Infer stage if missing from top level ──
        if not student_stage:
            if "current_assessment" in sv:
                student_stage = "university_student"
                parsed["student_stage"] = student_stage
            elif "primary_recommendation" in sv:
                if sv.get("admission_requirements"):
                    student_stage = "high_school_grad"
                else:
                    student_stage = "school_student"
                parsed["student_stage"] = student_stage
                
        # We now simply trust that if Student_View is a dict, it's valid enough.
        # The frontend will fall back gracefully for missing fields.
        return True

    def _split_recommendation_views(self, parsed: dict, school_id_present: bool) -> dict:
        """
        Enforce the Student_View / Supervisor_View privacy partition.
        """
        if not isinstance(parsed, dict):
            return parsed
        
        parsed.setdefault("Supervisor_View", None)
        return parsed

    def get_recommendation(
        self,
        user_question: str,
        language: str = 'ar',
        school_id: str | None = None,
    ) -> dict:
        """
        Generate a stage-aware dual-view recommendation using full RAG context.

        Args:
            user_question : Compiled student profile / conversation summary.
            language      : 'ar' (default) or 'en'.
            school_id     : School identifier string. None = no Supervisor_View.

        Returns:
            dict with keys: student_stage, Student_View, Supervisor_View
        """
        school_id_present = bool(school_id)

        lang_instruction = (
            "أجب باللغة العربية فقط." if language == 'ar'
            else "Respond entirely in English."
        )

        context_str = self._retrieve_context(user_question)

        # Always request Supervisor_View for admin dashboard analytics
        supervisor_gate = "school_id_present = true  (يجب دائمًا إنشاء Supervisor_View وتعبئة بياناتها)"

        full_query = (
            f"{RECOMMENDATION_SYSTEM_PROMPT}\n\n"
            f"{STAGE_DETECTION_INSTRUCTION}\n\n"
            f"{lang_instruction}\n\n"
            f"## حالة المشرف:\n{supervisor_gate}\n\n"
            f"## بيانات قاعدة المعرفة المسترجعة (context):\n{context_str}\n\n"
            f"## بيانات الطالب الكاملة:\n{user_question}"
        )

        raw = self.key_manager.generateGeminiResponse(full_query)
        parsed = self._parse_json_response(raw)

        # ── Validate structure: must contain Student_View with primary_recommendation ──
        if parsed and self._validate_recommendation(parsed):
            return self._split_recommendation_views(parsed, school_id_present)

        # ── Single retry with explicit JSON reminder ──────────────────────────
        print(f"WARNING: Recommendation parsing failed or missing Student_View. Raw snippet: {str(raw)[:300]}")

        # Full retry — request ALL required fields, not just primary/alternative
        retry_query = (
            f"أعد صياغة التوصية التالية كـ JSON صالح.\n"
            f"يجب أن يحتوي الـ JSON على حقل `student_stage` (مثل school_student أو high_school_grad أو university_student)، بالإضافة لـ Student_View الذي يحتوي على هذه الحقول بالضبط:\n"
            f"- primary_recommendation (major, compatibility_bar, compatibility_label)\n"
            f"- alternative_recommendation (major, compatibility_bar) أو null\n"
            f"- why_this_major (نص شرح سببين)\n"
            f"- required_skills (قائمة مهارات)\n"
            f"- stage_guidance مع yearly_plan (قائمة خطوات سنوية)\n\n"
            f"النص الأصلي للإصلاح:\n{str(raw)[:3000]}"
        )
        raw2 = self.key_manager.generateGeminiResponse(retry_query)
        parsed2 = self._parse_json_response(raw2)
        print(f"DEBUG Retry raw snippet: {str(raw2)[:300]}")

        if parsed2 and self._validate_recommendation(parsed2):
            return self._split_recommendation_views(parsed2, school_id_present)

        print(f"ERROR: Both recommendation attempts failed.")
        return {
            "error": "فشل في توليد التوصية المُهيكلة",
            "student_message": "اعتذر منك يا بطل، واجهت مشكلة في تلخيص التوصية حالياً. هل يمكنك المحاولة مرة أخرى؟",
            "raw_response": str(raw)[:500]
        }

    # ──────────────────────────────────────────────────────────────────────────
    # Clarification Response (RAG-aware)
    # ──────────────────────────────────────────────────────────────────────────

    def get_clarification_response(self, current_question: str, user_input: str) -> dict:
        """
        Re-explain a guided question with RAG context, in simpler terms.
        Returns same JSON shape as chat_response.
        """
        context_str = self._retrieve_context(current_question)

        prompt = (
            f"{CHAT_SYSTEM_PROMPT}\n\n"
            f"## السياق المسترجع:\n{context_str}\n\n"
            f"الطالب لم يفهم هذا السؤال: \"{current_question}\"\n"
            f"قال الطالب: \"{user_input}\"\n\n"
            f"المطلوب: أعد شرح السؤال بطريقة أبسط مع مثال توضيحي.\n"
            f"أجب بـ JSON فقط: {{\"student_message\": \"...\", \"supervisor_report\": null, \"recommendation_ready\": false}}"
        )

        raw = self.key_manager.generateGeminiResponse(prompt)
        parsed = self._parse_json_response(raw)

        if parsed and "student_message" in parsed:
            parsed["supervisor_report"] = None
            parsed["recommendation_ready"] = False
            return parsed

        return {
            "student_message": raw or "دعني أوضح لك السؤال بطريقة أبسط...",
            "supervisor_report": None,
            "recommendation_ready": False
        }

    # ──────────────────────────────────────────────────────────────────────────
    # Post-Recommendation Graduate Flow Handler
    # ──────────────────────────────────────────────────────────────────────────

    def handle_post_rec_graduate(
        self,
        user_input: str,
        flow_step: str,
        recommended_major: str,
        student_gpa: str,
    ) -> dict:
        """
        Manages the interactive post-recommendation flow for high_school_grad:
        satisfaction → priority (proximity/cost) → location or cost search.

        Returns a dict with keys matching POST_REC_GRADUATE_PROMPT output.
        """
        try:
            prompt = POST_REC_GRADUATE_PROMPT.format(
                recommended_major=recommended_major,
                student_gpa=student_gpa,
                user_input=user_input,
                flow_step=flow_step,
            )
            raw = self.key_manager.generateGeminiResponse(prompt)
            parsed = self._parse_json_response(raw)

            if parsed and "student_message" in parsed:
                parsed.setdefault("flow_step_next", "satisfaction")
                parsed.setdefault("flow_action", "ask")
                parsed.setdefault("extracted_preference", None)
                parsed.setdefault("extracted_location", None)
                parsed.setdefault("supervisor_report", None)
                parsed.setdefault("confidence_tag", "واثق")
                parsed["recommendation_ready"] = False
                return parsed

            return {
                "student_message": raw or "دعني أسألك سؤالاً إضافياً...",
                "flow_step_next": flow_step,
                "flow_action": "ask",
                "extracted_preference": None,
                "extracted_location": None,
                "supervisor_report": None,
                "recommendation_ready": False,
            }
        except Exception as e:
            print(f"ERROR handle_post_rec_graduate: {e}")
            return {
                "student_message": "عذراً، حدث خطأ بسيط. أعد إرسال رسالتك 😊",
                "flow_step_next": flow_step,
                "flow_action": "ask",
                "extracted_preference": None,
                "extracted_location": None,
                "supervisor_report": None,
                "recommendation_ready": False,
            }

    # ──────────────────────────────────────────────────────────────────────────
    # University Finder (RAG-powered, GPA-aware)
    # ──────────────────────────────────────────────────────────────────────────

    def find_universities_by_preference(
        self,
        major: str,
        student_gpa: str,
        preference: str,          # "proximity" | "cost"
        university_type: str,     # "government" | "private" | "both"
        governorate: str = None,  # اختياري للـ proximity
    ) -> dict:
        """
        Search career_dataset.json for universities offering the given major,
        filtered by university_type and ranked by preference (proximity/cost).

        Returns a structured dict with a list of matching universities and
        a friendly Arabic recommendation_message.
        """
        # Build semantic query for RAG retrieval
        query = f"{major} {governorate or ''} {university_type}"
        context_str = self._retrieve_context(query)

        try:
            prompt = UNIVERSITY_FINDER_PROMPT.format(
                major=major,
                student_gpa=student_gpa,
                preference=preference,
                university_type=university_type,
                governorate=governorate or "غير محدد",
                context=context_str,
            )
            raw = self.key_manager.generateGeminiResponse(prompt)
            parsed = self._parse_json_response(raw)

            if parsed and "universities" in parsed:
                parsed.setdefault("found", bool(parsed["universities"]))
                parsed.setdefault(
                    "recommendation_message",
                    "تحقق من الجامعات المقترحة وتواصل مع إدارة القبول مباشرةً! 🎓"
                )
                return parsed

            return {
                "found": False,
                "universities": [],
                "recommendation_message": (
                    raw or "لم أتمكن من إيجاد جامعة مناسبة في قاعدة بياناتنا حالياً. "
                    "ننصحك بالتواصل مع إدارة القبول في الجامعات المتاحة في محافظتك مباشرةً."
                ),
            }
        except Exception as e:
            print(f"ERROR find_universities_by_preference: {e}")
            return {
                "found": False,
                "universities": [],
                "recommendation_message": "عذراً، حدث خطأ في البحث. حاول مجدداً 😊",
            }