"""
SHACHINA QUANT ENGINE: Abstract MarketDataProvider Interface
Replaceable provider architecture for all global asset classes.
"""

from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from shachina_quant.core.models import (
    MarketType,
    MarketStatus,
    SymbolInfo,
    OHLCVSeries,
    Candle,
    Timeframe,
)


class MarketDataProvider(ABC):
    """
    Abstract Base Class for all Market Data Adapters.
    Enforces unified interface across NEPSE, US Stocks, Crypto, Forex, Commodities.
    """

    @abstractmethod
    def get_market_type(self) -> MarketType:
        """Returns the market classification handled by this provider."""
        pass

    @abstractmethod
    def get_market_status(self) -> MarketStatus:
        """Returns current live market status, session name, and market message."""
        pass

    @abstractmethod
    def get_symbols(self) -> List[SymbolInfo]:
        """Returns all actively traded symbols in this market."""
        pass

    @abstractmethod
    def get_historical_ohlcv(
        self,
        symbol: str,
        timeframe: Timeframe = Timeframe.D1,
        limit: int = 100
    ) -> OHLCVSeries:
        """Fetches validated historical OHLCV candles."""
        pass

    @abstractmethod
    def get_latest_candle(
        self,
        symbol: str,
        timeframe: Timeframe = Timeframe.D1
    ) -> Optional[Candle]:
        """Returns the latest candle for the symbol."""
        pass

    @abstractmethod
    def get_sector_summary(self) -> Dict[str, Any]:
        """Returns sector performance and breakdown where available."""
        pass
