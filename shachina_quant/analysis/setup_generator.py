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
        if len(candles) < 10:
            unavailable_text = (
                f"📊 **TRADE ANALYSIS**\n\n"
                f"• **Symbol**: `{symbol}`\n"
                f"• **Price**: N/A\n"
                f"• **Timeframe**: `{timeframe}`\n"
                f"• **Market**: `{market}`\n"
                f"• **Data**: ⚠️ **LIVE DATA UNAVAILABLE**\n\n"
                f"### **Signal:**\n"
                f"🟡 **WAIT**\n\n"
                f"• **Confidence**: `0/100`\n\n"
                f"### **Reason:**\n"
                f"• Insufficient historical candle data to construct reliable market structure.\n"
                f"• Minimum 10 candles required for institutional order flow analysis.\n\n"
                f"### **Confirmation:**\n"
                f"Waiting for live market feed connection.\n\n"
                f"### **Invalidation:**\n"
                f"No active setup valid without live market feed."
            )
            return SetupEvaluation(
                has_setup=False,
                beginner_explanation=unavailable_text,
                pro_analysis=unavailable_text
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
        else:
            reasons.append("Price consolidating in equilibrium range")

        if structure.bos_event == "BOS_BULLISH":
            score += 15
            reasons.append("Confirmed Break of Structure (BOS) to the upside")
        elif structure.bos_event in ("CHOCH_BULLISH", "MSS_BULLISH"):
            score += 15
            reasons.append("Bullish Market Structure Shift (MSS/CHoCH) with displacement")
        elif structure.bos_event == "BOS_BEARISH":
            score += 15
            reasons.append("Confirmed Break of Structure (BOS) to the downside")

        # Dealing Range / Discount (max 15)
        if structure.dealing_range_zone == "DISCOUNT":
            score += 15
            reasons.append("Price is in Discount zone (below equilibrium) — optimal for Longs")
        elif structure.dealing_range_zone == "PREMIUM":
            reasons.append("Price is in Premium zone (above equilibrium) — optimal for Shorts or profit-taking")

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

        if not reasons:
            reasons.append("Market is testing equilibrium levels without directional expansion.")

        # Determine Setup Quality & Decision
        if score >= 70:
            setup_quality = "A+"
            decision = "YES"
            signal_text = "BUY / LONG" if structure.trend == "BULLISH" or bullish_patterns else "SELL / SHORT"
            signal_emoji = "🟢" if "BUY" in signal_text else "🔴"
        elif score >= 55:
            setup_quality = "A"
            decision = "YES"
            signal_text = "BUY / LONG" if structure.trend == "BULLISH" or bullish_patterns else "SELL / SHORT"
            signal_emoji = "🟢" if "BUY" in signal_text else "🔴"
        elif score >= 35:
            setup_quality = "B"
            decision = "WAIT"
            signal_text = "WAIT"
            signal_emoji = "🟡"
        else:
            setup_quality = "NO TRADE"
            decision = "NO"
            signal_text = "NO TRADE"
            signal_emoji = "⚪"

        direction = "BUY" if structure.trend == "BULLISH" or bullish_patterns else "SELL"
        market_bias = "Bullish" if structure.trend == "BULLISH" else "Bearish" if structure.trend == "BEARISH" else "Range"
        setup_name = f"Liquidity & Structure ({structure.regime})"

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
        invalidation_summary = f"Close below Stop Loss NPR {sl_price:.2f} invalidates this setup." if direction == "BUY" else f"Close above Stop Loss NPR {sl_price:.2f} invalidates this setup."

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

        # Standardized Response Format
        reasons_formatted = "\n".join([f"• {r}" for r in reasons[:4]])

        pro_analysis = (
            f"📊 **TRADE ANALYSIS**\n\n"
            f"• **Symbol**: `{symbol}`\n"
            f"• **Price**: NPR {latest_c:.2f}\n"
            f"• **Timeframe**: `{timeframe}`\n"
            f"• **Market**: `{market}`\n"
            f"• **Data**: 🟢 **LIVE**\n\n"
            f"### **Signal:**\n"
            f"{signal_emoji} **{signal_text}**\n\n"
            f"• **Entry**: NPR {entry_price:.2f}\n"
            f"• **Stop Loss**: NPR {sl_price:.2f}\n"
            f"• **TP1**: NPR {t1_price:.2f}\n"
            f"• **TP2**: NPR {t2_price:.2f}\n"
            f"• **TP3**: NPR {t3_price:.2f}\n"
            f"• **RR**: 1:{rr_ratio:.1f}\n"
            f"• **Trend**: **{structure.trend.upper()}**\n"
            f"• **Support**: NPR {nearest_sup:.2f}\n"
            f"• **Resistance**: NPR {nearest_res:.2f}\n"
            f"• **Confidence**: `{score}/100` ({setup_quality})\n\n"
            f"### **Reason:**\n"
            f"{reasons_formatted}\n\n"
            f"### **Confirmation:**\n"
            f"{confirmation_summary}\n\n"
            f"### **Invalidation:**\n"
            f"{invalidation_summary}"
        )

        return SetupEvaluation(
            has_setup=decision == "YES",
            setup=proposal if decision == "YES" else None,
            annotations=ann,
            patterns=patterns,
            structure=structure,
            beginner_explanation=pro_analysis,
            pro_analysis=pro_analysis
        )
