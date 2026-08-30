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
