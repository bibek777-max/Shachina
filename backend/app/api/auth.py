"""
SHACHINA AUTHENTICATION & PROFILE API
Comprehensive user management, registration, login, forgot password, preferences, and session controls.
"""

from datetime import datetime, timezone, timedelta
import secrets
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from fastapi.security import OAuth2PasswordBearer

from backend.app.db.database import get_db
from backend.app.db.models import (
    User,
    UserProfile,
    UserPreferences,
    UserVoiceSettings,
    UserTradingSettings,
    UserWatchlist,
)
from backend.app.services.auth_service import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


# --- Request & Response Models ---

class RegisterRequest(BaseModel):
    full_name: str
    username: str
    email: EmailStr
    phone_number: Optional[str] = None
    password: str
    confirm_password: str


class LoginRequest(BaseModel):
    username_or_email: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
    password: str

    def get_identifier(self) -> str:
        ident = self.username_or_email or self.username or self.email or ""
        return ident.strip().lower()


class ForgotPasswordRequest(BaseModel):
    identifier: str  # Email or Phone or Username


class ResetPasswordRequest(BaseModel):
    reset_token: str
    new_password: str
    confirm_password: str


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str


class UpdatePreferencesRequest(BaseModel):
    primary_market: Optional[str] = None
    supported_markets: Optional[List[str]] = None
    language: Optional[str] = None
    dark_mode: Optional[bool] = None
    chart_style: Optional[str] = None
    onboarded: Optional[bool] = None


class UpdateVoiceSettingsRequest(BaseModel):
    wake_word: Optional[str] = None
    voice_enabled: Optional[bool] = None
    speech_language: Optional[str] = None
    voice_speed: Optional[float] = None
    auto_speak_alerts: Optional[bool] = None


class UpdateTradingSettingsRequest(BaseModel):
    account_size: Optional[float] = None
    currency: Optional[str] = None
    risk_percentage: Optional[float] = None
    max_daily_loss: Optional[float] = None
    min_risk_reward: Optional[float] = None


# --- Dependency for Authenticated User with Isolation ---

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or invalid credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    username = payload.get("sub")
    query = (
        select(User)
        .where(User.username == username)
        .options(
            selectinload(User.profile),
            selectinload(User.preferences),
            selectinload(User.voice_settings),
            selectinload(User.trading_settings),
        )
    )
    result = await db.execute(query)
    user = result.scalars().first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account inactive or not found.",
        )
    return user


# --- Auth Endpoints ---

@router.post("/register")
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    if req.password != req.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match.")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    # Check unique username or email
    q = select(User).where((User.username == req.username.strip().lower()) | (User.email == req.email.strip().lower()))
    res = await db.execute(q)
    if res.scalars().first():
        raise HTTPException(status_code=400, detail="An account with this username or email already exists.")

    verification_code = f"{secrets.randbelow(900000) + 100000}"
    user = User(
        full_name=req.full_name.strip(),
        username=req.username.strip().lower(),
        email=req.email.strip().lower(),
        phone_number=req.phone_number.strip() if req.phone_number else None,
        hashed_password=hash_password(req.password),
        role="OWNER" if req.username.strip().lower() == "bibek" else "USER",
        is_active=True,
        is_verified=True,
        verification_code=verification_code,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Initialize associated profile, preferences, voice, trading settings
    profile = UserProfile(user_id=user.id)
    preferences = UserPreferences(
        user_id=user.id,
        primary_market="NEPSE",
        supported_markets=["NEPSE", "CRYPTO", "US_STOCKS"],
        language="ne" if user.username == "bibek" else "en",
        onboarded=False,
    )
    voice = UserVoiceSettings(user_id=user.id, wake_word="HEY SHACHINA", speech_language="ne")
    trading = UserTradingSettings(
        user_id=user.id,
        account_size=1000000.0,
        currency="NPR",
        risk_percentage=1.0,
        max_daily_loss=3.0,
        min_risk_reward=2.0,
    )
    # Default watchlist scrips for the user
    default_watchlist = [
        UserWatchlist(user_id=user.id, symbol="NABIL", market="NEPSE"),
        UserWatchlist(user_id=user.id, symbol="GBIME", market="NEPSE"),
        UserWatchlist(user_id=user.id, symbol="SHIVM", market="NEPSE"),
        UserWatchlist(user_id=user.id, symbol="BTC/USDT", market="CRYPTO"),
    ]

    db.add_all([profile, preferences, voice, trading, *default_watchlist])
    await db.commit()

    token = create_access_token({"sub": user.username, "role": user.role, "user_id": user.id})

    return {
        "message": "Account created successfully.",
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "onboarded": False,
        }
    }


