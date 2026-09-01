"""
SHACHINA MARKET STRUCTURE & TECHNICAL ANALYSIS ENGINE
Deterministic detection of market structure (HH, HL, LH, LL),
Support/Resistance, Supply/Demand zones, Fibonacci retracements,
and multi-indicator confluence.
"""

from typing import List, Dict, Any, Optional, Tuple
import math
from pydantic import BaseModel
from shachina_quant.core.models import Candle


class SupportResistanceLevel(BaseModel):
    price: float
    level_type: str  # 'SUPPORT' | 'RESISTANCE'
    strength: int    # Number of touches/tests
    description: str


class ZoneLevel(BaseModel):
    top_price: float
    bottom_price: float
    zone_type: str  # 'SUPPLY' | 'DEMAND' | 'BREAKOUT' | 'LIQUIDITY'
    label: str


class FibonacciLevel(BaseModel):
    ratio: float
    price: float
    label: str


class MarketStructureReport(BaseModel):
    trend: str                # 'BULLISH' | 'BEARISH' | 'CONSOLIDATION'
    regime: str               # 'STRONG_TREND', 'RANGING', 'BREAKOUT', 'BREAKDOWN'
    structure_type: str       # 'HIGHER_HIGHS_HIGHER_LOWS', 'LOWER_HIGHS_LOWER_LOWS', 'COMPRESSION'
    swing_highs: List[Tuple[int, float]]
    swing_lows: List[Tuple[int, float]]
    support_levels: List[SupportResistanceLevel]
    resistance_levels: List[SupportResistanceLevel]
    supply_demand_zones: List[ZoneLevel]
    fibonacci_levels: List[FibonacciLevel]
    rsi_14: float
    rsi_signal: str           # 'OVERSOLD', 'OVERBOUGHT', 'BULLISH_MOMENTUM', 'BEARISH_MOMENTUM', 'NEUTRAL'
    macd_histogram: float
    macd_trend: str           # 'BULLISH', 'BEARISH'
    ema_9: float
    ema_21: float
    ema_50: float
    atr_14: float
    volume_ratio: float       # Latest volume / 20-bar avg volume


