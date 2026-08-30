"""
Automated Tests for Shachina Data Quality Engine.
Enforces strict mathematical validation and zero-fabrication guarantees.
"""

from datetime import datetime, timezone, timedelta
import pytest
from shachina_quant.core.models import Candle, CandleState, Timeframe
from shachina_quant.data.quality_engine import DataQualityEngine


def test_valid_candle_validation():
    candle = Candle(
        timestamp=datetime.now(timezone.utc),
        open=100.0,
        high=105.0,
        low=98.0,
        close=103.0,
        volume=5000.0,
        state=CandleState.CLOSED
    )
    is_valid, errors = DataQualityEngine.validate_candle(candle)
    assert is_valid is True
    assert len(errors) == 0


def test_invalid_ohlc_math_violations():
    # Case 1: High < Open
    bad_candle_1 = Candle(
        timestamp=datetime.now(timezone.utc),
        open=100.0,
        high=95.0,
        low=90.0,
        close=92.0,
        volume=1000.0
    )
    valid, errors = DataQualityEngine.validate_candle(bad_candle_1)
    assert valid is False
    assert any("High" in e and "Open" in e for e in errors)

    # Case 2: Low > Close
    bad_candle_2 = Candle(
        timestamp=datetime.now(timezone.utc),
        open=100.0,
        high=110.0,
        low=102.0,
        close=98.0,
        volume=1000.0
    )
    valid, errors = DataQualityEngine.validate_candle(bad_candle_2)
    assert valid is False
    assert any("Low" in e and "Close" in e for e in errors)


def test_series_quality_score_perfect():
    now = datetime.now(timezone.utc)
    candles = []
    for i in range(20):
        c = Candle(
            timestamp=now + timedelta(days=i),
            open=100.0 + i,
            high=105.0 + i,
            low=99.0 + i,
            close=104.0 + i,
            volume=10000.0,
            state=CandleState.CLOSED
        )
        candles.append(c)

    report = DataQualityEngine.evaluate_series(candles, timeframe=Timeframe.D1)
    assert report.score == 100.0
    assert report.is_valid is True
    assert report.status_label in ("EXCELLENT", "VERIFIED")
    assert report.invalid_ohlc_count == 0


def test_series_quality_score_insufficient_on_bad_data():
    now = datetime.now(timezone.utc)
    candles = [
        Candle(timestamp=now, open=100, high=90, low=95, close=85, volume=100),  # invalid
        Candle(timestamp=now, open=100, high=110, low=90, close=105, volume=100), # duplicate ts
    ]
    report = DataQualityEngine.evaluate_series(candles, timeframe=Timeframe.D1)
    assert report.is_valid is False
    assert report.invalid_ohlc_count > 0
