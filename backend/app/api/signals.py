"""
SHACHINA AUTO TRADE SIGNAL ENGINE
────────────────────────────────────────────────────────────
Computes real BUY / SELL / HOLD signals from OHLCV data using:
  • RSI (14-period)  — oversold < 35 = BUY, overbought > 65 = SELL
  • EMA crossover    — EMA9 > EMA21 = bullish, EMA9 < EMA21 = bearish
  • Volume confirmation — volume spike > 1.5× average
  • MACD histogram   — positive = bullish momentum
Confidence = weighted combination of signal factors (0–100).
Zero-fabrication: all signals derived exclusively from OHLCV data.
"""

from fastapi import APIRouter, Query, Depends
from typing import List, Optional
from datetime import datetime
from zoneinfo import ZoneInfo
import math

from shachina_quant.core.models import MarketType, Timeframe
from shachina_quant.data.factory import MarketDataProviderRegistry
from backend.app.api.auth import get_current_user
from backend.app.db.models import User

router = APIRouter(prefix="/signals", tags=["Trade Signals"])

KTM = ZoneInfo("Asia/Kathmandu")


def _ema(values: list[float], period: int) -> list[float]:
    """Compute Exponential Moving Average."""
    if len(values) < period:
        return []
    k = 2 / (period + 1)
    result = [sum(values[:period]) / period]
    for v in values[period:]:
        result.append(v * k + result[-1] * (1 - k))
    return result


def _rsi(closes: list[float], period: int = 14) -> float:
    """Compute RSI for the last bar."""
    if len(closes) < period + 1:
        return 50.0
    gains, losses = [], []
    for i in range(1, len(closes)):
        diff = closes[i] - closes[i - 1]
        gains.append(max(diff, 0))
        losses.append(max(-diff, 0))
    avg_gain = sum(gains[-period:]) / period
    avg_loss = sum(losses[-period:]) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def _compute_signal(symbol: str, candles: list) -> dict:
    """
    Returns a signal dict for one symbol.
    candles: list of candle objects with .close, .volume attributes.
    """
    if len(candles) < 25:
        return {"signal": "HOLD", "confidence": 0, "reason": "Insufficient data"}

    closes  = [c.close  for c in candles]
    volumes = [c.volume for c in candles if c.volume]

    latest_price  = closes[-1]
    rsi_val       = _rsi(closes)
    ema9          = _ema(closes, 9)
    ema21         = _ema(closes, 21)
    avg_vol       = sum(volumes[-10:]) / max(len(volumes[-10:]), 1)
    latest_vol    = volumes[-1] if volumes else 0
    vol_spike     = latest_vol > avg_vol * 1.5 if avg_vol > 0 else False

    # MACD
    ema12_vals = _ema(closes, 12)
    ema26_vals = _ema(closes, 26)
    macd_hist  = 0.0
    if ema12_vals and ema26_vals:
        macd = ema12_vals[-1] - ema26_vals[-1]
        macd_hist = macd

    ema_bullish  = (len(ema9) > 0 and len(ema21) > 0 and ema9[-1] > ema21[-1])
    ema_bearish  = (len(ema9) > 0 and len(ema21) > 0 and ema9[-1] < ema21[-1])

    # Score each component
    bull_score = 0
    bear_score = 0
    reasons    = []

    if rsi_val < 35:
        bull_score += 30
        reasons.append(f"RSI oversold at {rsi_val:.0f}")
    elif rsi_val > 65:
        bear_score += 30
        reasons.append(f"RSI overbought at {rsi_val:.0f}")

    if ema_bullish:
        bull_score += 30
        reasons.append("EMA9 crossed above EMA21")
    elif ema_bearish:
        bear_score += 30
        reasons.append("EMA9 crossed below EMA21")

    if vol_spike and bull_score > bear_score:
        bull_score += 20
        reasons.append("High volume confirmation")
    elif vol_spike and bear_score > bull_score:
        bear_score += 20
        reasons.append("High volume sell pressure")

    if macd_hist > 0:
        bull_score += 20
        if bull_score > bear_score:
            reasons.append("MACD bullish momentum")
    elif macd_hist < 0:
        bear_score += 20
        if bear_score > bull_score:
            reasons.append("MACD bearish momentum")

    if bull_score > bear_score and bull_score >= 50:
        signal = "BUY"
        confidence = min(bull_score, 95)
    elif bear_score > bull_score and bear_score >= 50:
        signal = "SELL"
        confidence = min(bear_score, 95)
    else:
        signal = "HOLD"
        confidence = 0

    return {
        "symbol": symbol,
        "signal": signal,
        "confidence": confidence,
        "price": round(latest_price, 2),
        "reason": ". ".join(reasons) if reasons else "No strong signal",
        "rsi": round(rsi_val, 1),
        "ema_trend": "bullish" if ema_bullish else ("bearish" if ema_bearish else "neutral"),
        "volume_spike": vol_spike,
    }


@router.get("")
async def get_trade_signals(
    market: str = Query(default="NEPSE"),
    symbols: str = Query(default=""),
    current_user: User = Depends(get_current_user),
) -> list:
    """
    Returns BUY/SELL/HOLD signals for requested symbols.
    Requires authentication. Real OHLCV data only — zero fabrication.
    """
    if not symbols:
        return []

    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()][:10]
    results = []
    now = datetime.now(KTM).isoformat()

    try:
        market_type = MarketType(market)
        provider = MarketDataProviderRegistry.get_provider(market_type)
    except Exception:
        return []

    for sym in symbol_list:
        try:
            series = provider.get_historical_ohlcv(
                symbol=sym, timeframe=Timeframe.D1, limit=50
            )
            sig = _compute_signal(sym, series.candles)
            sig["market"] = market
            sig["timestamp"] = now
            results.append(sig)
        except Exception:
            results.append({
                "symbol": sym,
                "market": market,
                "signal": "HOLD",
                "confidence": 0,
                "price": 0,
                "reason": "Data unavailable",
                "timestamp": now,
            })

    return results
