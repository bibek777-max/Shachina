"""
SHACHINA DATABASE MODELS
Institutional-grade relational schemas for User Management, Isolation, Security, and Settings.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from backend.app.db.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(64), unique=True, index=True, nullable=False)
    email = Column(String(128), unique=True, index=True, nullable=False)
    phone_number = Column(String(32), nullable=True)
    full_name = Column(String(128), nullable=False, default="Bibek")
    hashed_password = Column(String(256), nullable=False)
    role = Column(String(32), default="USER")  # 'USER', 'ADMIN', 'OWNER'
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=True)
    verification_code = Column(String(32), nullable=True)
    reset_token = Column(String(64), nullable=True)
    reset_token_expiry = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    profile = relationship("UserProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    preferences = relationship("UserPreferences", back_populates="user", uselist=False, cascade="all, delete-orphan")
    voice_settings = relationship("UserVoiceSettings", back_populates="user", uselist=False, cascade="all, delete-orphan")
    trading_settings = relationship("UserTradingSettings", back_populates="user", uselist=False, cascade="all, delete-orphan")
    watchlists = relationship("UserWatchlist", back_populates="user", cascade="all, delete-orphan")
    alerts = relationship("UserAlert", back_populates="user", cascade="all, delete-orphan")
    journals = relationship("UserJournal", back_populates="user", cascade="all, delete-orphan")
    paper_trades = relationship("UserPaperTrade", back_populates="user", cascade="all, delete-orphan")
    portfolios = relationship("UserPortfolio", back_populates="user", cascade="all, delete-orphan")
    memories = relationship("UserMemory", back_populates="user", cascade="all, delete-orphan")


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    bio = Column(Text, nullable=True)
    avatar_url = Column(String(256), nullable=True)
    country = Column(String(64), default="Nepal")
    city = Column(String(64), default="Kathmandu")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="profile")


class UserPreferences(Base):
    __tablename__ = "user_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    primary_market = Column(String(32), default="NEPSE")  # 'NEPSE', 'CRYPTO', 'US_STOCKS'
    supported_markets = Column(JSON, default=lambda: ["NEPSE", "CRYPTO", "US_STOCKS"])
    language = Column(String(16), default="ne")  # 'ne', 'en', 'hi'
    dark_mode = Column(Boolean, default=True)
    chart_style = Column(String(32), default="candlestick")
    onboarded = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="preferences")


class UserVoiceSettings(Base):
    __tablename__ = "user_voice_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    wake_word = Column(String(64), default="HEY SHACHINA")
    voice_enabled = Column(Boolean, default=True)
    speech_language = Column(String(16), default="ne")
    voice_speed = Column(Float, default=1.0)
    auto_speak_alerts = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="voice_settings")


class UserTradingSettings(Base):
    __tablename__ = "user_trading_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    account_size = Column(Float, default=1000000.0)  # Default NPR 1,000,000
    currency = Column(String(16), default="NPR")
    risk_percentage = Column(Float, default=1.0)  # 1% risk per trade
    max_daily_loss = Column(Float, default=3.0)  # 3% max daily loss
    min_risk_reward = Column(Float, default=2.0)  # 1:2 R:R minimum
    max_open_positions = Column(Integer, default=5)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="trading_settings")


class UserWatchlist(Base):
    __tablename__ = "user_watchlists"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    symbol = Column(String(32), index=True, nullable=False)
    market = Column(String(32), default="NEPSE", nullable=False)
    added_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="watchlists")


class UserAlert(Base):
    __tablename__ = "user_alerts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    symbol = Column(String(32), index=True, nullable=False)
    market = Column(String(32), default="NEPSE", nullable=False)
    alert_type = Column(String(32), default="PRICE")  # 'PRICE', 'SIGNAL', 'STRUCTURE'
    condition = Column(String(32), nullable=False)  # 'ABOVE', 'BELOW', 'BREAKOUT'
    target_value = Column(Float, nullable=False)
    is_active = Column(Boolean, default=True)
    triggered_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="alerts")


class UserJournal(Base):
    __tablename__ = "user_journals"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    symbol = Column(String(32), nullable=False)
    market = Column(String(32), default="NEPSE", nullable=False)
    direction = Column(String(16), nullable=False)  # 'BUY', 'SELL'
    entry_price = Column(Float, nullable=False)
    exit_price = Column(Float, nullable=True)
    pnl = Column(Float, nullable=True)
    strategy = Column(String(64), nullable=True)
    setup_score = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="journals")


class UserPaperTrade(Base):
    __tablename__ = "user_paper_trades"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    symbol = Column(String(32), nullable=False)
    market = Column(String(32), default="NEPSE", nullable=False)
    trade_type = Column(String(16), default="BUY", nullable=False)
    quantity = Column(Float, nullable=False)
    entry_price = Column(Float, nullable=False)
    stop_loss = Column(Float, nullable=True)
    target = Column(Float, nullable=True)
    pnl = Column(Float, default=0.0)
    status = Column(String(16), default="OPEN")  # 'OPEN', 'CLOSED', 'CANCELLED'
    opened_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    closed_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="paper_trades")


class UserPortfolio(Base):
    __tablename__ = "user_portfolios"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    symbol = Column(String(32), nullable=False)
    market = Column(String(32), default="NEPSE", nullable=False)
    quantity = Column(Float, default=0.0)
    avg_buy_price = Column(Float, default=0.0)
    total_invested = Column(Float, default=0.0)
    current_value = Column(Float, default=0.0)
    unrealized_pnl = Column(Float, default=0.0)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="portfolios")


class UserMemory(Base):
    __tablename__ = "user_memories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    memory_key = Column(String(128), nullable=False)
    memory_value = Column(Text, nullable=False)
    category = Column(String(64), default="GENERAL")  # 'TRADING_STYLE', 'PREFERENCES', 'PERSONAL'
    is_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="memories")


class SignalAudit(Base):
    __tablename__ = "signal_audits"

    id = Column(Integer, primary_key=True, index=True)
    signal_id = Column(String(64), unique=True, index=True, nullable=False)
    symbol = Column(String(32), index=True, nullable=False)
    market = Column(String(32), nullable=False)
    timeframe = Column(String(16), nullable=False)
    data_quality_score = Column(Float, nullable=False)
    decision = Column(String(32), nullable=False)  # BUY_SETUP, SELL_SETUP, WAIT
    setup_score = Column(Float, nullable=False)
    entry_zone = Column(String(64), nullable=True)
    stop_loss = Column(Float, nullable=True)
    target_1 = Column(Float, nullable=True)
    target_2 = Column(Float, nullable=True)
    reasons = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