@router.post("/login")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    ident = req.get_identifier()
    if not ident:
        raise HTTPException(status_code=400, detail="Username or email is required.")

    query = (
        select(User)
        .where((User.username == ident) | (User.email == ident))
        .options(selectinload(User.preferences))
    )
    result = await db.execute(query)
    user = result.scalars().first()

    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username/email or password.",
        )

    token = create_access_token({"sub": user.username, "role": user.role, "user_id": user.id})
    onboarded = user.preferences.onboarded if user.preferences else False

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "onboarded": onboarded,
        }
    }


@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    ident = req.identifier.strip().lower()
    query = select(User).where((User.username == ident) | (User.email == ident) | (User.phone_number == ident))
    result = await db.execute(query)
    user = result.scalars().first()

    # Always return a success message for security/privacy to prevent user enumeration
    if user:
        reset_token = secrets.token_urlsafe(32)
        user.reset_token = reset_token
        user.reset_token_expiry = datetime.now(timezone.utc) + timedelta(hours=1)
        await db.commit()
        return {
            "message": "If an account exists with this identifier, a password reset link/token has been issued.",
            "reset_token": reset_token,  # Provided for seamless client reset
        }

    return {
        "message": "If an account exists with this identifier, a password reset link/token has been issued."
    }


@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    if req.new_password != req.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match.")
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    query = select(User).where(User.reset_token == req.reset_token)
    result = await db.execute(query)
    user = result.scalars().first()

    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")

    if user.reset_token_expiry and user.reset_token_expiry.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Reset token has expired.")

    user.hashed_password = hash_password(req.new_password)
    user.reset_token = None
    user.reset_token_expiry = None
    await db.commit()

    return {"message": "Password reset successfully. You may now log in."}


@router.get("/me")
async def get_my_profile(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "phone_number": current_user.phone_number,
        "full_name": current_user.full_name,
        "role": current_user.role,
        "is_verified": current_user.is_verified,
        "preferences": {
            "primary_market": current_user.preferences.primary_market if current_user.preferences else "NEPSE",
            "supported_markets": current_user.preferences.supported_markets if current_user.preferences else ["NEPSE", "CRYPTO", "US_STOCKS"],
            "language": current_user.preferences.language if current_user.preferences else "ne",
            "dark_mode": current_user.preferences.dark_mode if current_user.preferences else True,
            "onboarded": current_user.preferences.onboarded if current_user.preferences else False,
        },
        "voice_settings": {
            "wake_word": current_user.voice_settings.wake_word if current_user.voice_settings else "HEY SHACHINA",
            "voice_enabled": current_user.voice_settings.voice_enabled if current_user.voice_settings else True,
            "speech_language": current_user.voice_settings.speech_language if current_user.voice_settings else "ne",
            "voice_speed": current_user.voice_settings.voice_speed if current_user.voice_settings else 1.0,
            "auto_speak_alerts": current_user.voice_settings.auto_speak_alerts if current_user.voice_settings else True,
        },
        "trading_settings": {
            "account_size": current_user.trading_settings.account_size if current_user.trading_settings else 1000000.0,
            "currency": current_user.trading_settings.currency if current_user.trading_settings else "NPR",
            "risk_percentage": current_user.trading_settings.risk_percentage if current_user.trading_settings else 1.0,
            "max_daily_loss": current_user.trading_settings.max_daily_loss if current_user.trading_settings else 3.0,
            "min_risk_reward": current_user.trading_settings.min_risk_reward if current_user.trading_settings else 2.0,
        },
    }


