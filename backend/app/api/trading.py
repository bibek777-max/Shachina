"""
SHACHINA CONTROLLED TRADING API
Endpoints for managing open positions, orders, execution confirmation,
position modification, emergency kill switch, trade audit logs, and portfolio summary.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from backend.app.db.database import get_db
from backend.app.db.models import (
    User,
    TradeOrder,
    TradingPosition,
    TradeAuditLog,
    UserTradingSettings,
)
from backend.app.api.auth import get_current_user
from backend.app.services.broker_service import ControlledBrokerEngine
from shachina_quant.core.models import MarketType
from shachina_quant.data.factory import MarketDataProviderRegistry

router = APIRouter(prefix="/trading", tags=["Trading Execution"])


class PlaceOrderRequest(BaseModel):
    symbol: str
    market: str = "NEPSE"
    order_type: str = "BUY"  # 'BUY' | 'SELL'
    quantity: float
    price: float
    stop_loss: Optional[float] = None
    target: Optional[float] = None
    confirmed: bool = False  # Explicit user confirmation check


class ModifyPositionRequest(BaseModel):
    position_id: str
    stop_loss: Optional[float] = None
    target: Optional[float] = None


class ClosePositionRequest(BaseModel):
    position_id: str
    exit_price: Optional[float] = None
    confirmed: bool = False


class EmergencyStopRequest(BaseModel):
    enabled: bool


class UpdateTradingSettingsRequest(BaseModel):
    account_size: Optional[float] = None
    risk_percentage: Optional[float] = None
    max_daily_loss: Optional[float] = None
    min_risk_reward: Optional[float] = None


def _get_live_price(symbol: str, market: str, fallback: float) -> float:
    """Safely fetch latest market price, return fallback on any error."""
    try:
        m_enum = MarketType(market)
        provider = MarketDataProviderRegistry.get_provider(m_enum)
        ohlcv = provider.get_historical_ohlcv(symbol, limit=2)
        if ohlcv.latest_candle:
            return float(ohlcv.latest_candle.close)
    except Exception:
        pass
    return fallback


@router.get("/positions")
async def get_positions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(TradingPosition).where(
        (TradingPosition.user_id == current_user.id) &
        (TradingPosition.status == "OPEN")
    ).order_by(TradingPosition.opened_at.desc())
    positions = (await db.execute(query)).scalars().all()

    results = []
    for p in positions:
        curr_p = _get_live_price(p.symbol, p.market, p.entry_price)

        if p.direction == "LONG":
            unrealized = (curr_p - p.entry_price) * p.quantity
            unrealized_pct = ((curr_p - p.entry_price) / max(p.entry_price, 1.0)) * 100.0
        else:  # SHORT
            unrealized = (p.entry_price - curr_p) * p.quantity
            unrealized_pct = ((p.entry_price - curr_p) / max(p.entry_price, 1.0)) * 100.0

        # Update stored value in DB for PnL reporting
        p.current_price = curr_p
        p.unrealized_pnl = round(unrealized, 2)

        results.append({
            "id": p.id,
            "symbol": p.symbol,
            "market": p.market,
            "direction": p.direction,
            "quantity": p.quantity,
            "entry_price": p.entry_price,
            "current_price": round(curr_p, 2),
            "stop_loss": p.stop_loss,
            "target": p.target,
            "unrealized_pnl": round(unrealized, 2),
            "unrealized_pnl_pct": round(unrealized_pct, 2),
            "status": p.status,
            "opened_at": p.opened_at.isoformat() if p.opened_at else None,
        })

    await db.commit()
    return results


@router.get("/orders")
async def get_orders(
    limit: int = Query(default=50, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(TradeOrder).where(
        TradeOrder.user_id == current_user.id
    ).order_by(TradeOrder.created_at.desc()).limit(limit)

    orders = (await db.execute(query)).scalars().all()
    return [
        {
            "id": o.id,
            "symbol": o.symbol,
            "market": o.market,
            "order_type": o.order_type,
            "quantity": o.quantity,
            "price": o.price,
            "stop_loss": o.stop_loss,
            "target": o.target,
            "status": o.status,
            "execution_mode": o.execution_mode,
            "risk_amount": o.risk_amount,
            "rejection_reason": o.rejection_reason,
            "created_at": o.created_at.isoformat() if o.created_at else None,
        }
        for o in orders
    ]


@router.get("/history")
async def get_trade_history(
    limit: int = Query(default=50, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Returns all closed positions with realized PnL."""
    query = select(TradingPosition).where(
        (TradingPosition.user_id == current_user.id) &
        (TradingPosition.status == "CLOSED")
    ).order_by(TradingPosition.closed_at.desc()).limit(limit)

    closed = (await db.execute(query)).scalars().all()
    return [
        {
            "id": p.id,
            "symbol": p.symbol,
            "market": p.market,
            "direction": p.direction,
            "quantity": p.quantity,
            "entry_price": p.entry_price,
            "exit_price": round(p.current_price, 2) if p.current_price else p.entry_price,
            "stop_loss": p.stop_loss,
            "target": p.target,
            "realized_pnl": round(p.realized_pnl or 0.0, 2),
            "status": p.status,
            "opened_at": p.opened_at.isoformat() if p.opened_at else None,
            "closed_at": p.closed_at.isoformat() if p.closed_at else None,
        }
        for p in closed
    ]


