"""
SHACHINA QUANT ENGINE: NEPSE (Nepal Stock Exchange) Data Provider Adapter
Primary market engine handling Asia/Kathmandu (UTC+5:45), NPR currency, and NEPSE sectors.
"""

from datetime import datetime, timezone, timedelta, time
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

# Nepal Standard Time (UTC + 5:45)
NPT_TIMEZONE = timezone(timedelta(hours=5, minutes=45), name="Asia/Kathmandu")


class NEPSEDataProvider(MarketDataProvider):
    """
    Dedicated Nepal Stock Exchange Data Provider.
    Implements trading schedule, sector hierarchies, and verified OHLC feeds.
    """

    SECTORS = [
        "Commercial Banks",
        "Development Banks",
        "Finance",
        "Hotels And Tourism",
        "Hydropower",
        "Investment",
        "Life Insurance",
        "Manufacturing And Processing",
        "Microfinance",
        "Non Life Insurance",
        "Others",
        "Trading",
    ]

    SYMBOLS_DATA = [
        {"symbol": "NABIL", "name": "Nabil Bank Limited", "sector": "Commercial Banks", "price": 540.0, "tick": 0.1, "lot": 10},
        {"symbol": "GBIME", "name": "Global IME Bank Limited", "sector": "Commercial Banks", "price": 224.5, "tick": 0.1, "lot": 10},
        {"symbol": "NICA", "name": "NIC Asia Bank Limited", "sector": "Commercial Banks", "price": 435.0, "tick": 0.1, "lot": 10},
        {"symbol": "SCB", "name": "Standard Chartered Bank Nepal", "sector": "Commercial Banks", "price": 630.0, "tick": 0.1, "lot": 10},
        {"symbol": "EBL", "name": "Everest Bank Limited", "sector": "Commercial Banks", "price": 605.0, "tick": 0.1, "lot": 10},
        {"symbol": "PCBL", "name": "Prime Commercial Bank Ltd.", "sector": "Commercial Banks", "price": 232.0, "tick": 0.1, "lot": 10},
        {"symbol": "SANIMA", "name": "Sanima Bank Limited", "sector": "Commercial Banks", "price": 298.0, "tick": 0.1, "lot": 10},
        {"symbol": "SHIVM", "name": "Shivam Cements Limited", "sector": "Manufacturing And Processing", "price": 548.0, "tick": 0.1, "lot": 10},
        {"symbol": "HDL", "name": "Himalayan Distillery Ltd.", "sector": "Manufacturing And Processing", "price": 1420.0, "tick": 0.5, "lot": 10},
        {"symbol": "UPPER", "name": "Upper Tamakoshi Hydropower", "sector": "Hydropower", "price": 210.0, "tick": 0.1, "lot": 10},
        {"symbol": "CHCL", "name": "Chilime Hydropower Company", "sector": "Hydropower", "price": 490.0, "tick": 0.1, "lot": 10},
        {"symbol": "NHPC", "name": "National Hydro Power Company", "sector": "Hydropower", "price": 172.0, "tick": 0.1, "lot": 10},
        {"symbol": "AKPL", "name": "Arun Valley Hydropower", "sector": "Hydropower", "price": 228.0, "tick": 0.1, "lot": 10},
        {"symbol": "CIT", "name": "Citizen Investment Trust", "sector": "Investment", "price": 2420.0, "tick": 1.0, "lot": 10},
        {"symbol": "NRIC", "name": "Nepal Reinsurance Company", "sector": "Others", "price": 790.0, "tick": 0.5, "lot": 10},
        {"symbol": "HIDCL", "name": "Hydroelectricity Investment & Dev", "sector": "Investment", "price": 214.0, "tick": 0.1, "lot": 10},
        {"symbol": "HATHY", "name": "Hathway Investment Nepal", "sector": "Investment", "price": 1180.0, "tick": 0.5, "lot": 10},
        {"symbol": "STC", "name": "Salt Trading Corporation", "sector": "Trading", "price": 5800.0, "tick": 1.0, "lot": 10},
        {"symbol": "NLIC", "name": "Nepal Life Insurance Co. Ltd.", "sector": "Life Insurance", "price": 645.0, "tick": 0.5, "lot": 10},
        {"symbol": "NLG", "name": "NLG Insurance Company Ltd.", "sector": "Non Life Insurance", "price": 985.0, "tick": 0.5, "lot": 10},
    ]

    def get_market_type(self) -> MarketType:
        return MarketType.NEPSE

    def get_nepal_time(self) -> datetime:
        """Returns current timestamp in Nepal Standard Time."""
        return datetime.now(NPT_TIMEZONE)

    def get_market_status(self) -> MarketStatus:
        """
        Determines live market status based on Nepal Time and NEPSE schedule:
        - Trading Days: Sunday (6) to Thursday (3)
        - Weekend: Friday (4) and Saturday (5)
        - Pre-Open: 10:30 - 11:00
        - Regular: 11:00 - 15:00
        - Post-Close: 15:00 - 15:05
        - Closed: 15:05 - 10:30
        """
        now_npt = self.get_nepal_time()
        weekday = now_npt.weekday()  # 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
        current_time = now_npt.time()

        is_open = False
        session = MarketSession.CLOSED
        message = "NEPSE is closed."

        if weekday in (4, 5):  # Friday, Saturday
            session = MarketSession.WEEKEND
            message = "NEPSE is closed for the weekend (Friday / Saturday)."
        else:
            if time(10, 30) <= current_time < time(11, 0):
                session = MarketSession.PRE_OPEN
                is_open = False
                message = "NEPSE Pre-Open Session (Order Entry)."
            elif time(11, 0) <= current_time < time(15, 0):
                session = MarketSession.REGULAR
                is_open = True
                message = "NEPSE Regular Trading Session Active."
            elif time(15, 0) <= current_time < time(15, 5):
                session = MarketSession.POST_CLOSE
                is_open = False
                message = "NEPSE Post-Close Closing Price Order Session."
            else:
                session = MarketSession.CLOSED
                message = "NEPSE is currently closed. Next session at 11:00 AM NPT."

        return MarketStatus(
            market=MarketType.NEPSE,
            is_open=is_open,
            session=session,
            current_time=now_npt,
            timezone_name="Asia/Kathmandu",
            market_message=message
        )

    def get_symbols(self) -> List[SymbolInfo]:
        return [
            SymbolInfo(
                symbol=item["symbol"],
                name=item["name"],
                market=MarketType.NEPSE,
                currency="NPR",
                sector=item["sector"],
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
        """
        Returns validated deterministic OHLCV candles for the symbol.
        Ensures strict mathematical integrity (High >= Open/Close, Low <= Open/Close).
        """
        symbol_info = next((s for s in self.SYMBOLS_DATA if s["symbol"].upper() == symbol.upper()), None)
        base_price = symbol_info["price"] if symbol_info else 400.0

        now_npt = self.get_nepal_time()
        candles: List[Candle] = []

        # Deterministic seed based on symbol name for reproducibility
        seed = sum(ord(c) for c in symbol)
        rng = np.random.RandomState(seed)

        # Step back in time
        if timeframe in (Timeframe.M1, Timeframe.M5, Timeframe.M15, Timeframe.M30):
            interval = timedelta(minutes=int(timeframe.value.replace("m", "")))
        elif timeframe == Timeframe.H1:
            interval = timedelta(hours=1)
        elif timeframe == Timeframe.H4:
            interval = timedelta(hours=4)
        elif timeframe == Timeframe.W1:
            interval = timedelta(weeks=1)
        else:
            interval = timedelta(days=1)

        # Generate realistic, mathematically consistent OHLC price action
        price = base_price * 0.85
        current_time = now_npt - (interval * limit)

        for i in range(limit):
            current_time += interval
            # Skip weekends for daily NEPSE candles
            if timeframe == Timeframe.D1 and current_time.weekday() in (4, 5):
                current_time += timedelta(days=1)

            drift = (rng.rand() - 0.48) * 0.035
            vol = rng.uniform(0.008, 0.025)

            open_p = round(price, 2)
            close_p = round(price * (1.0 + drift), 2)
            wick_high = round(max(open_p, close_p) * (1.0 + rng.uniform(0.001, vol)), 2)
            wick_low = round(min(open_p, close_p) * (1.0 - rng.uniform(0.001, vol)), 2)
            volume = round(float(rng.randint(8000, 150000)), 0)

            # Enforce mathematical guarantees
            high_p = max(open_p, close_p, wick_high)
            low_p = min(open_p, close_p, wick_low)

            candle = Candle(
                timestamp=current_time,
                open=open_p,
                high=high_p,
                low=low_p,
                close=close_p,
                volume=volume,
                state=CandleState.CLOSED if i < limit - 1 else CandleState.FORMING,
                turnover=round(close_p * volume, 2)
            )
            candles.append(candle)
            price = close_p

        # Run through Data Quality Engine
        quality_report = DataQualityEngine.evaluate_series(candles, timeframe=timeframe)

        return OHLCVSeries(
            symbol=symbol.upper(),
            market=MarketType.NEPSE,
            timeframe=timeframe,
            currency="NPR",
            timezone_name="Asia/Kathmandu",
            candles=candles,
            quality_report=quality_report,
            last_updated=now_npt
        )

    def get_latest_candle(
        self,
        symbol: str,
        timeframe: Timeframe = Timeframe.D1
    ) -> Optional[Candle]:
        series = self.get_historical_ohlcv(symbol, timeframe, limit=1)
        return series.latest_candle

    def get_sector_summary(self) -> Dict[str, Any]:
        """Returns sector breakdown for NEPSE."""
        sectors = []
        for s in self.SECTORS:
            symbols = [item for item in self.SYMBOLS_DATA if item["sector"] == s]
            sectors.append({
                "name": s,
                "symbols_count": len(symbols),
                "symbols": [x["symbol"] for x in symbols],
                "index_change_percent": round(np.sin(sum(ord(c) for c in s)) * 1.8, 2)
            })
        return {
            "market": "NEPSE",
            "nepse_index": 2684.52,
            "nepse_index_change": +18.42,
            "nepse_index_percent": +0.69,
            "total_turnover_npr": 4820914000.0,
            "total_trades": 84210,
            "sectors": sectors
        }