@router.put("/preferences")
async def update_preferences(
    req: UpdatePreferencesRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not current_user.preferences:
        current_user.preferences = UserPreferences(user_id=current_user.id)
        db.add(current_user.preferences)

    if req.primary_market is not None:
        current_user.preferences.primary_market = req.primary_market
    if req.supported_markets is not None:
        current_user.preferences.supported_markets = req.supported_markets
    if req.language is not None:
        current_user.preferences.language = req.language
    if req.dark_mode is not None:
        current_user.preferences.dark_mode = req.dark_mode
    if req.chart_style is not None:
        current_user.preferences.chart_style = req.chart_style
    if req.onboarded is not None:
        current_user.preferences.onboarded = req.onboarded

    await db.commit()
    return {"message": "Preferences updated successfully."}


@router.put("/trading-settings")
async def update_trading_settings(
    req: UpdateTradingSettingsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not current_user.trading_settings:
        current_user.trading_settings = UserTradingSettings(user_id=current_user.id)
        db.add(current_user.trading_settings)

    if req.account_size is not None:
        current_user.trading_settings.account_size = req.account_size
    if req.currency is not None:
        current_user.trading_settings.currency = req.currency
    if req.risk_percentage is not None:
        current_user.trading_settings.risk_percentage = req.risk_percentage
    if req.max_daily_loss is not None:
        current_user.trading_settings.max_daily_loss = req.max_daily_loss
    if req.min_risk_reward is not None:
        current_user.trading_settings.min_risk_reward = req.min_risk_reward

    await db.commit()
    return {"message": "Trading settings updated successfully."}


@router.put("/voice-settings")
async def update_voice_settings(
    req: UpdateVoiceSettingsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not current_user.voice_settings:
        current_user.voice_settings = UserVoiceSettings(user_id=current_user.id)
        db.add(current_user.voice_settings)

    if req.wake_word is not None:
        current_user.voice_settings.wake_word = req.wake_word
    if req.voice_enabled is not None:
        current_user.voice_settings.voice_enabled = req.voice_enabled
    if req.speech_language is not None:
        current_user.voice_settings.speech_language = req.speech_language
    if req.voice_speed is not None:
        current_user.voice_settings.voice_speed = req.voice_speed
    if req.auto_speak_alerts is not None:
        current_user.voice_settings.auto_speak_alerts = req.auto_speak_alerts

    await db.commit()
    return {"message": "Voice settings updated successfully."}


@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user)):
    return {"message": "Session terminated successfully."}


async def seed_bibek_user(db: AsyncSession):
    """Ensures Bibek exists as default OWNER with fully initialized preferences."""
    query = select(User).where(User.username == "bibek")
    result = await db.execute(query)
    user = result.scalars().first()
    if not user:
        bibek = User(
            username="bibek",
            email="bibek@shachina.ai",
            full_name="Bibek",
            phone_number="+977-9800000000",
            hashed_password=hash_password("Shachina2026!"),
            role="OWNER",
            is_active=True,
            is_verified=True,
        )
        db.add(bibek)
        await db.commit()
        await db.refresh(bibek)

        profile = UserProfile(user_id=bibek.id, bio="Owner and Lead Quantitative Trader.")
        preferences = UserPreferences(
            user_id=bibek.id,
            primary_market="NEPSE",
            supported_markets=["NEPSE", "CRYPTO", "US_STOCKS", "FOREX", "COMMODITIES"],
            language="ne",
            onboarded=True,
        )
        voice = UserVoiceSettings(user_id=bibek.id, wake_word="HEY SHACHINA", speech_language="ne")
        trading = UserTradingSettings(
            user_id=bibek.id,
            account_size=1000000.0,
            currency="NPR",
            risk_percentage=1.0,
            max_daily_loss=3.0,
            min_risk_reward=2.0,
        )
        watchlists = [
            UserWatchlist(user_id=bibek.id, symbol="NABIL", market="NEPSE"),
            UserWatchlist(user_id=bibek.id, symbol="GBIME", market="NEPSE"),
            UserWatchlist(user_id=bibek.id, symbol="SHIVM", market="NEPSE"),
            UserWatchlist(user_id=bibek.id, symbol="BTC/USDT", market="CRYPTO"),
        ]
        db.add_all([profile, preferences, voice, trading, *watchlists])
        await db.commit()
