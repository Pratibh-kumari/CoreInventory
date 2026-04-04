#!/usr/bin/env python3
"""
Test Supabase connection with your current keys
Run this to verify if your keys are correct
"""

from supabase import create_client
import os
from dotenv import load_dotenv

load_dotenv()

def test_connection(url, key, name, table_name="assets"):
    print(f"\n🔍 Testing {name}...")
    print(f"URL: {url}")
    print(f"Key starts with: {key[:20]}...")
    
    try:
        client = create_client(url, key)
        response = client.table(table_name).select("id").limit(1).execute()
        print(f"✅ SUCCESS! Connected to {name}")
        return True
    except Exception as e:
        print(f"❌ FAILED: {str(e)}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("Supabase Connection Test")
    print("=" * 60)
    
    sql1_url = os.getenv("SUPABASE_URL_SQL1")
    sql1_key = os.getenv("SUPABASE_KEY_SQL1")
    sql2_url = os.getenv("SUPABASE_URL_SQL2")
    sql2_key = os.getenv("SUPABASE_KEY_SQL2")
    
    sql1_ok = test_connection(sql1_url, sql1_key, "SQL_1 (Operational)", "assets")
    sql2_ok = test_connection(sql2_url, sql2_key, "SQL_2 (Audit)", "audit_log")
    
    print("\n" + "=" * 60)
    if sql1_ok and sql2_ok:
        print("✅ All connections successful!")
    else:
        print("⚠️  Some connections failed. Check your API keys.")
        print("\n📝 Make sure you're using the 'service_role' key, not 'anon' or 'sb_secret'")
        print("   Service role keys start with: eyJhbGciOiJIUzI1NiIs...")
    print("=" * 60)
