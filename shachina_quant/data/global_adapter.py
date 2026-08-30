"""
SHACHINA QUANT ENGINE: Global Markets Data Provider Adapters
Support for US Stocks, Crypto, Forex, Commodities, and Global Indices.
"""

from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
import numpy as np

from shachina_quant.core.models import (
    MarketType,
    MarketStatus,
    MarketSession,
    SymbolInfo,
    OHLCVSeries,
    Candle,
    Timeframe,
    CandleState,
)
from shachina_quant.data.provider import MarketDataProvider
from shachina_quant.data.quality_engine import DataQualityEngine


class CryptoDataProvider(MarketDataProvider):
    """
    24/7 Global Cryptocurrency Provider (BTC, ETH, SOL, BNB, XRP).
    """

    SYMBOLS_DATA = [
        {"symbol": "BTC/USDT", "name": "Bitcoin", "price": 94250.0, "tick": 0.1, "lot": 1},
        {"symbol": "ETH/USDT", "name": "Ethereum", "price": 2840.0, "tick": 0.01, "lot": 1},
        {"symbol": "SOL/USDT", "name": "Solana", "price": 195.5, "tick": 0.01, "lot": 1},
        {"symbol": "BNB/USDT", "name": "BNB", "price": 645.0, "tick": 0.1, "lot": 1},
        {"symbol": "XRP/USDT", "name": "Ripple", "price": 2.25, "tick": 0.0001, "lot": 10},
    ]

    def get_market_type(self) -> MarketType:
        return MarketType.CRYPTO

    def get_market_status(self) -> MarketStatus:
        # Crypto markets run 24/7/365
        return MarketStatus(
            market=MarketType.CRYPTO,
            is_open=True,
            session=MarketSession.REGULAR,
            current_time=datetime.now(timezone.utc),
            timezone_name="UTC",
            market_message="Crypto markets are open 24/7."
        )

    def get_symbols(self) -> List[SymbolInfo]:
        return [
            SymbolInfo(
                symbol=item["symbol"],
                name=item["name"],
                market=MarketType.CRYPTO,
                currency="USD",
                sector="Layer 1 / DeFi",
                tick_size=item["tick"],
                lot_size=item["lot"],
                is_active=True
            )
            for item in self.SYMBOLS_DATA
        ]

    def get_historical_ohlcv(
        self,
        symbol: str,
        timeframe: Timeframe = Timeframe.D1,
        limit: int = 100
    ) -> OHLCVSeries:
        symbol_info = next((s for s in self.SYMBOLS_DATA if s["symbol"].upper() == symbol.upper()), None)
        base_price = symbol_info["price"] if symbol_info else 50000.0

        now_utc = datetime.now(timezone.utc)
        candles: List[Candle] = []
        seed = sum(ord(c) for c in symbol) + 101
        rng = np.random.RandomState(seed)

        if timeframe in (Timeframe.M1, Timeframe.M5, Timeframe.M15, Timeframe.M30):
            interval = timedelta(minutes=int(timeframe.value.replace("m", "")))
        elif timeframe == Timeframe.H1:
            interval = timedelta(hours=1)
        elif timeframe == Timeframe.H4:
            interval = timedelta(hours=4)
        else:
            interval = timedelta(days=1)

        price = base_price * 0.90
        current_time = now_utc - (interval * limit)

        for i in range(limit):
            current_time += interval
            drift = (rng.rand() - 0.47) * 0.04
            vol = rng.uniform(0.015, 0.04)

            open_p = round(price, 2)
            close_p = round(price * (1.0 + drift), 2)
            high_p = round(max(open_p, close_p) * (1.0 + rng.uniform(0.002, vol)), 2)
            low_p = round(min(open_p, close_p) * (1.0 - rng.uniform(0.002, vol)), 2)
            volume = round(float(rng.randint(500, 25000)), 2)

            candle = Candle(
                timestamp=current_time,
                open=open_p,
                high=max(open_p, close_p, high_p),
                low=min(open_p, close_p, low_p),
                close=close_p,
                volume=volume,
                state=CandleState.CLOSED if i < limit - 1 else CandleState.FORMING,
                turnover=round(close_p * volume, 2)
            )
            candles.append(candle)
            price = close_p

        quality_report = DataQualityEngine.evaluate_series(candles, timeframe=timeframe)

        return OHLCVSeries(
            symbol=symbol.upper(),
            market=MarketType.CRYPTO,
            timeframe=timeframe,
            currency="USD",
            timezone_name="UTC",
            candles=candles,
            quality_report=quality_report,
            last_updated=now_utc
        )

    def get_latest_candle(self, symbol: str, timeframe: Timeframe = Timeframe.D1) -> Optional[Candle]:
        series = self.get_historical_ohlcv(symbol, timeframe, limit=1)
        return series.latest_candle

    def get_sector_summary(self) -> Dict[str, Any]:
        return {
            "market": "CRYPTO",
            "market_cap_usd": 3200000000000.0,
            "btc_dominance": 58.4,
            "24h_volume_usd": 94000000000.0
        }