@router.get("/portfolio")
async def get_portfolio_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Returns full account summary: open PnL, realized PnL, account equity, win rate."""
    ts = current_user.trading_settings

    open_q = select(TradingPosition).where(
        (TradingPosition.user_id == current_user.id) &
        (TradingPosition.status == "OPEN")
    )
    closed_q = select(TradingPosition).where(
        (TradingPosition.user_id == current_user.id) &
        (TradingPosition.status == "CLOSED")
    )
    all_open = (await db.execute(open_q)).scalars().all()
    all_closed = (await db.execute(closed_q)).scalars().all()

    total_unrealized = 0.0
    for p in all_open:
        curr_p = _get_live_price(p.symbol, p.market, p.entry_price)
        if p.direction == "LONG":
            total_unrealized += (curr_p - p.entry_price) * p.quantity
        else:
            total_unrealized += (p.entry_price - curr_p) * p.quantity

    total_realized = sum(p.realized_pnl or 0.0 for p in all_closed)
    net_pnl = total_unrealized + total_realized

    winning = [p for p in all_closed if (p.realized_pnl or 0.0) > 0]
    win_rate = (len(winning) / max(len(all_closed), 1)) * 100.0

    account_size = ts.account_size if ts else 1000000.0
    account_equity = account_size + net_pnl

    return {
        "account_size": account_size,
        "account_equity": round(account_equity, 2),
        "currency": ts.currency if ts else "NPR",
        "total_unrealized_pnl": round(total_unrealized, 2),
        "total_realized_pnl": round(total_realized, 2),
        "net_pnl": round(net_pnl, 2),
        "open_positions": len(all_open),
        "closed_trades": len(all_closed),
        "win_rate": round(win_rate, 1),
        "risk_percentage": ts.risk_percentage if ts else 1.0,
        "max_daily_loss": ts.max_daily_loss if ts else 3.0,
        "min_risk_reward": ts.min_risk_reward if ts else 2.0,
        "emergency_stop_enabled": ts.emergency_stop_enabled if ts else False,
    }


@router.get("/settings")
async def get_trading_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Return current user trading settings."""
    ts = current_user.trading_settings
    if not ts:
        ts = UserTradingSettings(user_id=current_user.id)
        db.add(ts)
        await db.commit()
    return {
        "account_size": ts.account_size,
        "currency": ts.currency,
        "risk_percentage": ts.risk_percentage,
        "max_daily_loss": ts.max_daily_loss,
        "min_risk_reward": ts.min_risk_reward,
        "max_open_positions": ts.max_open_positions,
        "emergency_stop_enabled": ts.emergency_stop_enabled,
    }


