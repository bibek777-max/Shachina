"""
SHACHINA CONTROLLED TRADING API
Endpoints for managing open positions, orders, execution confirmation,
position modification, emergency kill switch, and trade audit logs.
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


@router.get("/positions")
async def get_positions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(TradingPosition).where(
        (TradingPosition.user_id == current_user.id) &
        (TradingPosition.status == "OPEN")
    )
    positions = (await db.execute(query)).scalars().all()

    # Update unrealized PnL using latest live price where available
    results = []
    for p in positions:
        curr_p = p.entry_price
        try:
            m_enum = MarketType(p.market)
            provider = MarketDataProviderRegistry.get_provider(m_enum)
            ohlcv = provider.get_historical_ohlcv(p.symbol, limit=2)
            if ohlcv.latest_candle:
                curr_p = ohlcv.latest_candle.close
        except Exception:
            pass

        unrealized = (curr_p - p.entry_price) * p.quantity if p.direction == "LONG" else (p.entry_price - curr_p) * p.quantity
        unrealized_pct = ((curr_p - p.entry_price) / max(p.entry_price, 1.0)) * 100.0 if p.direction == "LONG" else 0.0

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
    return results


@router.get("/orders")
async def get_orders(
    limit: int = Query(default=20, le=100),
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
            "created_at": o.created_at.isoformat() if o.created_at else None,
        }
        for o in orders
    ]


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

    return {"message": "Position parameters updated successfully."}


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
    exit_p = req.exit_price or pos.current_price or pos.entry_price
    pos.status = "CLOSED"
    pos.closed_at = now
    pos.realized_pnl = (exit_p - pos.entry_price) * pos.quantity if pos.direction == "LONG" else (pos.entry_price - exit_p) * pos.quantity

    audit = TradeAuditLog(
        user_id=current_user.id,
        action="POSITION_CLOSED",
        details={"position_id": pos.id, "symbol": pos.symbol, "exit_price": exit_p, "realized_pnl": pos.realized_pnl},
        timestamp=now
    )
    db.add(audit)
    await db.commit()

    return {
        "message": f"Position {pos.symbol} closed successfully at NPR {exit_p:.2f}.",
        "realized_pnl": round(pos.realized_pnl, 2)
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
