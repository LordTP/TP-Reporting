"""
Application Configuration
"""
from pydantic_settings import BaseSettings
from typing import List
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings"""

    # Application
    APP_NAME: str = "Teliporter Reporting Platform"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "postgresql://teliporter:teliporter@localhost:5432/teliporter"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    SECRET_KEY: str = "your-secret-key-change-this-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_MINUTES: int = 60

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Square API
    SQUARE_APPLICATION_ID: str = ""
    SQUARE_APPLICATION_SECRET: str = ""
    SQUARE_ENVIRONMENT: str = "sandbox"  # or "production"
    SQUARE_REDIRECT_URI: str = "http://localhost:3000/square/callback"

    # Encryption (for storing Square tokens)
    ENCRYPTION_KEY: str = ""  # Generate with: from cryptography.fernet import Fernet; Fernet.generate_key()

    # Currency Exchange API
    EXCHANGE_RATE_API_KEY: str = ""
    EXCHANGE_RATE_API_URL: str = "https://open.er-api.com/v6/latest/GBP"

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"

    # Pagination
    DEFAULT_PAGE_SIZE: int = 100
    MAX_PAGE_SIZE: int = 1000

    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 100

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()


settings = get_settings()
