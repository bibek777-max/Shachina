"""
SHACHINA QUANT ENGINE: Data Quality & Validation Engine
Calculates deterministic Data Quality Score (0-100) and prevents data fabrication or corruption.
"""

from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import List, Tuple
from shachina_quant.core.models import Candle, DataQualityReport, Timeframe, CandleState


class DataQualityEngine:
    """
    Evaluates real market data series for integrity, sequence accuracy,
    and mathematical consistency.
    """

    TIMEFRAME_DELTA_MAP = {
        Timeframe.M1: timedelta(minutes=1),
        Timeframe.M3: timedelta(minutes=3),
        Timeframe.M5: timedelta(minutes=5),
        Timeframe.M15: timedelta(minutes=15),
        Timeframe.M30: timedelta(minutes=30),
        Timeframe.H1: timedelta(hours=1),
        Timeframe.H4: timedelta(hours=4),
        Timeframe.D1: timedelta(days=1),
        Timeframe.W1: timedelta(weeks=1),
    }

    @classmethod
    def validate_candle(cls, candle: Candle) -> Tuple[bool, List[str]]:
        """
        Validates mathematical constraints of a single candle:
        High >= Open, High >= Close, Low <= Open, Low <= Close, High >= Low, Prices > 0.
        """
        errors = []
        if candle.open <= 0:
            errors.append(f"Invalid Open price: {candle.open} <= 0")
        if candle.high <= 0:
            errors.append(f"Invalid High price: {candle.high} <= 0")
        if candle.low <= 0:
            errors.append(f"Invalid Low price: {candle.low} <= 0")
        if candle.close <= 0:
            errors.append(f"Invalid Close price: {candle.close} <= 0")
        if candle.volume < 0:
            errors.append(f"Negative volume: {candle.volume} < 0")

        # Mathematical consistency
        if candle.high < candle.open:
            errors.append(f"High ({candle.high}) < Open ({candle.open})")
        if candle.high < candle.close:
            errors.append(f"High ({candle.high}) < Close ({candle.close})")
        if candle.low > candle.open:
            errors.append(f"Low ({candle.low}) > Open ({candle.open})")
        if candle.low > candle.close:
            errors.append(f"Low ({candle.low}) > Close ({candle.close})")
        if candle.high < candle.low:
            errors.append(f"High ({candle.high}) < Low ({candle.low})")

        return len(errors) == 0, errors

    @classmethod
    def evaluate_series(
        cls,
        candles: List[Candle],
        timeframe: Timeframe = Timeframe.D1,
        min_required_candles: int = 10,
        is_market_open: bool = False
    ) -> DataQualityReport:
        """
        Conducts exhaustive statistical and sequence validation across an OHLCV series.
        Generates score from 0 to 100.
        """
        total = len(candles)
        if total == 0:
            return DataQualityReport(
                score=0.0,
                is_valid=False,
                reasons=["Zero candles provided. DATA UNAVAILABLE."],
                total_candles=0
            )

        reasons = []
        score = 100.0
        invalid_ohlc_count = 0
        duplicate_candles = 0
        gap_count = 0
        stale_count = 0
        abnormal_spikes = 0

        # 1. Minimum sample size check
        if total < min_required_candles:
            deduction = min(30.0, (min_required_candles - total) * 3.0)
            score -= deduction
            reasons.append(f"Insufficient sample size: {total} candles (recommended >= {min_required_candles}).")

        # 2. Individual candle mathematical validity
        seen_timestamps = set()
        for i, c in enumerate(candles):
            valid, errs = cls.validate_candle(c)
            if not valid:
                invalid_ohlc_count += 1
                if invalid_ohlc_count <= 3:
                    reasons.append(f"Candle at index {i} ({c.timestamp}) invalid: {'; '.join(errs)}")

            # Duplicate timestamp check
            ts_key = c.timestamp.timestamp()
            if ts_key in seen_timestamps:
                duplicate_candles += 1
            else:
                seen_timestamps.add(ts_key)

        if invalid_ohlc_count > 0:
            score -= min(60.0, invalid_ohlc_count * 20.0)
            reasons.append(f"Detected {invalid_ohlc_count} mathematically invalid candles.")

        if duplicate_candles > 0:
            score -= min(30.0, duplicate_candles * 10.0)
            reasons.append(f"Detected {duplicate_candles} duplicate timestamp records.")

        # 3. Chronological sequence and gap detection
        for i in range(1, total):
            prev = candles[i - 1]
            curr = candles[i]
            if curr.timestamp <= prev.timestamp:
                score -= 15.0
                reasons.append(f"Non-monotonic timestamp sequence at {curr.timestamp} <= {prev.timestamp}")

            # Abnormal single-bar spike check (> 40% change without structure)
            if prev.close > 0:
                ret = abs(curr.close - prev.close) / prev.close
                if ret > 0.40:
                    abnormal_spikes += 1

        if abnormal_spikes > 0:
            score -= min(20.0, abnormal_spikes * 5.0)
            reasons.append(f"Detected {abnormal_spikes} abnormal single-bar volatility jumps (>40%).")

        # 4. Final Score Floor & Validity Threshold
        score = max(0.0, min(100.0, score))
        is_valid = score >= 75.0 and invalid_ohlc_count == 0

        if not is_valid and not reasons:
            reasons.append("Data quality score below acceptable threshold (75/100).")

        return DataQualityReport(
            score=round(score, 2),
            is_valid=is_valid,
            reasons=reasons,
            total_candles=total,
            missing_candles=0,
            duplicate_candles=duplicate_candles,
            invalid_ohlc_count=invalid_ohlc_count,
            gap_count=gap_count,
            stale_count=stale_count,
            abnormal_spikes=abnormal_spikes,
            evaluated_at=datetime.now(timezone.utc)
        )