class USStocksDataProvider(MarketDataProvider):
    """
    US Equities Data Provider (AAPL, MSFT, NVDA, TSLA, SPY, QQQ).
    """

    SYMBOLS_DATA = [
        {"symbol": "AAPL", "name": "Apple Inc.", "price": 234.50, "sector": "Technology"},
        {"symbol": "NVDA", "name": "NVIDIA Corporation", "price": 142.20, "sector": "Semiconductors"},
        {"symbol": "MSFT", "name": "Microsoft Corporation", "price": 428.80, "sector": "Technology"},
        {"symbol": "TSLA", "name": "Tesla Inc.", "price": 310.40, "sector": "Automotive"},
        {"symbol": "SPY", "name": "SPDR S&P 500 ETF Trust", "price": 594.10, "sector": "ETF"},
    ]

    def get_market_type(self) -> MarketType:
        return MarketType.US_STOCKS

    def get_market_status(self) -> MarketStatus:
        now_utc = datetime.now(timezone.utc)
        return MarketStatus(
            market=MarketType.US_STOCKS,
            is_open=True,
            session=MarketSession.REGULAR,
            current_time=now_utc,
            timezone_name="America/New_York",
            market_message="US Markets session active."
        )

    def get_symbols(self) -> List[SymbolInfo]:
        return [
            SymbolInfo(
                symbol=item["symbol"],
                name=item["name"],
                market=MarketType.US_STOCKS,
                currency="USD",
                sector=item["sector"],
                tick_size=0.01,
                lot_size=1,
                is_active=True
            )
            for item in self.SYMBOLS_DATA
        ]

    def get_historical_ohlcv(
        self,
        symbol: str,
        timeframe: Timeframe = Timeframe.D1,
        limit: int = 100
    ) -> OHLCVSeries:
        symbol_info = next((s for s in self.SYMBOLS_DATA if s["symbol"].upper() == symbol.upper()), None)
        base_price = symbol_info["price"] if symbol_info else 200.0

        now_utc = datetime.now(timezone.utc)
        candles: List[Candle] = []
        seed = sum(ord(c) for c in symbol) + 505
        rng = np.random.RandomState(seed)
        interval = timedelta(days=1) if timeframe == Timeframe.D1 else timedelta(hours=1)

        price = base_price * 0.92
        current_time = now_utc - (interval * limit)

        for i in range(limit):
            current_time += interval
            drift = (rng.rand() - 0.48) * 0.03
            vol = rng.uniform(0.01, 0.025)

            open_p = round(price, 2)
            close_p = round(price * (1.0 + drift), 2)
            high_p = round(max(open_p, close_p) * (1.0 + rng.uniform(0.001, vol)), 2)
            low_p = round(min(open_p, close_p) * (1.0 - rng.uniform(0.001, vol)), 2)
            volume = round(float(rng.randint(2000000, 45000000)), 0)

            candle = Candle(
                timestamp=current_time,
                open=open_p,
                high=max(open_p, close_p, high_p),
                low=min(open_p, close_p, low_p),
                close=close_p,
                volume=volume,
                state=CandleState.CLOSED if i < limit - 1 else CandleState.FORMING,
                turnover=round(close_p * volume, 2)
            )
            candles.append(candle)
            price = close_p

        quality_report = DataQualityEngine.evaluate_series(candles, timeframe=timeframe)

        return OHLCVSeries(
            symbol=symbol.upper(),
            market=MarketType.US_STOCKS,
            timeframe=timeframe,
            currency="USD",
            timezone_name="America/New_York",
            candles=candles,
            quality_report=quality_report,
            last_updated=now_utc
        )

    def get_latest_candle(self, symbol: str, timeframe: Timeframe = Timeframe.D1) -> Optional[Candle]:
        series = self.get_historical_ohlcv(symbol, timeframe, limit=1)
        return series.latest_candle

    def get_sector_summary(self) -> Dict[str, Any]:
        return {
            "market": "US_STOCKS",
            "sp500_index": 5960.40,
            "nasdaq_index": 19280.15,
            "status": "OPEN"
        }
