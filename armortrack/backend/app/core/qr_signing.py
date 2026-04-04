import base64
from typing import Optional

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from app.core.config import settings

_private_key = None
_public_key = None


def _load_or_create_keys():
    global _private_key, _public_key
    if _private_key is not None and _public_key is not None:
        return

    private_pem: Optional[str] = getattr(settings, "FACTORY_PRIVATE_KEY_PEM", None)
    public_pem: Optional[str] = getattr(settings, "FACTORY_PUBLIC_KEY_PEM", None)

    if private_pem and public_pem:
        _private_key = serialization.load_pem_private_key(
            private_pem.encode("utf-8"),
            password=None,
        )
        _public_key = serialization.load_pem_public_key(public_pem.encode("utf-8"))
        return

    # Development fallback: generate ephemeral keys if not configured.
    _private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    _public_key = _private_key.public_key()


def sign_asset_id(asset_id: str) -> str:
    """Sign an asset ID and return base64-encoded signature."""
    _load_or_create_keys()
    assert _private_key is not None
    signature = _private_key.sign(
        asset_id.encode("utf-8"),
        padding.PKCS1v15(),
        hashes.SHA256(),
    )
    return base64.b64encode(signature).decode("utf-8")


def verify_asset_signature(asset_id: str, signature_b64: str) -> bool:
    """Verify a base64-encoded signature for an asset ID."""
    _load_or_create_keys()
    assert _public_key is not None
    try:
        signature = base64.b64decode(signature_b64.encode("utf-8"))
        _public_key.verify(
            signature,
            asset_id.encode("utf-8"),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return True
    except Exception:
        return False


def build_qr_payload(asset_id: str, signature_b64: str) -> str:
    """Build QR payload in Asset_ID.Signature format."""
    return f"{asset_id}.{signature_b64}"
