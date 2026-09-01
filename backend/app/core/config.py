"""
SHACHINA BACKEND CONFIGURATION
Institutional Grade Settings for Bibek's Personal AI & Trading Intelligence Platform.
Production & Local Cloud Multi-Environment Configuration.
"""

import os
from typing import List


class Settings:
    PROJECT_NAME: str = "SHACHINA"
    PROJECT_TITLE: str = os.getenv("PROJECT_TITLE", "SHACHINA: Ultimate AI Personal Assistant & Global Trading Intelligence Platform")
    OWNER_NAME: str = os.getenv("OWNER_NAME", "Bibek")
    WAKE_WORD: str = os.getenv("WAKE_WORD", "HEY SHACHINA")
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "production")
    
    SECRET_KEY: str = os.getenv("SHACHINA_SECRET_KEY", os.getenv("SECRET_KEY", "shachina_ultra_secure_institutional_secret_key_2026"))
    RECOVERY_SECRET: str = os.getenv("SHACHINA_RECOVERY_KEY", os.getenv("RECOVERY_SECRET", "SHACHINA_OWNER_RECOVERY_2026"))
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 24 * 30)))  # 30 days
    
    PRIMARY_MARKET: str = os.getenv("PRIMARY_MARKET", "NEPSE")
    DEFAULT_CURRENCY: str = os.getenv("DEFAULT_CURRENCY", "NPR")
    DEFAULT_TIMEZONE: str = os.getenv("DEFAULT_TIMEZONE", "Asia/Kathmandu")
    
    # Optional AI & Trading API Keys
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    TRADING_API_KEY: str = os.getenv("TRADING_API_KEY", "")
    TRADING_API_SECRET: str = os.getenv("TRADING_API_SECRET", "")
    
    # Allowed CORS Origins
    @property
    def cors_origins(self) -> List[str]:
        raw = os.getenv("ALLOWED_ORIGINS", "*")
        if raw.strip() == "*":
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]

    # Database URL normalizer (handles SQLite & PostgreSQL asyncpg)
    @property
    def database_url(self) -> str:
        raw_url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./shachina.db").strip()
        if raw_url.startswith("postgres://"):
            return raw_url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif raw_url.startswith("postgresql://") and not raw_url.startswith("postgresql+asyncpg://"):
            return raw_url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return raw_url


settings = Settings()
