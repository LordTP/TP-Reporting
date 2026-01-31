"""
Encryption utilities for sensitive data like Square tokens
"""
from cryptography.fernet import Fernet
from app.config import settings


def get_fernet() -> Fernet:
    """Get Fernet instance for encryption/decryption"""
    if not settings.ENCRYPTION_KEY:
        raise ValueError("ENCRYPTION_KEY not set in environment variables")

    # Ensure the key is bytes
    key = settings.ENCRYPTION_KEY
    if isinstance(key, str):
        key = key.encode()

    return Fernet(key)


def encrypt_token(token: str) -> str:
    """
    Encrypt a token string

    Args:
        token: Plain text token

    Returns:
        Encrypted token as string
    """
    fernet = get_fernet()
    encrypted = fernet.encrypt(token.encode())
    return encrypted.decode()


def decrypt_token(encrypted_token: str) -> str:
    """
    Decrypt a token string

    Args:
        encrypted_token: Encrypted token string

    Returns:
        Decrypted plain text token
    """
    fernet = get_fernet()
    decrypted = fernet.decrypt(encrypted_token.encode())
    return decrypted.decode()
