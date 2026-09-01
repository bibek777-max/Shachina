"""
SHACHINA WORLD-CLASS TRADING SETUP GENERATOR & DECISION ENGINE
Confluence analysis connecting price action, candlestick behavior, institutional liquidity (BSL/SSL/Sweeps/FVG/OB),
market structure (BOS/CHoCH/MSS), Premium/Discount dealing ranges, position sizing, risk management, and chart drawings.
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from shachina_quant.core.models import Candle
from shachina_quant.analysis.patterns import CandlestickPatternScanner, PatternResult
from shachina_quant.analysis.structure import MarketStructureAnalyzer, MarketStructureReport


class ChartAnnotationLine(BaseModel):
    price: float
    label: str
    color: Optional[str] = None


class ChartZone(BaseModel):
    top: float
    bottom: float
    type: str  # 'BREAKOUT', 'SUPPLY', 'DEMAND', 'LIQUIDITY', 'FVG', 'ORDER_BLOCK'
    label: str


class ChartPatternBadge(BaseModel):
    candle_index: int
    pattern: str
    direction: str  # 'BULLISH', 'BEARISH'
    price: float


class ChartAnnotations(BaseModel):
    symbol: str
    timeframe: str
    support_lines: List[ChartAnnotationLine] = []
    resistance_lines: List[ChartAnnotationLine] = []
    entry_line: Optional[ChartAnnotationLine] = None
    stop_loss_line: Optional[ChartAnnotationLine] = None
    target_lines: List[ChartAnnotationLine] = []
    zones: List[ChartZone] = []
    patterns: List[ChartPatternBadge] = []
    fibonacci_levels: List[Dict[str, Any]] = []


class TradeProposal(BaseModel):
    symbol: str
    market: str
    decision: str            # 'YES', 'NO', 'WAIT'
    direction: str           # 'BUY' (Long) / 'SELL' (Short)
    market_bias: str         # 'Bullish', 'Bearish', 'Neutral'
    setup_name: str
    setup_quality: str       # 'A+', 'A', 'B', 'C', 'NO TRADE'
    entry_price: float
    entry_zone: str
    stop_loss: float
    target_1: float
    target_2: float
    target_3: float
    risk_per_share: float
    potential_reward: float
    risk_reward: str
    suggested_shares: int
    estimated_risk_npr: float
    liquidity_analysis: str
    structure_summary: str
    candlestick_summary: str
    confirmation_summary: str
    invalidation_summary: str
    reasons: List[str]
    warning: str = "Statistical probability is NOT a guarantee of profit. Capital preservation is mandatory."


class SetupEvaluation(BaseModel):
    has_setup: bool
    setup: Optional[TradeProposal] = None
    annotations: Optional[ChartAnnotations] = None
    patterns: List[PatternResult] = []
    structure: Optional[MarketStructureReport] = None
    beginner_explanation: str
    pro_analysis: str


class TradeSetupGenerator:
    """
    World-class Trading Setup Evaluator & Multi-Methodology Confluence Engine.
    """

    @classmethod
    def evaluate_symbol(
        cls,
        symbol: str,
        market: str,
        candles: List[Candle],
        timeframe: str = "1d",
        account_size: float = 1000000.0,
        risk_pct: float = 1.0,
        language: str = "en"
    ) -> SetupEvaluation:
        if len(candles) < 15:
            return SetupEvaluation(
                has_setup=False,
                beginner_explanation="Insufficient historical data to analyze structure.",
                pro_analysis="Sample size below minimum 15-candle requirement."
            )

        # 1. Patterns & Market Structure
        patterns = CandlestickPatternScanner.scan_patterns(candles)
        structure = MarketStructureAnalyzer.analyze(candles)
        latest_c = candles[-1].close
        atr = structure.atr_14 or (latest_c * 0.02)
        n = len(candles)

        recent_patterns = [p for p in patterns if p.candle_index >= n - 5]
        bullish_patterns = [p for p in recent_patterns if p.direction == "BULLISH"]
        bearish_patterns = [p for p in recent_patterns if p.direction == "BEARISH"]

        # 2. Confluence Score Calculation (0 - 100)
        score = 0
        reasons: List[str] = []

        # Market structure points (max 25)
        if structure.trend == "BULLISH":
            score += 20
            reasons.append("Bullish market structure (Higher Highs / Higher Lows)")
        elif structure.trend == "BEARISH":
            score += 15
            reasons.append("Bearish market structure (Lower Highs / Lower Lows)")

        if structure.bos_event == "BOS_BULLISH":
            score += 10
            reasons.append("Confirmed Break of Structure (BOS) to the upside")
        elif structure.bos_event == "CHOCH_BULLISH" or structure.bos_event == "MSS_BULLISH":
            score += 15
            reasons.append("Bullish Market Structure Shift (MSS/CHoCH) with displacement")

        # Dealing Range / Discount (max 15)
        if structure.dealing_range_zone == "DISCOUNT":
            score += 15
            reasons.append("Price is in Discount zone (below equilibrium) — optimal for Longs")
        elif structure.dealing_range_zone == "PREMIUM":
            reasons.append("Price is in Premium zone (above equilibrium)")

        # Candlestick Confirmation (max 20)
        if bullish_patterns:
            score += 20
            p_names = ", ".join([p.name for p in bullish_patterns])
            reasons.append(f"Institutional Candlestick Confirmation: {p_names}")
        elif bearish_patterns:
            score += 15
            p_names = ", ".join([p.name for p in bearish_patterns])
            reasons.append(f"Bearish Candlestick Rejection: {p_names}")

        # Momentum & Indicators (max 20)
        if structure.rsi_signal in ("OVERSOLD", "BULLISH_MOMENTUM"):
            score += 10
            reasons.append(f"RSI(14) Momentum: {structure.rsi_14:.1f} ({structure.rsi_signal})")
        if structure.macd_trend == "BULLISH":
            score += 10
            reasons.append("MACD histogram expanding bullish")

        # Volume Confirmation (max 10)
        if structure.volume_ratio > 1.25:
            score += 10
            reasons.append(f"Volume Expansion: {structure.volume_ratio:.1f}x of 20-bar average")

        # Determine Setup Quality & Decision
        if score >= 75:
            setup_quality = "A+"
            decision = "YES"
        elif score >= 60:
            setup_quality = "A"
            decision = "YES"
        elif score >= 45:
            setup_quality = "B"
            decision = "WAIT"
        elif score >= 30:
            setup_quality = "C"
            decision = "WAIT"
        else:
            setup_quality = "NO TRADE"
            decision = "NO"

        direction = "BUY" if structure.trend == "BULLISH" or bullish_patterns else "SELL"
        market_bias = "Bullish" if structure.trend == "BULLISH" else "Bearish" if structure.trend == "BEARISH" else "Neutral"
        setup_name = f"Liquidity Reversal & Market Structure ({structure.regime})"

        # 3. Execution Levels (Structural Stop Loss & Realistic Multi-Targets)
        nearest_sup = structure.support_levels[0].price if structure.support_levels else latest_c - (atr * 1.5)
        nearest_res = structure.resistance_levels[0].price if structure.resistance_levels else latest_c + (atr * 2.0)

        entry_price = round(latest_c, 2)
        if direction == "BUY":
            sl_price = round(min(nearest_sup - (atr * 0.3), latest_c * 0.96), 2)
            risk_per_share = max(round(entry_price - sl_price, 2), 1.0)
            t1_price = round(entry_price + (risk_per_share * 2.0), 2)
            t2_price = round(entry_price + (risk_per_share * 3.2), 2)
            t3_price = round(entry_price + (risk_per_share * 5.0), 2)
            potential_reward = round(t1_price - entry_price, 2)
        else:
            sl_price = round(max(nearest_res + (atr * 0.3), latest_c * 1.04), 2)
            risk_per_share = max(round(sl_price - entry_price, 2), 1.0)
            t1_price = round(entry_price - (risk_per_share * 2.0), 2)
            t2_price = round(entry_price - (risk_per_share * 3.2), 2)
            t3_price = round(entry_price - (risk_per_share * 5.0), 2)
            potential_reward = round(entry_price - t1_price, 2)

        rr_ratio = round(potential_reward / risk_per_share, 1)

        # Position Sizing based on Account Risk (1% of capital)
        risk_budget = account_size * (risk_pct / 100.0)
        suggested_shares = max(10, int(risk_budget // risk_per_share))
        estimated_risk_npr = round(risk_per_share * suggested_shares, 2)

        # Chart Annotations
        ann = ChartAnnotations(
            symbol=symbol,
            timeframe=timeframe,
            support_lines=[ChartAnnotationLine(price=s.price, label=f"Support: NPR {s.price:.1f}", color="#10b981") for s in structure.support_levels],
            resistance_lines=[ChartAnnotationLine(price=r.price, label=f"Resistance: NPR {r.price:.1f}", color="#ef4444") for r in structure.resistance_levels],
            entry_line=ChartAnnotationLine(price=entry_price, label=f"ENTRY @ {entry_price:.2f}", color="#06b6d4"),
            stop_loss_line=ChartAnnotationLine(price=sl_price, label=f"STOP LOSS @ {sl_price:.2f}", color="#f43f5e"),
            target_lines=[
                ChartAnnotationLine(price=t1_price, label=f"TARGET 1 @ {t1_price:.2f} (1:{rr_ratio} R:R)", color="#10b981"),
                ChartAnnotationLine(price=t2_price, label=f"TARGET 2 @ {t2_price:.2f}", color="#34d399"),
                ChartAnnotationLine(price=t3_price, label=f"TARGET 3 @ {t3_price:.2f}", color="#6ee7b7"),
            ],
            zones=[ChartZone(top=z.top_price, bottom=z.bottom_price, type=z.zone_type, label=z.label) for z in structure.supply_demand_zones],
            patterns=[ChartPatternBadge(candle_index=p.candle_index, pattern=p.name, direction=p.direction, price=p.price) for p in recent_patterns],
            fibonacci_levels=[
                {
                    "ratio": f.get("ratio", 0.0) if isinstance(f, dict) else getattr(f, "ratio", 0.0),
                    "price": f.get("price", 0.0) if isinstance(f, dict) else getattr(f, "price", 0.0),
                    "label": f.get("label", "") if isinstance(f, dict) else getattr(f, "label", ""),
                }
                for f in structure.fibonacci_levels
            ],
        )

        liquidity_summary = f"BSL above NPR {structure.previous_day_high or nearest_res:.1f}, SSL below NPR {structure.previous_day_low or nearest_sup:.1f}. Dealing Zone: {structure.dealing_range_zone}."
        structure_summary = f"{structure.trend} trend ({structure.structure_type}). {structure.bos_event or 'Structure holding'}."
        candlestick_summary = ", ".join([p.name for p in recent_patterns]) if recent_patterns else "Consolidation candles near key level"
        confirmation_summary = f"Confluence score: {score}/100 with {len(reasons)} supporting factors."
        invalidation_summary = f"Daily close below Stop Loss NPR {sl_price:.2f} invalidates this setup."

        proposal = TradeProposal(
            symbol=symbol,
            market=market,
            decision=decision,
            direction=direction,
            market_bias=market_bias,
            setup_name=setup_name,
            setup_quality=setup_quality,
            entry_price=entry_price,
            entry_zone=f"{entry_price - 2:.1f} - {entry_price + 1:.1f}",
            stop_loss=sl_price,
            target_1=t1_price,
            target_2=t2_price,
            target_3=t3_price,
            risk_per_share=risk_per_share,
            potential_reward=potential_reward,
            risk_reward=f"1:{rr_ratio}",
            suggested_shares=suggested_shares,
            estimated_risk_npr=estimated_risk_npr,
            liquidity_analysis=liquidity_summary,
            structure_summary=structure_summary,
            candlestick_summary=candlestick_summary,
            confirmation_summary=confirmation_summary,
            invalidation_summary=invalidation_summary,
            reasons=reasons,
        )

        # Section 27 Exact Response Format
        pro_analysis = (
            f"### SHACHINA TRADE DECISION\n\n"
            f"**Decision:** **{decision}**\n\n"
            f"**Symbol:** `{symbol}` ({market})\n"
            f"**Direction:** **{'LONG' if direction == 'BUY' else 'SHORT'}**\n"
            f"**Market Bias:** {market_bias}\n"
            f"**Entry:** NPR {entry_price:.2f} (Zone: {proposal.entry_zone})\n"
            f"**Stop Loss:** NPR {sl_price:.2f}\n"
            f"**Target 1:** NPR {t1_price:.2f}\n"
            f"**Target 2:** NPR {t2_price:.2f}\n"
            f"**Target 3:** NPR {t3_price:.2f}\n"
            f"**Risk:** NPR {risk_per_share:.2f}/share (Max risk: NPR {estimated_risk_npr:,.2f})\n"
            f"**Potential Reward:** NPR {potential_reward:.2f}/share\n"
            f"**Risk/Reward:** 1:{rr_ratio}\n"
            f"**Setup:** {setup_name}\n"
            f"**Liquidity:** {liquidity_summary}\n"
            f"**Structure:** {structure_summary}\n"
            f"**Candlestick:** {candlestick_summary}\n"
            f"**Confirmation:** {confirmation_summary}\n"
            f"**Invalidation:** {invalidation_summary}\n"
            f"**Setup Quality:** **{setup_quality}**\n\n"
            f"**Reason:** {reasons[0] if reasons else 'Market is currently testing key liquidity levels.'}\n\n"
            f"⚠️ *Never guarantee profit. Statistical edge only.*"
        )

        # Beginner explanation
        if language == "ne":
            beginner_exp = (
                f"### SHACHINA निर्णय: **{decision}**\n\n"
                f"📊 **{symbol} विश्लेषण ({setup_quality} गुणस्तर)**\n\n"
                f"- **दिशा**: {direction} ({'खरिद' if direction == 'BUY' else 'बिक्री'})\n"
                f"- **प्रवेश मूल्य (Entry)**: NPR {entry_price:.2f}\n"
                f"- **Stop Loss**: NPR {sl_price:.2f} (सुरक्षा घेरा)\n"
                f"- **Target 1**: NPR {t1_price:.2f}\n"
                f"- **जोखिम र नाफा अनुपात (R:R)**: 1:{rr_ratio}\n"
                f"- **सुझाव**: {reasons[0] if reasons else 'स्पष्ट confirmation नआएसम्म पर्खनुहोस्। '}\n\n"
                f"💡 *पुँजी सुरक्षा पहिलो प्राथमिकता हो।*"
            )
        else:
            beginner_exp = (
                f"### SHACHINA DECISION: **{decision}**\n\n"
                f"📊 **{symbol} Analysis ({setup_quality} Quality)**\n\n"
                f"- **Direction**: {'LONG / BUY' if direction == 'BUY' else 'SHORT / SELL'}\n"
                f"- **Entry**: NPR {entry_price:.2f}\n"
                f"- **Stop Loss**: NPR {sl_price:.2f}\n"
                f"- **Target 1**: NPR {t1_price:.2f}\n"
                f"- **Risk / Reward**: 1:{rr_ratio}\n"
                f"- **Key Reason**: {reasons[0] if reasons else 'Market in consolidation'}\n\n"
                f"💡 *Preserve capital first before taking any trade.*"
            )

        return SetupEvaluation(
            has_setup=decision == "YES",
            setup=proposal if decision == "YES" else None,
            annotations=ann,
            patterns=patterns,
            structure=structure,
            beginner_explanation=beginner_exp,
            pro_analysis=pro_analysis
        )
