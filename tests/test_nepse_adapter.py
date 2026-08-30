"""
Automated Tests for NEPSE Market Data Adapter.
Validates Asia/Kathmandu timezone, NPR currency, market hours, and symbol listings.
"""

from shachina_quant.core.models import MarketType, Timeframe
from shachina_quant.data.nepse_adapter import NEPSEDataProvider


def test_nepse_properties():
    provider = NEPSEDataProvider()
    assert provider.get_market_type() == MarketType.NEPSE
    status = provider.get_market_status()
    assert status.timezone_name == "Asia/Kathmandu"
    assert status.market == MarketType.NEPSE


def test_nepse_symbols():
    provider = NEPSEDataProvider()
    symbols = provider.get_symbols()
    assert len(symbols) >= 15
    symbols_dict = {s.symbol: s for s in symbols}
    assert "NABIL" in symbols_dict
    assert "GBIME" in symbols_dict
    assert "SHIVM" in symbols_dict
    assert symbols_dict["NABIL"].currency == "NPR"


def test_nepse_historical_ohlcv_integrity():
    provider = NEPSEDataProvider()
    series = provider.get_historical_ohlcv("NABIL", timeframe=Timeframe.D1, limit=50)
    assert series.symbol == "NABIL"
    assert series.count == 50
    assert series.quality_report is not None
    assert series.quality_report.is_valid is True
    assert series.quality_report.score >= 80.0

    for c in series.candles:
        assert c.high >= c.open
        assert c.high >= c.close
        assert c.low <= c.open
        assert c.low <= c.close
        assert c.high >= c.low
        assert c.volume >= 0
