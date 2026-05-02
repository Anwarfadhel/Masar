import os
import requests
import json
from dotenv import load_dotenv

class KeyManager:
    def __init__(self):
        # Force reload .env to catch any recent changes
        load_dotenv(override=True)
        
        # Allow defining multiple keys in .env
        keys_str = os.getenv("GEMINI_API_KEYS", "")
        if keys_str:
            self.keys = [k.strip('"').strip("'").strip() for k in keys_str.split(',') if k.strip()]
        else:
            single_key = os.getenv("GEMINI_API_KEY", "")
            self.keys = [single_key.strip('"').strip("'")] if single_key else []

        self.current_index = 0

    def get_current_key(self):
        if not self.keys:
            return None
        return self.keys[self.current_index]

    def switch_key(self):
        if not self.keys:
            return
        self.current_index = (self.current_index + 1) % len(self.keys)

    def generateGeminiResponse(self, prompt, image_data=None, **kwargs):
        """
        Wraps Gemini REST API with automatic key fallback on quota errors.
        Model: gemini-1.5-flash (supports multimodal / vision input and fast text generation).
        """
        if not self.keys:
            print("No GEMINI API keys configured.")
            return "AI service is temporarily unavailable"

        max_retries = len(self.keys)

        for attempt in range(max_retries):
            current_key = self.get_current_key()
            print(f"Using Gemini key #{self.current_index + 1} (attempt {attempt + 1}/{max_retries})")

            try:
                headers = {
                    "Content-Type": "application/json"
                }

                # Construct parts array
                parts = [{"text": prompt}]
                if image_data:
                    parts.append({
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": image_data
                        }
                    })

                payload = {
                    "contents": [
                        {
                            "role": "user",
                            "parts": parts
                        }
                    ],
                    "generationConfig": {
                        "temperature": 0.1,
                        "topP": 0.95,
                        "topK": 64,
                        "maxOutputTokens": 2048,
                        "responseMimeType": "application/json"
                    }
                }

                import time
                start_time = time.time()
                
                # gemini-flash-latest points to Gemini 1.5 Flash
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key={current_key}"
                
                response = requests.post(
                    url,
                    headers=headers,
                    json=payload,
                    timeout=30
                )

                elapsed = time.time() - start_time
                if response.status_code == 200:
                    resp_json = response.json()
                    try:
                        content = resp_json["candidates"][0]["content"]["parts"][0]["text"]
                        print(f"Gemini Request successful in {elapsed:.2f}s")
                        return content
                    except (KeyError, IndexError) as e:
                        print(f"Unexpected response format: {resp_json}")
                        self.switch_key()
                        continue

                # ── Rate-limit / quota / 503: rotate key with delay ──
                if response.status_code in [429, 500, 503]:
                    next_idx = (self.current_index + 1) % len(self.keys)
                    print(f"API Error ({response.status_code}) on key #{self.current_index + 1}. Waiting 1s before switching to key #{next_idx + 1}")
                    time.sleep(1) # Small delay to respect rate limits
                    self.switch_key()
                    continue

                # ── Other HTTP errors ──
                print(f"Critical API Error ({response.status_code}): {response.text[:200]}")
                self.switch_key()

            except requests.exceptions.Timeout:
                print(f"Request timed out on key #{self.current_index + 1}")
                self.switch_key()
            except Exception as e:
                print(f"Request failed: {e}")
                self.switch_key()

        print("All keys exhausted or failed.")
        return "AI service is temporarily unavailable"
