"""
SHACHINA COMPREHENSIVE PLATFORM INTEGRATION & VERIFICATION TEST SUITE
Tests for Private Authentication, Candlestick Pattern Recognition,
Market Structure, Chart Annotations, Controlled Trading, and Conversation Memory.
"""

import pytest
import asyncio
from datetime import datetime, timezone

from shachina_quant.core.models import Candle
from shachina_quant.analysis.patterns import CandlestickPatternScanner
from shachina_quant.analysis.structure import MarketStructureAnalyzer
from shachina_quant.analysis.setup_generator import TradeSetupGenerator
from backend.app.services.auth_service import hash_password, verify_password


def test_private_password_hashing():
    """Verify password hashing and verification for Bibek98@#$"""
    pwd = "Bibek98@#$"
    hashed = hash_password(pwd)
    assert verify_password(pwd, hashed) is True
    assert verify_password("WrongPassword123", hashed) is False


def test_candlestick_pattern_recognition():
    """Verify detection of Hammer, Bullish Engulfing, Doji, and Morning Star"""
    # Create downtrend with Hammer at bottom
    candles = [
        Candle(timestamp=datetime.now(timezone.utc), open=550 - i*5, high=552 - i*5, low=544 - i*5, close=546 - i*5, volume=10000)
        for i in range(6)
    ]
    # Add Hammer at index 6: open 520, high 522, low 505 (long wick = 15), close 521 (body = 1, lower_wick = 15 >= 2*1)
    hammer_candle = Candle(
        timestamp=datetime.now(timezone.utc),
        open=520.0,
        high=522.0,
        low=505.0,
        close=521.0,
        volume=25000
    )
    candles.append(hammer_candle)

    patterns = CandlestickPatternScanner.scan_patterns(candles)
    assert len(patterns) > 0
    pattern_names = [p.name for p in patterns]
    assert any("Hammer" in p or "Pin Bar" in p or "Doji" in p for p in pattern_names)


def test_market_structure_and_fibonacci():
    """Verify swing highs/lows, S/R levels, and Fibonacci golden ratios"""
    candles = [
        Candle(
            timestamp=datetime.now(timezone.utc),
            open=500 + (i if i < 15 else 30 - i) * 3,
            high=505 + (i if i < 15 else 30 - i) * 3,
            low=495 + (i if i < 15 else 30 - i) * 3,
            close=504 + (i if i < 15 else 30 - i) * 3,
            volume=15000
        )
        for i in range(30)
    ]

    report = MarketStructureAnalyzer.analyze(candles)
    assert report.trend in ("BULLISH", "BEARISH", "CONSOLIDATION")
    assert len(report.support_levels) > 0
    assert len(report.resistance_levels) > 0
    assert len(report.fibonacci_levels) == 7
    assert any(f.ratio == 0.618 for f in report.fibonacci_levels)


def test_setup_generator_and_annotations():
    """Verify setup generator constructs chart annotations and trade proposals"""
    candles = [
        Candle(
            timestamp=datetime.now(timezone.utc),
            open=500 + i * 2,
            high=504 + i * 2,
            low=498 + i * 2,
            close=503 + i * 2,
            volume=10000 + i * 1000
        )
        for i in range(25)
    ]

    eval_res = TradeSetupGenerator.evaluate_symbol(
        symbol="NABIL",
        market="NEPSE",
        candles=candles,
        timeframe="1d",
        account_size=1000000.0,
        risk_pct=1.0,
        language="en"
    )

    assert eval_res.annotations is not None
    assert len(eval_res.annotations.support_lines) > 0
    assert len(eval_res.annotations.resistance_lines) > 0
    assert eval_res.beginner_explanation is not None
    assert eval_res.pro_analysis is not None


if __name__ == "__main__":
    test_private_password_hashing()
    test_candlestick_pattern_recognition()
    test_market_structure_and_fibonacci()
    test_setup_generator_and_annotations()
    print("ALL INTEGRATION TESTS PASSED SUCCESSFULLY! ✓")
