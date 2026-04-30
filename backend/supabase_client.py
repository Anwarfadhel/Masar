import os
import sys
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

if not url or not key:
    print("WARNING: SUPABASE_URL or valid key not found in environment variables.")
    print("  → Database features will be disabled. Check your .env file.")
    supabase: Client = None
else:
    try:
        supabase: Client = create_client(url, key)
    except Exception as e:
        print(f"ERROR: Failed to initialize Supabase client: {e}")
        supabase: Client = None
