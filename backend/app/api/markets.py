"""
SHACHINA MARKETS API ENDPOINTS
Endpoints for live market status, symbol lists, sectors, and validated OHLCV data.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List, Dict, Any
from shachina_quant.core.models import MarketType, Timeframe
from shachina_quant.data.factory import MarketDataProviderRegistry

router = APIRouter(prefix="/markets", tags=["Markets"])


@router.get("/all-statuses")
async def get_all_market_statuses() -> List[Dict[str, Any]]:
    """Returns real-time status across NEPSE and Global Markets."""
    results = []
    for m in [MarketType.NEPSE, MarketType.CRYPTO, MarketType.US_STOCKS]:
        provider = MarketDataProviderRegistry.get_provider(m)
        status = provider.get_market_status()
        results.append({
            "market": status.market.value,
            "is_open": status.is_open,
            "session": status.session.value,
            "current_time": status.current_time.isoformat(),
            "timezone": status.timezone_name,
            "message": status.market_message,
        })
    return results


@router.get("/nepse/status")
async def get_nepse_status():
    provider = MarketDataProviderRegistry.get_provider(MarketType.NEPSE)
    return provider.get_market_status().model_dump()


@router.get("/nepse/sectors")
async def get_nepse_sectors():
    provider = MarketDataProviderRegistry.get_provider(MarketType.NEPSE)
    return provider.get_sector_summary()


@router.get("/{market}/symbols")
async def get_market_symbols(market: MarketType):
    provider = MarketDataProviderRegistry.get_provider(market)
    symbols = provider.get_symbols()
    return [s.model_dump() for s in symbols]


@router.get("/{market}/ohlcv/{symbol}")
async def get_ohlcv(
    market: MarketType,
    symbol: str,
    timeframe: Timeframe = Query(default=Timeframe.D1),
    limit: int = Query(default=100, ge=10, le=500)
):
    """
    Returns verified OHLCV candle series with deterministic Data Quality Score.
    Zero-fabrication: will return quality score and full validation status.
    """
    provider = MarketDataProviderRegistry.get_provider(market)
    try:
        series = provider.get_historical_ohlcv(symbol=symbol, timeframe=timeframe, limit=limit)
        return {
            "symbol": series.symbol,
            "market": series.market.value,
            "timeframe": series.timeframe.value,
            "currency": series.currency,
            "timezone": series.timezone_name,
            "count": series.count,
            "data_quality": series.quality_report.model_dump() if series.quality_report else None,
            "candles": [c.dict_view() for c in series.candles],
            "last_updated": series.last_updated.isoformat(),
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"DATA SOURCE ERROR: Could not fetch validated OHLCV for {symbol} ({str(e)})"
        )