class MarketStructureAnalyzer:
    """
    Computes rigorous deterministic market structure and institutional indicators.
    """

    @staticmethod
    def _ema(values: List[float], period: int) -> List[float]:
        if len(values) < period:
            return []
        k = 2.0 / (period + 1)
        res = [sum(values[:period]) / period]
        for v in values[period:]:
            res.append(v * k + res[-1] * (1.0 - k))
        return res

    @staticmethod
    def _rsi(closes: List[float], period: int = 14) -> float:
        if len(closes) < period + 1:
            return 50.0
        gains, losses = [], []
        for i in range(1, len(closes)):
            diff = closes[i] - closes[i - 1]
            gains.append(max(diff, 0.0))
            losses.append(max(-diff, 0.0))
        avg_gain = sum(gains[-period:]) / period
        avg_loss = sum(losses[-period:]) / period
        if avg_loss == 0:
            return 100.0
        rs = avg_gain / avg_loss
        return 100.0 - (100.0 / (1.0 + rs))

    @staticmethod
    def _atr(candles: List[Candle], period: int = 14) -> float:
        if len(candles) < 2:
            return 5.0
        trs = []
        for i in range(1, len(candles)):
            c = candles[i]
            prev = candles[i - 1]
            tr = max(c.high - c.low, abs(c.high - prev.close), abs(c.low - prev.close))
            trs.append(tr)
        return sum(trs[-period:]) / min(len(trs), period) if trs else 5.0

    @classmethod
    def analyze(cls, candles: List[Candle]) -> MarketStructureReport:
        if len(candles) < 10:
            latest_c = candles[-1].close if candles else 500.0
            return MarketStructureReport(
                trend="CONSOLIDATION",
                regime="RANGING",
                structure_type="COMPRESSION",
                swing_highs=[],
                swing_lows=[],
                support_levels=[SupportResistanceLevel(price=latest_c * 0.95, level_type="SUPPORT", strength=1, description="Base support")],
                resistance_levels=[SupportResistanceLevel(price=latest_c * 1.05, level_type="RESISTANCE", strength=1, description="Overhead resistance")],
                supply_demand_zones=[],
                fibonacci_levels=[],
                rsi_14=50.0,
                rsi_signal="NEUTRAL",
                macd_histogram=0.0,
                macd_trend="NEUTRAL",
                ema_9=latest_c,
                ema_21=latest_c,
                ema_50=latest_c,
                atr_14=10.0,
                volume_ratio=1.0,
            )

        closes = [c.close for c in candles]
        highs = [c.high for c in candles]
        lows = [c.low for c in candles]
        volumes = [c.volume for c in candles if c.volume > 0]

        latest_price = closes[-1]

        # ── 1. Swing Highs & Lows (Fractal peaks) ──────────────────────────────
        swing_highs: List[Tuple[int, float]] = []
        swing_lows: List[Tuple[int, float]] = []

        window = 2
        for i in range(window, len(candles) - window):
            curr_h = highs[i]
            curr_l = lows[i]
            if all(curr_h >= highs[i - k] and curr_h >= highs[i + k] for k in range(1, window + 1)):
                swing_highs.append((i, curr_h))
            if all(curr_l <= lows[i - k] and curr_l <= lows[i + k] for k in range(1, window + 1)):
                swing_lows.append((i, curr_l))

        # ── 2. Market Structure (HH/HL vs LH/LL) ───────────────────────────────
        trend = "CONSOLIDATION"
        structure_type = "COMPRESSION"

        if len(swing_highs) >= 2 and len(swing_lows) >= 2:
            last_sh1, last_sh2 = swing_highs[-1][1], swing_highs[-2][1]
            last_sl1, last_sl2 = swing_lows[-1][1], swing_lows[-2][1]

            if last_sh1 > last_sh2 and last_sl1 > last_sl2:
                trend = "BULLISH"
                structure_type = "HIGHER_HIGHS_HIGHER_LOWS"
            elif last_sh1 < last_sh2 and last_sl1 < last_sl2:
                trend = "BEARISH"
                structure_type = "LOWER_HIGHS_LOWER_LOWS"
            else:
                trend = "CONSOLIDATION"
                structure_type = "COMPRESSION"
        else:
            # Fallback slope
            slope = closes[-1] - closes[0]
            trend = "BULLISH" if slope > 0 else "BEARISH" if slope < 0 else "CONSOLIDATION"

        # ── 3. Support & Resistance Clusters ───────────────────────────────────
        all_levels = [sh[1] for sh in swing_highs] + [sl[1] for sl in swing_lows]
        support_levels: List[SupportResistanceLevel] = []
        resistance_levels: List[SupportResistanceLevel] = []

        # Cluster nearby levels within 1.5%
        clusters: List[List[float]] = []
        for p in sorted(all_levels):
            matched = False
            for cl in clusters:
                if abs(p - (sum(cl) / len(cl))) / max(p, 1.0) < 0.018:
                    cl.append(p)
                    matched = True
                    break
            if not matched:
                clusters.append([p])

        for cl in clusters:
            avg_p = round(sum(cl) / len(cl), 2)
            touches = len(cl)
            if avg_p < latest_price:
                support_levels.append(SupportResistanceLevel(
                    price=avg_p,
                    level_type="SUPPORT",
                    strength=touches,
                    description=f"Key Support tested {touches}x"
                ))
            elif avg_p > latest_price:
                resistance_levels.append(SupportResistanceLevel(
                    price=avg_p,
                    level_type="RESISTANCE",
                    strength=touches,
                    description=f"Key Resistance tested {touches}x"
                ))

        # Default fallbacks if empty
        if not support_levels:
            support_levels.append(SupportResistanceLevel(
                price=round(min(lows[-15:]), 2),
                level_type="SUPPORT",
                strength=1,
                description="Recent Swing Low Support"
            ))
        if not resistance_levels:
            resistance_levels.append(SupportResistanceLevel(
                price=round(max(highs[-15:]), 2),
                level_type="RESISTANCE",
                strength=1,
                description="Recent Swing High Resistance"
            ))

        # Sort closest to price
        support_levels.sort(key=lambda s: abs(s.price - latest_price))
        resistance_levels.sort(key=lambda r: abs(r.price - latest_price))

        # ── 4. Supply & Demand / Breakout Zones ────────────────────────────────
        nearest_sup = support_levels[0].price if support_levels else latest_price * 0.96
        nearest_res = resistance_levels[0].price if resistance_levels else latest_price * 1.04
        atr_val = cls._atr(candles)

        supply_demand_zones = [
            ZoneLevel(
                top_price=round(nearest_res + atr_val * 0.4, 2),
                bottom_price=round(nearest_res - atr_val * 0.4, 2),
                zone_type="SUPPLY",
                label="Supply & Liquidity Zone"
            ),
            ZoneLevel(
                top_price=round(nearest_sup + atr_val * 0.4, 2),
                bottom_price=round(nearest_sup - atr_val * 0.4, 2),
                zone_type="DEMAND",
                label="Demand & Accumulation Zone"
            ),
        ]

        # ── 5. Fibonacci Retracement ───────────────────────────────────────────
        major_high = max(highs[-40:]) if len(highs) >= 40 else max(highs)
        major_low = min(lows[-40:]) if len(lows) >= 40 else min(lows)
        fib_range = major_high - major_low

        fib_ratios = [
            (0.0, major_high, "0.0% (Swing High)"),
            (0.236, major_high - 0.236 * fib_range, "23.6% Fib"),
            (0.382, major_high - 0.382 * fib_range, "38.2% Fib"),
            (0.500, major_high - 0.500 * fib_range, "50.0% Golden Mid"),
            (0.618, major_high - 0.618 * fib_range, "61.8% Golden Pocket"),
            (0.786, major_high - 0.786 * fib_range, "78.6% Fib"),
            (1.0, major_low, "100.0% (Swing Low)"),
        ]
        fibonacci_levels = [
            FibonacciLevel(ratio=r, price=round(p, 2), label=l)
            for r, p, l in fib_ratios
        ]

        # ── 6. Moving Averages & Momentum ──────────────────────────────────────
        ema9_vals = cls._ema(closes, 9)
        ema21_vals = cls._ema(closes, 21)
        ema50_vals = cls._ema(closes, 50)
        ema12_vals = cls._ema(closes, 12)
        ema26_vals = cls._ema(closes, 26)

        ema9 = ema9_vals[-1] if ema9_vals else latest_price
        ema21 = ema21_vals[-1] if ema21_vals else latest_price
        ema50 = ema50_vals[-1] if ema50_vals else latest_price

        macd_hist = 0.0
        if ema12_vals and ema26_vals:
            macd_hist = ema12_vals[-1] - ema26_vals[-1]
        macd_trend = "BULLISH" if macd_hist > 0 else "BEARISH"

        rsi_14 = cls._rsi(closes, 14)
        if rsi_14 < 30:
            rsi_signal = "OVERSOLD"
        elif rsi_14 > 70:
            rsi_signal = "OVERBOUGHT"
        elif rsi_14 >= 55:
            rsi_signal = "BULLISH_MOMENTUM"
        elif rsi_14 <= 45:
            rsi_signal = "BEARISH_MOMENTUM"
        else:
            rsi_signal = "NEUTRAL"

        avg_vol = sum(volumes[-20:]) / max(len(volumes[-20:]), 1) if volumes else 1.0
        latest_vol = volumes[-1] if volumes else 1.0
        volume_ratio = latest_vol / max(avg_vol, 1.0)

        # Market Regime
        if latest_price > nearest_res and volume_ratio > 1.3:
            regime = "BREAKOUT"
        elif latest_price < nearest_sup and volume_ratio > 1.3:
            regime = "BREAKDOWN"
        elif trend == "BULLISH" and ema9 > ema21:
            regime = "STRONG_TREND"
        else:
            regime = "RANGING"

        return MarketStructureReport(
            trend=trend,
            regime=regime,
            structure_type=structure_type,
            swing_highs=swing_highs[-6:],
            swing_lows=swing_lows[-6:],
            support_levels=support_levels[:3],
            resistance_levels=resistance_levels[:3],
            supply_demand_zones=supply_demand_zones,
            fibonacci_levels=fibonacci_levels,
            rsi_14=round(rsi_14, 1),
            rsi_signal=rsi_signal,
            macd_histogram=round(macd_hist, 2),
            macd_trend=macd_trend,
            ema_9=round(ema9, 2),
            ema_21=round(ema21, 2),
            ema_50=round(ema50, 2),
            atr_14=round(atr_val, 2),
            volume_ratio=round(volume_ratio, 2),
        )