@router.put("/settings")
async def update_trading_settings(
    req: UpdateTradingSettingsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update user trading parameters."""
    ts = current_user.trading_settings
    if not ts:
        ts = UserTradingSettings(user_id=current_user.id)
        db.add(ts)

    if req.account_size is not None:
        if req.account_size <= 0:
            raise HTTPException(status_code=400, detail="Account size must be positive.")
        ts.account_size = req.account_size
    if req.risk_percentage is not None:
        if not (0.1 <= req.risk_percentage <= 10.0):
            raise HTTPException(status_code=400, detail="Risk % must be between 0.1% and 10%.")
        ts.risk_percentage = req.risk_percentage
    if req.max_daily_loss is not None:
        if not (0.5 <= req.max_daily_loss <= 20.0):
            raise HTTPException(status_code=400, detail="Max daily loss must be between 0.5% and 20%.")
        ts.max_daily_loss = req.max_daily_loss
    if req.min_risk_reward is not None:
        if not (0.5 <= req.min_risk_reward <= 10.0):
            raise HTTPException(status_code=400, detail="Min R:R must be between 0.5 and 10.")
        ts.min_risk_reward = req.min_risk_reward

    await db.commit()
    return {"message": "Trading settings updated.", "account_size": ts.account_size, "risk_percentage": ts.risk_percentage}


@router.post("/order")
async def place_order(
    req: PlaceOrderRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not req.confirmed:
        raise HTTPException(
            status_code=400,
            detail="Order requires explicit user confirmation. Please review the proposal details and confirm.",
        )

    if req.quantity <= 0 or req.price <= 0:
        raise HTTPException(status_code=400, detail="Quantity and Price must be positive values.")

    client_ip = request.client.host if request.client else "127.0.0.1"

    result = await ControlledBrokerEngine.execute_confirmed_order(
        db=db,
        user=current_user,
        symbol=req.symbol,
        market=req.market,
        order_type=req.order_type,
        quantity=req.quantity,
        price=req.price,
        stop_loss=req.stop_loss,
        target=req.target,
        client_ip=client_ip,
    )

    if not result.success:
        raise HTTPException(status_code=400, detail=result.message)

    return result.to_dict()


@router.post("/modify-position")
async def modify_position(
    req: ModifyPositionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(TradingPosition).where(
        (TradingPosition.id == req.position_id) &
        (TradingPosition.user_id == current_user.id) &
        (TradingPosition.status == "OPEN")
    )
    pos = (await db.execute(query)).scalars().first()
    if not pos:
        raise HTTPException(status_code=404, detail="Active position not found.")

    if req.stop_loss is not None:
        pos.stop_loss = req.stop_loss
    if req.target is not None:
        pos.target = req.target

    audit = TradeAuditLog(
        user_id=current_user.id,
        action="POSITION_MODIFIED",
        details={"position_id": pos.id, "stop_loss": req.stop_loss, "target": req.target},
        timestamp=datetime.now(timezone.utc)
    )
    db.add(audit)
    await db.commit()

    return {"message": "Position parameters updated successfully.", "stop_loss": pos.stop_loss, "target": pos.target}


@router.post("/close-position")
async def close_position(
    req: ClosePositionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not req.confirmed:
        raise HTTPException(status_code=400, detail="Closing a position requires explicit confirmation.")

    query = select(TradingPosition).where(
        (TradingPosition.id == req.position_id) &
        (TradingPosition.user_id == current_user.id) &
        (TradingPosition.status == "OPEN")
    )
    pos = (await db.execute(query)).scalars().first()
    if not pos:
        raise HTTPException(status_code=404, detail="Active position not found.")

    now = datetime.now(timezone.utc)
    if req.exit_price:
        exit_p = req.exit_price
    else:
        exit_p = _get_live_price(pos.symbol, pos.market, pos.entry_price)

    pos.status = "CLOSED"
    pos.closed_at = now
    pos.current_price = exit_p
    if pos.direction == "LONG":
        pos.realized_pnl = (exit_p - pos.entry_price) * pos.quantity
    else:  # SHORT
        pos.realized_pnl = (pos.entry_price - exit_p) * pos.quantity
    pos.unrealized_pnl = 0.0

    audit = TradeAuditLog(
        user_id=current_user.id,
        action="POSITION_CLOSED",
        details={
            "position_id": pos.id,
            "symbol": pos.symbol,
            "direction": pos.direction,
            "exit_price": exit_p,
            "realized_pnl": pos.realized_pnl
        },
        timestamp=now
    )
    db.add(audit)
    await db.commit()

    pnl_str = f"{'+ NPR' if pos.realized_pnl >= 0 else '- NPR'} {abs(pos.realized_pnl):,.2f}"
    return {
        "message": f"Position {pos.symbol} ({pos.direction}) closed at NPR {exit_p:.2f}. Realized P/L: {pnl_str}",
        "realized_pnl": round(pos.realized_pnl, 2),
        "exit_price": exit_p,
    }


@router.post("/emergency-stop")
async def toggle_emergency_stop(
    req: EmergencyStopRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    ts = current_user.trading_settings
    if not ts:
        ts = UserTradingSettings(user_id=current_user.id)
        db.add(ts)

    ts.emergency_stop_enabled = req.enabled

    audit = TradeAuditLog(
        user_id=current_user.id,
        action="EMERGENCY_STOP_TOGGLED",
        details={"enabled": req.enabled},
        timestamp=datetime.now(timezone.utc)
    )
    db.add(audit)
    await db.commit()

    status_str = "ENABLED (All new trading HALTED)" if req.enabled else "DISABLED (Trading ACTIVE)"
    return {"message": f"Emergency kill switch {status_str}.", "emergency_stop_enabled": req.enabled}
