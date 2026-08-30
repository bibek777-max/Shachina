"""
SHACHINA BACKEND CONFIGURATION
Institutional Grade Settings for Bibek's Personal AI & Trading Intelligence Platform.
"""

import os


class Settings:
    PROJECT_NAME: str = "SHACHINA"
    PROJECT_TITLE: str = "SHACHINA: Ultimate AI Personal Assistant & Global Trading Intelligence Platform"
    OWNER_NAME: str = "Bibek"
    WAKE_WORD: str = "HEY SHACHINA"
    API_V1_PREFIX: str = "/api/v1"
    
    SECRET_KEY: str = os.getenv("SHACHINA_SECRET_KEY", "shachina_ultra_secure_institutional_secret_key_2026")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    PRIMARY_MARKET: str = "NEPSE"
    DEFAULT_CURRENCY: str = "NPR"
    DEFAULT_TIMEZONE: str = "Asia/Kathmandu"
    
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./shachina.db")


settings = Settings()
