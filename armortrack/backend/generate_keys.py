#!/usr/bin/env python3
"""
Generate secure random keys for ArmorTrack backend
Run this script to generate JWT_SECRET and AES_KEY
"""

import secrets
import string

def generate_jwt_secret(length=64):
    """Generate a secure JWT secret key"""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return ''.join(secrets.choice(alphabet) for _ in range(length))

def generate_aes_key():
    """Generate a 32-byte AES key (256-bit) in hex format"""
    return secrets.token_hex(32)

if __name__ == "__main__":
    print("=" * 60)
    print("ArmorTrack Backend - Key Generator")
    print("=" * 60)
    print()
    
    jwt_secret = generate_jwt_secret()
    aes_key = generate_aes_key()
    
    print("📝 Copy these values to your .env file:\n")
    print(f"JWT_SECRET={jwt_secret}")
    print(f"AES_KEY={aes_key}")
    print()
    print("=" * 60)
    print("⚠️  IMPORTANT: Save these keys securely!")
    print("   - JWT_SECRET: Used for signing authentication tokens")
    print("   - AES_KEY: Used for encrypting asset payloads")
    print("   - Never commit these to version control")
    print("=" * 60)
