"""
SHACHINA USER DATA API
Isolated access to user-specific watchlists, alerts, paper trades, and journals.
Strictly guarantees User A cannot access or mutate User B's records.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from backend.app.db.database import get_db
from backend.app.db.models import User, UserWatchlist, UserAlert, UserJournal
from backend.app.api.auth import get_current_user

router = APIRouter(prefix="/user", tags=["User Data"])


class AddWatchlistRequest(BaseModel):
    symbol: str
    market: str = "NEPSE"


@router.get("/watchlist")
async def get_my_watchlist(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(UserWatchlist).where(UserWatchlist.user_id == current_user.id)
    result = await db.execute(query)
    items = result.scalars().all()
    return [
        {
            "id": it.id,
            "symbol": it.symbol,
            "market": it.market,
            "added_at": it.added_at.isoformat() if it.added_at else None,
        }
        for it in items
    ]


@router.post("/watchlist")
async def add_to_watchlist(
    req: AddWatchlistRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Check if already exists in this user's isolated watchlist
    query = select(UserWatchlist).where(
        (UserWatchlist.user_id == current_user.id) &
        (UserWatchlist.symbol == req.symbol.upper()) &
        (UserWatchlist.market == req.market.upper())
    )
    res = await db.execute(query)
    if res.scalars().first():
        return {"message": "Symbol already in watchlist."}

    item = UserWatchlist(
        user_id=current_user.id,
        symbol=req.symbol.upper(),
        market=req.market.upper()
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return {"message": f"Added {req.symbol} to watchlist.", "id": item.id}


@router.delete("/watchlist/{symbol}")
async def remove_from_watchlist(
    symbol: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(UserWatchlist).where(
        (UserWatchlist.user_id == current_user.id) &
        (UserWatchlist.symbol == symbol.upper())
    )
    res = await db.execute(query)
    item = res.scalars().first()
    if not item:
        raise HTTPException(status_code=404, detail="Symbol not found in user watchlist.")

    await db.delete(item)
    await db.commit()
    return {"message": f"Removed {symbol} from watchlist."}


# ─── User Alerts API (Isolated per User) ───────────────────────────────────────
class CreateAlertRequest(BaseModel):
    symbol: str
    market: str = "NEPSE"
    alert_type: str = "PRICE"  # 'PRICE', 'SIGNAL', 'STRUCTURE'
    condition: str = "ABOVE"    # 'ABOVE', 'BELOW', 'BREAKOUT'
    target_value: float


@router.get("/alerts")
async def get_my_alerts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(UserAlert).where(UserAlert.user_id == current_user.id).order_by(UserAlert.created_at.desc())
    result = await db.execute(query)
    alerts = result.scalars().all()
    return [
        {
            "id": a.id,
            "symbol": a.symbol,
            "market": a.market,
            "alert_type": a.alert_type,
            "condition": a.condition,
            "target_value": a.target_value,
            "is_active": a.is_active,
            "triggered_at": a.triggered_at.isoformat() if a.triggered_at else None,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in alerts
    ]


@router.post("/alerts")
async def create_alert(
    req: CreateAlertRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    alert = UserAlert(
        user_id=current_user.id,
        symbol=req.symbol.upper(),
        market=req.market.upper(),
        alert_type=req.alert_type,
        condition=req.condition,
        target_value=req.target_value,
        is_active=True,
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    return {"message": f"Alert created for {req.symbol} at {req.target_value}", "id": alert.id}


@router.delete("/alerts/{alert_id}")
async def delete_alert(
    alert_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(UserAlert).where(
        (UserAlert.id == alert_id) & (UserAlert.user_id == current_user.id)
    )
    res = await db.execute(query)
    alert = res.scalars().first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")
    await db.delete(alert)
    await db.commit()
    return {"message": "Alert removed."}


# ─── User Trading Journal API (Isolated per User) ──────────────────────────────
class CreateJournalRequest(BaseModel):
    symbol: str
    market: str = "NEPSE"
    direction: str = "BUY"
    entry_price: float
    exit_price: Optional[float] = None
    pnl: Optional[float] = None
    strategy: Optional[str] = None
    setup_score: Optional[float] = None
    notes: Optional[str] = None


@router.get("/journal")
async def get_my_journal(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(UserJournal).where(UserJournal.user_id == current_user.id).order_by(UserJournal.created_at.desc())
    result = await db.execute(query)
    journals = result.scalars().all()
    return [
        {
            "id": j.id,
            "symbol": j.symbol,
            "market": j.market,
            "direction": j.direction,
            "entry_price": j.entry_price,
            "exit_price": j.exit_price,
            "pnl": j.pnl,
            "strategy": j.strategy,
            "setup_score": j.setup_score,
            "notes": j.notes,
            "created_at": j.created_at.isoformat() if j.created_at else None,
        }
        for j in journals
    ]


@router.post("/journal")
async def create_journal_entry(
    req: CreateJournalRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    entry = UserJournal(
        user_id=current_user.id,
        symbol=req.symbol.upper(),
        market=req.market.upper(),
        direction=req.direction.upper(),
        entry_price=req.entry_price,
        exit_price=req.exit_price,
        pnl=req.pnl,
        strategy=req.strategy,
        setup_score=req.setup_score,
        notes=req.notes,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return {"message": "Journal entry saved.", "id": entry.id}


@router.delete("/journal/{entry_id}")
async def delete_journal_entry(
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(UserJournal).where(
        (UserJournal.id == entry_id) & (UserJournal.user_id == current_user.id)
    )
    res = await db.execute(query)
    entry = res.scalars().first()
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found.")
    await db.delete(entry)
    await db.commit()
    return {"message": "Journal entry deleted."}
