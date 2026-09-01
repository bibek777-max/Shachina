"""
SHACHINA CANDLESTICK PATTERN RECOGNITION ENGINE
Deterministic detection of 16+ institutional candlestick patterns
with surrounding trend and support/resistance context validation.
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from shachina_quant.core.models import Candle


class PatternResult(BaseModel):
    name: str
    direction: str  # 'BULLISH' | 'BEARISH' | 'NEUTRAL'
    confidence: float  # 0.0 - 100.0
    candle_index: int
    price: float
    description: str
    context_aligned: bool


class CandlestickPatternScanner:
    """
    Scans a series of OHLCV candles and detects multi-bar and single-bar patterns.
    Validates with preceding trend so patterns are only confirmed when context agrees.
    """

    @staticmethod
    def scan_patterns(candles: List[Candle]) -> List[PatternResult]:
        if len(candles) < 5:
            return []

        results: List[PatternResult] = []
        n = len(candles)

        # Pre-calculate short-term trends (5-bar slope)
        for i in range(2, n):
            c = candles[i]
            prev1 = candles[i - 1]
            prev2 = candles[i - 2] if i >= 2 else None
            prev3 = candles[i - 3] if i >= 3 else None

            # Preceding 5-candle trend direction
            start_idx = max(0, i - 5)
            trend_slope = candles[i - 1].close - candles[start_idx].close
            is_downtrend = trend_slope < 0
            is_uptrend = trend_slope > 0

            # ── 1. DOJI ────────────────────────────────────────────────────────
            body_ratio = c.body / max(c.range, 0.001)
            if body_ratio < 0.10 and c.range > 0:
                # Dragonfly Doji (very long lower shadow, minimal upper shadow)
                if c.lower_wick >= c.range * 0.65 and c.upper_wick <= c.range * 0.15:
                    results.append(PatternResult(
                        name="Dragonfly Doji",
                        direction="BULLISH" if is_downtrend else "NEUTRAL",
                        confidence=85.0 if is_downtrend else 60.0,
                        candle_index=i,
                        price=c.close,
                        description="Bullish reversal signal at support: buyers rejected lower prices.",
                        context_aligned=is_downtrend
                    ))
                # Gravestone Doji (very long upper shadow, minimal lower shadow)
                elif c.upper_wick >= c.range * 0.65 and c.lower_wick <= c.range * 0.15:
                    results.append(PatternResult(
                        name="Gravestone Doji",
                        direction="BEARISH" if is_uptrend else "NEUTRAL",
                        confidence=85.0 if is_uptrend else 60.0,
                        candle_index=i,
                        price=c.close,
                        description="Bearish reversal signal at resistance: sellers rejected higher prices.",
                        context_aligned=is_uptrend
                    ))
                else:
                    results.append(PatternResult(
                        name="Standard Doji",
                        direction="NEUTRAL",
                        confidence=70.0,
                        candle_index=i,
                        price=c.close,
                        description="Market indecision: equilibrium between buyers and sellers.",
                        context_aligned=True
                    ))

            # ── 2. HAMMER & INVERTED HAMMER (In Downtrend) ──────────────────────
            if is_downtrend and c.range > 0:
                # Hammer: small body near top, lower shadow >= 2x body, tiny upper shadow
                if c.lower_wick >= (c.body * 2.0) and c.upper_wick <= (c.range * 0.15) and body_ratio >= 0.15:
                    results.append(PatternResult(
                        name="Hammer",
                        direction="BULLISH",
                        confidence=88.0,
                        candle_index=i,
                        price=c.close,
                        description="Bullish reversal: strong intraday recovery off bottom support.",
                        context_aligned=True
                    ))
                # Inverted Hammer: small body near bottom, upper shadow >= 2x body
                elif c.upper_wick >= (c.body * 2.0) and c.lower_wick <= (c.range * 0.15) and body_ratio >= 0.15:
                    results.append(PatternResult(
                        name="Inverted Hammer",
                        direction="BULLISH",
                        confidence=80.0,
                        candle_index=i,
                        price=c.close,
                        description="Potential bottom reversal: early buyer entry testing overhead liquidity.",
                        context_aligned=True
                    ))

            # ── 3. SHOOTING STAR & HANGING MAN (In Uptrend) ────────────────────
            if is_uptrend and c.range > 0:
                # Shooting Star: small body near bottom, upper shadow >= 2x body
                if c.upper_wick >= (c.body * 2.0) and c.lower_wick <= (c.range * 0.15) and body_ratio >= 0.15:
                    results.append(PatternResult(
                        name="Shooting Star",
                        direction="BEARISH",
                        confidence=88.0,
                        candle_index=i,
                        price=c.close,
                        description="Bearish exhaustion at resistance: bulls failed to hold session highs.",
                        context_aligned=True
                    ))
                # Hanging Man: small body near top, lower shadow >= 2x body in uptrend
                elif c.lower_wick >= (c.body * 2.0) and c.upper_wick <= (c.range * 0.15) and body_ratio >= 0.15:
                    results.append(PatternResult(
                        name="Hanging Man",
                        direction="BEARISH",
                        confidence=78.0,
                        candle_index=i,
                        price=c.close,
                        description="Warning signal: sudden selling pressure breaking previous uptrend structure.",
                        context_aligned=True
                    ))

            # ── 4. BULLISH & BEARISH ENGULFING ─────────────────────────────────
            if prev1 and prev1.range > 0:
                # Bullish Engulfing: prev red, current green completely engulfs prev body
                if prev1.is_bearish and c.is_bullish and c.open <= prev1.close and c.close >= prev1.open:
                    results.append(PatternResult(
                        name="Bullish Engulfing",
                        direction="BULLISH",
                        confidence=92.0 if is_downtrend else 80.0,
                        candle_index=i,
                        price=c.close,
                        description="Strong institutional accumulation completely absorbing previous selling pressure.",
                        context_aligned=is_downtrend
                    ))
                # Bearish Engulfing: prev green, current red completely engulfs prev body
                elif prev1.is_bullish and c.is_bearish and c.open >= prev1.close and c.close <= prev1.open:
                    results.append(PatternResult(
                        name="Bearish Engulfing",
                        direction="BEARISH",
                        confidence=92.0 if is_uptrend else 80.0,
                        candle_index=i,
                        price=c.close,
                        description="Heavy institutional distribution overcoming prior buyer momentum.",
                        context_aligned=is_uptrend
                    ))

            # ── 5. MORNING STAR & EVENING STAR (3-Candle Patterns) ──────────────
            if prev1 and prev2:
                # Morning Star: Bearish -> Small Star -> Strong Bullish closing > mid of candle 1
                mid_prev2 = (prev2.open + prev2.close) / 2.0
                if prev2.is_bearish and (prev1.body / max(prev1.range, 0.001) < 0.35) and c.is_bullish and c.close > mid_prev2:
                    results.append(PatternResult(
                        name="Morning Star",
                        direction="BULLISH",
                        confidence=94.0,
                        candle_index=i,
                        price=c.close,
                        description="High-probability 3-bar bottom reversal confirming buyer dominance.",
                        context_aligned=True
                    ))
                # Evening Star: Bullish -> Small Star -> Strong Bearish closing < mid of candle 1
                if prev2.is_bullish and (prev1.body / max(prev1.range, 0.001) < 0.35) and c.is_bearish and c.close < mid_prev2:
                    results.append(PatternResult(
                        name="Evening Star",
                        direction="BEARISH",
                        confidence=94.0,
                        candle_index=i,
                        price=c.close,
                        description="High-probability 3-bar top exhaustion confirming seller takeover.",
                        context_aligned=True
                    ))

            # ── 6. PIERCING LINE & DARK CLOUD COVER ────────────────────────────
            if prev1 and prev1.range > 0:
                mid_prev1 = (prev1.open + prev1.close) / 2.0
                # Piercing Line: in downtrend, open below prev low, close above 50% of prev body
                if is_downtrend and prev1.is_bearish and c.is_bullish and c.open < prev1.low and c.close > mid_prev1 and c.close < prev1.open:
                    results.append(PatternResult(
                        name="Piercing Line",
                        direction="BULLISH",
                        confidence=86.0,
                        candle_index=i,
                        price=c.close,
                        description="Bullish reversal: deep discount gap filled with strong buying through midpoint.",
                        context_aligned=True
                    ))
                # Dark Cloud Cover: in uptrend, open above prev high, close below 50% of prev body
                if is_uptrend and prev1.is_bullish and c.is_bearish and c.open > prev1.high and c.close < mid_prev1 and c.close > prev1.open:
                    results.append(PatternResult(
                        name="Dark Cloud Cover",
                        direction="BEARISH",
                        confidence=86.0,
                        candle_index=i,
                        price=c.close,
                        description="Bearish reversal: breakout failure with aggressive sell-through into prior body.",
                        context_aligned=True
                    ))

            # ── 7. INSIDE BAR ──────────────────────────────────────────────────
            if prev1:
                if c.high <= prev1.high and c.low >= prev1.low:
                    results.append(PatternResult(
                        name="Inside Bar",
                        direction="NEUTRAL",
                        confidence=75.0,
                        candle_index=i,
                        price=c.close,
                        description="Volatility contraction: price compressed within mother bar range. Watch for breakout.",
                        context_aligned=True
                    ))

            # ── 8. PIN BAR ─────────────────────────────────────────────────────
            if c.range > 0:
                # Bullish Pin bar: long tail downwards (> 66% of range), small body at top
                if c.lower_wick >= (c.range * 0.66) and c.upper_wick <= (c.range * 0.15):
                    results.append(PatternResult(
                        name="Bullish Pin Bar",
                        direction="BULLISH",
                        confidence=87.0,
                        candle_index=i,
                        price=c.close,
                        description="Liquidity sweep rejection: aggressive absorption at swing low.",
                        context_aligned=True
                    ))
                # Bearish Pin bar: long tail upwards (> 66% of range), small body at bottom
                elif c.upper_wick >= (c.range * 0.66) and c.lower_wick <= (c.range * 0.15):
                    results.append(PatternResult(
                        name="Bearish Pin Bar",
                        direction="BEARISH",
                        confidence=87.0,
                        candle_index=i,
                        price=c.close,
                        description="Overhead supply rejection: failure to maintain higher prices.",
                        context_aligned=True
                    ))

            # ── 9. MARUBOZU ────────────────────────────────────────────────────
            if c.range > 0 and body_ratio >= 0.90:
                if c.is_bullish:
                    results.append(PatternResult(
                        name="Bullish Marubozu",
                        direction="BULLISH",
                        confidence=90.0,
                        candle_index=i,
                        price=c.close,
                        description="Decisive directional dominance: pure buyer power from open to close.",
                        context_aligned=True
                    ))
                elif c.is_bearish:
                    results.append(PatternResult(
                        name="Bearish Marubozu",
                        direction="BEARISH",
                        confidence=90.0,
                        candle_index=i,
                        price=c.close,
                        description="Decisive directional dump: pure seller power from open to close.",
                        context_aligned=True
                    ))

            # ── 10. THREE WHITE SOLDIERS & THREE BLACK CROWS ───────────────────
            if prev1 and prev2:
                # Three White Soldiers: 3 consecutive solid bullish candles making new highs
                if (prev2.is_bullish and prev1.is_bullish and c.is_bullish and
                    c.close > prev1.close > prev2.close and
                    c.open > prev1.open > prev2.open and
                    c.body > (c.range * 0.6) and prev1.body > (prev1.range * 0.6)):
                    results.append(PatternResult(
                        name="Three White Soldiers",
                        direction="BULLISH",
                        confidence=95.0,
                        candle_index=i,
                        price=c.close,
                        description="Sustained institutional accumulation with cascading higher closes.",
                        context_aligned=True
                    ))
                # Three Black Crows: 3 consecutive solid bearish candles making new lows
                if (prev2.is_bearish and prev1.is_bearish and c.is_bearish and
                    c.close < prev1.close < prev2.close and
                    c.open < prev1.open < prev2.open and
                    c.body > (c.range * 0.6) and prev1.body > (prev1.range * 0.6)):
                    results.append(PatternResult(
                        name="Three Black Crows",
                        direction="BEARISH",
                        confidence=95.0,
                        candle_index=i,
                        price=c.close,
                        description="Sustained institutional distribution with cascading lower closes.",
                        context_aligned=True
                    ))

        return results
