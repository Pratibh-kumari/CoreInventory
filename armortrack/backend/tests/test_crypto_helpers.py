import os

# Minimal settings required by app.core.config.Settings
os.environ.setdefault("SUPABASE_URL_SQL1", "https://example-sql1.supabase.co")
os.environ.setdefault("SUPABASE_KEY_SQL1", "test-key-sql1")
os.environ.setdefault("SUPABASE_URL_SQL2", "https://example-sql2.supabase.co")
os.environ.setdefault("SUPABASE_KEY_SQL2", "test-key-sql2")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")
os.environ.setdefault("AES_KEY", "0123456789abcdef0123456789abcdef")

from app.core.asset_crypto import encrypt_payload
from app.core.qr_signing import build_qr_payload, sign_asset_id, verify_asset_signature


def test_encrypt_payload_returns_ciphertext_token():
    token = encrypt_payload({"asset": "AST-001", "status": "WAREHOUSE"})
    assert isinstance(token, str)
    assert len(token) > 20


def test_qr_signature_round_trip_valid():
    asset_id = "AST-001"
    signature = sign_asset_id(asset_id)
    assert verify_asset_signature(asset_id, signature) is True



def test_qr_signature_rejects_modified_asset_id():
    signature = sign_asset_id("AST-001")
    assert verify_asset_signature("AST-002", signature) is False



def test_qr_payload_format():
    asset_id = "AST-009"
    signature = sign_asset_id(asset_id)
    payload = build_qr_payload(asset_id, signature)
    assert payload.startswith("AST-009.")
