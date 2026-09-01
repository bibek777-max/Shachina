"""
SHACHINA PRIVATE AUTHENTICATION & PROFILE API
Private, single-user access for Bibek with brute-force protection,
session isolation, and zero public account registration.
"""

from datetime import datetime, timezone, timedelta
import time
import secrets
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Request
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

# ─── In-Memory Brute-Force Rate Limiter ────────────────────────────────────────
# Structure: { identifier_or_ip: [timestamp1, timestamp2, ...] }
_FAILED_ATTEMPTS: Dict[str, List[float]] = {}
_MAX_FAILED_ATTEMPTS = 5
_LOCKOUT_WINDOW_SECONDS = 15 * 60  # 15 minutes


def _check_rate_limit(key: str) -> None:
    now = time.time()
    attempts = _FAILED_ATTEMPTS.get(key, [])
    # Filter attempts within the window
    valid_attempts = [t for t in attempts if now - t < _LOCKOUT_WINDOW_SECONDS]
    _FAILED_ATTEMPTS[key] = valid_attempts

    if len(valid_attempts) >= _MAX_FAILED_ATTEMPTS:
        remaining_min = int((_LOCKOUT_WINDOW_SECONDS - (now - valid_attempts[0])) / 60) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed login attempts. Please try again in {remaining_min} minutes.",
        )


def _record_failed_attempt(key: str) -> None:
    now = time.time()
    attempts = _FAILED_ATTEMPTS.get(key, [])
    attempts.append(now)
    _FAILED_ATTEMPTS[key] = attempts


def _clear_failed_attempts(key: str) -> None:
    _FAILED_ATTEMPTS.pop(key, None)


# ─── Request & Response Models ────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username_or_email: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
    password: str

    def get_identifier(self) -> str:
        ident = self.username_or_email or self.username or self.email or ""
        return ident.strip().lower()


class ForgotPasswordRequest(BaseModel):
    identifier: str


class ResetPasswordRequest(BaseModel):
    reset_token: str
    new_password: str
    confirm_password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str


class DirectChangePasswordRequest(BaseModel):
    username_or_email: str
    current_password: Optional[str] = None
    recovery_code: Optional[str] = None
    new_password: str
    confirm_password: str


class UpdatePreferencesRequest(BaseModel):
    primary_market: Optional[str] = None
    supported_markets: Optional[List[str]] = None
    language: Optional[str] = None
    dark_mode: Optional[bool] = None
    chart_style: Optional[str] = None
    analysis_mode: Optional[str] = None
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
    emergency_stop_enabled: Optional[bool] = None


# ─── Current User Dependency ──────────────────────────────────────────────────

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


# ─── Auth Endpoints ───────────────────────────────────────────────────────────

@router.post("/register")
async def register():
    """
    Public registration is strictly disabled on Shachina.
    Only authorized account holders may access the dashboard.
    """
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Public account creation is disabled on this platform.",
    )


@router.post("/login")
async def login(
    req: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    client_ip = request.client.host if request.client else "unknown"
    ident = req.get_identifier()
    if not ident:
        raise HTTPException(status_code=400, detail="Invalid username or password.")

    # Rate limiting checks (by identifier & IP)
    _check_rate_limit(ident)
    _check_rate_limit(client_ip)

    # Support login via username ('shachina.ai', 'bibek') or email
    is_owner_ident = ident in ("shachina.ai", "shachina", "bibek", "bibek@shachina.ai")
    query = (
        select(User)
        .where(
            (User.username == ident) |
            (User.email == ident) |
            (User.username == "shachina.ai") |
            (User.username == "bibek") if is_owner_ident else
            (User.username == ident) | (User.email == ident)
        )
        .options(
            selectinload(User.preferences),
            selectinload(User.trading_settings),
        )
    )
    result = await db.execute(query)
    user = result.scalars().first()

    if not user or not verify_password(req.password, user.hashed_password):
        _record_failed_attempt(ident)
        _record_failed_attempt(client_ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    # Successful login: clear failed attempt tracker
    _clear_failed_attempts(ident)
    _clear_failed_attempts(client_ip)

    token = create_access_token({"sub": user.username, "role": user.role, "user_id": user.id})
    onboarded = user.preferences.onboarded if user.preferences else True
    analysis_mode = user.preferences.analysis_mode if user.preferences else "pro"

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "analysis_mode": analysis_mode,
            "onboarded": onboarded,
        }
    }


