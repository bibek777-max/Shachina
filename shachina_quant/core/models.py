"""
SHACHINA QUANT ENGINE: Core Models and Domain Types
Strict deterministic types for financial market analysis and zero-fabrication guarantees.
"""

from __future__ import annotations
from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, computed_field


class MarketType(str, Enum):
    NEPSE = "NEPSE"
    US_STOCKS = "US_STOCKS"
    CRYPTO = "CRYPTO"
    FOREX = "FOREX"
    COMMODITIES = "COMMODITIES"
    INDICES = "INDICES"


class Timeframe(str, Enum):
    M1 = "1m"
    M3 = "3m"
    M5 = "5m"
    M15 = "15m"
    M30 = "30m"
    H1 = "1h"
    H4 = "4h"
    D1 = "1d"
    W1 = "1w"


class CandleState(str, Enum):
    FORMING = "FORMING"
    CLOSED = "CLOSED"


class MarketSession(str, Enum):
    REGULAR = "REGULAR"
    PRE_OPEN = "PRE_OPEN"
    POST_CLOSE = "POST_CLOSE"
    CLOSED = "CLOSED"
    WEEKEND = "WEEKEND"
    HOLIDAY = "HOLIDAY"


class Candle(BaseModel):
    """
    Deterministic Representation of a Single OHLCV Candle.
    Calculates derived metrics with zero approximation.
    """
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0
    state: CandleState = CandleState.CLOSED
    turnover: Optional[float] = None
    trades: Optional[int] = None

    @computed_field
    @property
    def body(self) -> float:
        return abs(self.close - self.open)

    @computed_field
    @property
    def range(self) -> float:
        return max(0.0, self.high - self.low)

    @computed_field
    @property
    def upper_wick(self) -> float:
        return max(0.0, self.high - max(self.open, self.close))

    @computed_field
    @property
    def lower_wick(self) -> float:
        return max(0.0, min(self.open, self.close) - self.low)

    @computed_field
    @property
    def is_bullish(self) -> bool:
        return self.close > self.open

    @computed_field
    @property
    def is_bearish(self) -> bool:
        return self.close < self.open

    @computed_field
    @property
    def is_neutral(self) -> bool:
        return self.close == self.open

    @property
    def body_range_ratio(self) -> float:
        r = self.range
        return (self.body / r) if r > 0 else 0.0

    @property
    def wick_body_ratio(self) -> float:
        b = self.body
        return ((self.upper_wick + self.lower_wick) / b) if b > 0 else 0.0

    def dict_view(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp.isoformat(),
            "open": round(self.open, 4),
            "high": round(self.high, 4),
            "low": round(self.low, 4),
            "close": round(self.close, 4),
            "volume": round(self.volume, 2),
            "state": self.state.value,
            "body": round(self.body, 4),
            "range": round(self.range, 4),
            "upper_wick": round(self.upper_wick, 4),
            "lower_wick": round(self.lower_wick, 4),
            "is_bullish": self.is_bullish,
            "is_bearish": self.is_bearish,
        }


class DataQualityReport(BaseModel):
    """
    Deterministic data quality evaluation report (Score 0-100).
    Enforces strict validation rules:
    - High >= Open, High >= Close, Low <= Open, Low <= Close, High >= Low
    - No duplicate timestamps
    - Sequence integrity & interval checks
    - No negative prices or negative volumes
    """
    score: float = Field(ge=0.0, le=100.0)
    is_valid: bool
    reasons: List[str] = Field(default_factory=list)
    total_candles: int = 0
    missing_candles: int = 0
    duplicate_candles: int = 0
    invalid_ohlc_count: int = 0
    gap_count: int = 0
    stale_count: int = 0
    abnormal_spikes: int = 0
    evaluated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @computed_field
    @property
    def status_label(self) -> str:
        if self.score >= 95:
            return "EXCELLENT"
        elif self.score >= 80:
            return "VERIFIED"
        elif self.score >= 60:
            return "DEGRADED"
        else:
            return "INSUFFICIENT"


class SymbolInfo(BaseModel):
    symbol: str
    name: str
    market: MarketType
    currency: str = "NPR"
    sector: Optional[str] = None
    tick_size: float = 0.1
    lot_size: int = 10
    is_active: bool = True
    listed_shares: Optional[int] = None


class MarketStatus(BaseModel):
    market: MarketType
    is_open: bool
    session: MarketSession
    current_time: datetime
    next_open: Optional[datetime] = None
    next_close: Optional[datetime] = None
    timezone_name: str = "Asia/Kathmandu"
    market_message: str = ""


class OHLCVSeries(BaseModel):
    symbol: str
    market: MarketType
    timeframe: Timeframe
    currency: str
    timezone_name: str
    candles: List[Candle] = Field(default_factory=list)
    quality_report: Optional[DataQualityReport] = None
    last_updated: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def count(self) -> int:
        return len(self.candles)

    @property
    def latest_candle(self) -> Optional[Candle]:
        return self.candles[-1] if self.candles else None