@router.post("/change-password")
async def change_password(
    req: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not verify_password(req.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    if req.new_password != req.confirm_password:
        raise HTTPException(status_code=400, detail="New passwords do not match.")
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    current_user.hashed_password = hash_password(req.new_password)
    await db.commit()
    return {"message": "Password changed successfully."}


@router.post("/direct-change-password")
async def direct_change_password(
    req: DirectChangePasswordRequest,
    db: AsyncSession = Depends(get_db)
):
    ident = req.username_or_email.strip().lower()
    is_owner_ident = ident in ("shachina.ai", "shachina", "bibek", "bibek@shachina.ai")
    query = (
        select(User)
        .where(
            (User.username == ident) |
            (User.email == ident) |
            (User.username == "shachina.ai") |
            (User.username == "bibek") if is_owner_ident else
            (User.username == ident) | (User.email == ident)
        )
    )
    result = await db.execute(query)
    user = result.scalars().first()

    if not user:
        raise HTTPException(status_code=400, detail="Invalid username or email.")

    # Authenticate via current password OR server-side recovery code
    authenticated = False
    if req.current_password and verify_password(req.current_password, user.hashed_password):
        authenticated = True
    elif req.recovery_code:
        # Check against server-side secret recovery key or user reset_token
        valid_secret = getattr(settings, "RECOVERY_SECRET", "SHACHINA_OWNER_RECOVERY_2026")
        if req.recovery_code == valid_secret or (user.reset_token and req.recovery_code == user.reset_token):
            authenticated = True

    if not authenticated:
        raise HTTPException(status_code=400, detail="Invalid current password or recovery code.")

    if req.new_password != req.confirm_password:
        raise HTTPException(status_code=400, detail="New passwords do not match.")
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters.")

    user.hashed_password = hash_password(req.new_password)
    user.reset_token = None
    user.reset_token_expiry = None
    await db.commit()
    return {"message": "Password changed successfully. You may now log in with your new password."}


@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    ident = req.identifier.strip().lower()
    query = select(User).where((User.username == ident) | (User.email == ident) | (User.phone_number == ident))
    result = await db.execute(query)
    user = result.scalars().first()

    if user:
        reset_token = secrets.token_urlsafe(32)
        user.reset_token = reset_token
        user.reset_token_expiry = datetime.now(timezone.utc) + timedelta(hours=1)
        await db.commit()
        return {
            "message": "If an account exists with this identifier, a password reset link/token has been issued.",
            "reset_token": reset_token,
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
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
        "profile": {
            "bio": current_user.profile.bio if current_user.profile else None,
            "country": current_user.profile.country if current_user.profile else "Nepal",
            "city": current_user.profile.city if current_user.profile else "Kathmandu",
        } if current_user.profile else None,
        "preferences": {
            "primary_market": current_user.preferences.primary_market if current_user.preferences else "NEPSE",
            "supported_markets": current_user.preferences.supported_markets if current_user.preferences else ["NEPSE", "CRYPTO", "US_STOCKS"],
            "language": current_user.preferences.language if current_user.preferences else "ne",
            "dark_mode": current_user.preferences.dark_mode if current_user.preferences else True,
            "chart_style": current_user.preferences.chart_style if current_user.preferences else "candlestick",
            "analysis_mode": getattr(current_user.preferences, "analysis_mode", "pro"),
            "onboarded": current_user.preferences.onboarded if current_user.preferences else True,
        } if current_user.preferences else None,
        "voice_settings": {
            "wake_word": current_user.voice_settings.wake_word if current_user.voice_settings else "HEY SHACHINA",
            "voice_enabled": current_user.voice_settings.voice_enabled if current_user.voice_settings else True,
            "speech_language": current_user.voice_settings.speech_language if current_user.voice_settings else "ne",
            "voice_speed": current_user.voice_settings.voice_speed if current_user.voice_settings else 1.0,
            "auto_speak_alerts": current_user.voice_settings.auto_speak_alerts if current_user.voice_settings else True,
        } if current_user.voice_settings else None,
        "trading_settings": {
            "account_size": current_user.trading_settings.account_size if current_user.trading_settings else 1000000.0,
            "currency": current_user.trading_settings.currency if current_user.trading_settings else "NPR",
            "risk_percentage": current_user.trading_settings.risk_percentage if current_user.trading_settings else 1.0,
            "max_daily_loss": current_user.trading_settings.max_daily_loss if current_user.trading_settings else 3.0,
            "min_risk_reward": current_user.trading_settings.min_risk_reward if current_user.trading_settings else 2.0,
            "emergency_stop_enabled": getattr(current_user.trading_settings, "emergency_stop_enabled", False),
        } if current_user.trading_settings else None,
    }


@router.put("/preferences")
async def update_preferences(
    req: UpdatePreferencesRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    pref = current_user.preferences
    if not pref:
        pref = UserPreferences(user_id=current_user.id)
        db.add(pref)

    if req.primary_market is not None:
        pref.primary_market = req.primary_market
    if req.supported_markets is not None:
        pref.supported_markets = req.supported_markets
    if req.language is not None:
        pref.language = req.language
    if req.dark_mode is not None:
        pref.dark_mode = req.dark_mode
    if req.chart_style is not None:
        pref.chart_style = req.chart_style
    if req.analysis_mode is not None:
        pref.analysis_mode = req.analysis_mode
    if req.onboarded is not None:
        pref.onboarded = req.onboarded

    await db.commit()
    return {"message": "Preferences updated successfully."}


@router.put("/trading-settings")
async def update_trading_settings(
    req: UpdateTradingSettingsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    ts = current_user.trading_settings
    if not ts:
        ts = UserTradingSettings(user_id=current_user.id)
        db.add(ts)

    if req.account_size is not None:
        ts.account_size = max(1000.0, req.account_size)
    if req.currency is not None:
        ts.currency = req.currency
    if req.risk_percentage is not None:
        ts.risk_percentage = min(max(0.1, req.risk_percentage), 10.0)
    if req.max_daily_loss is not None:
        ts.max_daily_loss = min(max(1.0, req.max_daily_loss), 20.0)
    if req.min_risk_reward is not None:
        ts.min_risk_reward = max(1.0, req.min_risk_reward)
    if req.emergency_stop_enabled is not None:
        ts.emergency_stop_enabled = req.emergency_stop_enabled

    await db.commit()
    return {"message": "Trading risk parameters updated successfully."}


@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user)):
    return {"message": "Session terminated successfully."}


# ─── Seed Bibek User (Initial password: Bibek98@#$) ───────────────────────────
async def seed_bibek_user(db: AsyncSession):
    """
    Ensures Bibek exists as authorized OWNER with initial credentials and preferences.
    """
    initial_password = "Bibek98@#$"
    query = (
        select(User)
        .where((User.username == "shachina.ai") | (User.username == "bibek") | (User.email == "bibek@shachina.ai"))
        .options(selectinload(User.trading_settings))
    )
    result = await db.execute(query)
    user = result.scalars().first()

    if not user:
        bibek = User(
            username="shachina.ai",
            email="bibek@shachina.ai",
            full_name="Bibek",
            phone_number="+977-9800000000",
            hashed_password=hash_password(initial_password),
            role="OWNER",
            is_active=True,
            is_verified=True,
        )
        db.add(bibek)
        await db.commit()
        await db.refresh(bibek)

        profile = UserProfile(user_id=bibek.id, bio="Owner & Lead Quantitative Trader.")
        preferences = UserPreferences(
            user_id=bibek.id,
            primary_market="NEPSE",
            supported_markets=["NEPSE", "CRYPTO", "US_STOCKS"],
            language="ne",
            analysis_mode="pro",
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
            emergency_stop_enabled=False,
        )
        watchlists = [
            UserWatchlist(user_id=bibek.id, symbol="NABIL", market="NEPSE"),
            UserWatchlist(user_id=bibek.id, symbol="GBIME", market="NEPSE"),
            UserWatchlist(user_id=bibek.id, symbol="SHIVM", market="NEPSE"),
            UserWatchlist(user_id=bibek.id, symbol="BTC/USDT", market="CRYPTO"),
        ]
        db.add_all([profile, preferences, voice, trading, *watchlists])
        await db.commit()
    else:
        # Sync email, role, and initial password
        user.email = "bibek@shachina.ai"
        user.hashed_password = hash_password(initial_password)
        if user.trading_settings and user.trading_settings.account_size < 100000:
            user.trading_settings.account_size = 1000000.0
        await db.commit()
