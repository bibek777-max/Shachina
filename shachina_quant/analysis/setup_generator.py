"""
SHACHINA TRADE SETUP GENERATOR & CHART ANNOTATION ENGINE
Confluence analysis connecting candlestick patterns, market structure,
institutional risk parameters, and programmatic chart drawing metadata.
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from shachina_quant.core.models import Candle, MarketType, Timeframe
from shachina_quant.analysis.patterns import CandlestickPatternScanner, PatternResult
from shachina_quant.analysis.structure import MarketStructureAnalyzer, MarketStructureReport


class ChartAnnotationLine(BaseModel):
    price: float
    label: str
    color: Optional[str] = None


class ChartZone(BaseModel):
    top: float
    bottom: float
    type: str  # 'BREAKOUT', 'SUPPLY', 'DEMAND', 'LIQUIDITY'
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
    direction: str           # 'BUY' / 'SELL'
    market_structure: str
    entry_price: float
    entry_zone: str
    stop_loss: float
    target_1: float
    target_2: float
    target_3: float
    risk_reward: str
    confidence: str          # 'High', 'Medium', 'Low'
    confidence_score: float
    estimated_risk_npr: float
    suggested_shares: int
    reasons: List[str]
    warning: str = "Confidence is a statistical assessment, NOT a profit guarantee. Capital preservation is mandatory."


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
    Evaluates confluence and generates institutional trade proposals with chart drawing metadata.
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
                beginner_explanation="Insufficient data to perform quantitative analysis.",
                pro_analysis="Historical candle count below minimum sample requirement (15 bars)."
            )

        # 1. Run Pattern Recognition
        patterns = CandlestickPatternScanner.scan_patterns(candles)
        recent_patterns = [p for p in patterns if p.candle_index >= len(candles) - 3]

        # 2. Run Market Structure
        structure = MarketStructureAnalyzer.analyze(candles)
        latest_c = candles[-1].close
        atr = structure.atr_14

        # 3. Determine Confluence & Direction
        bullish_score = 0
        bearish_score = 0
        reasons: List[str] = []

        # Structure points
        if structure.trend == "BULLISH":
            bullish_score += 25
            reasons.append("Higher Highs & Higher Lows trend structure")
        elif structure.trend == "BEARISH":
            bearish_score += 25
            reasons.append("Lower Highs & Lower Lows trend structure")

        # Momentum & Indicators
        if structure.rsi_signal in ("OVERSOLD", "BULLISH_MOMENTUM"):
            bullish_score += 20
            reasons.append(f"RSI ({structure.rsi_14}) aligned with buyer momentum")
        elif structure.rsi_signal in ("OVERBOUGHT", "BEARISH_MOMENTUM"):
            bearish_score += 20
            reasons.append(f"RSI ({structure.rsi_14}) showing overhead exhaustion")

        if structure.macd_trend == "BULLISH":
            bullish_score += 15
            reasons.append("MACD histogram positive")
        else:
            bearish_score += 15
            reasons.append("MACD histogram negative")

        if structure.volume_ratio > 1.25:
            if bullish_score > bearish_score:
                bullish_score += 15
                reasons.append(f"Volume spike ({structure.volume_ratio:.1f}x) confirming accumulation")
            else:
                bearish_score += 15
                reasons.append(f"Volume spike ({structure.volume_ratio:.1f}x) confirming distribution")

        # Pattern Confluence
        for p in recent_patterns:
            if p.direction == "BULLISH":
                bullish_score += 20
                reasons.append(f"Candlestick pattern: {p.name} ({p.description})")
            elif p.direction == "BEARISH":
                bearish_score += 20
                reasons.append(f"Candlestick pattern: {p.name} ({p.description})")

        has_valid_setup = (bullish_score >= 50 or bearish_score >= 50)
        direction = "BUY" if bullish_score > bearish_score else "SELL"
        total_score = max(bullish_score, bearish_score)

        if not has_valid_setup or (direction == "SELL" and market == "NEPSE"):
            # NEPSE is cash market — shorting is not available
            ne_msg = f"अहिले {symbol} मा high-probability setup छैन। Trade force गर्नु भन्दा wait गर्नु राम्रो देखिन्छ।"
            en_msg = f"No clean high-confluence setup on {symbol} currently. Preserving capital and waiting for clearer structure is recommended."

            # Still provide annotations for S/R
            ann = ChartAnnotations(
                symbol=symbol,
                timeframe=timeframe,
                support_lines=[ChartAnnotationLine(price=s.price, label=s.description) for s in structure.support_levels],
                resistance_lines=[ChartAnnotationLine(price=r.price, label=r.description) for r in structure.resistance_levels],
                fibonacci_levels=[
                    {
                        "ratio": f.get("ratio", 0.0) if isinstance(f, dict) else getattr(f, "ratio", 0.0),
                        "price": f.get("price", 0.0) if isinstance(f, dict) else getattr(f, "price", 0.0),
                        "label": f.get("label", "") if isinstance(f, dict) else getattr(f, "label", ""),
                    }
                    for f in structure.fibonacci_levels
                ],
                zones=[ChartZone(top=z.top_price, bottom=z.bottom_price, type=z.zone_type, label=z.label) for z in structure.supply_demand_zones],
                patterns=[ChartPatternBadge(candle_index=p.candle_index, pattern=p.name, direction=p.direction, price=p.price) for p in recent_patterns],
            )

            return SetupEvaluation(
                has_setup=False,
                annotations=ann,
                patterns=patterns,
                structure=structure,
                beginner_explanation=ne_msg if language == "ne" else en_msg,
                pro_analysis=f"Confluence score ({total_score}/100) below institutional threshold. Nearest Support: {structure.support_levels[0].price if structure.support_levels else 'N/A'}, Nearest Resistance: {structure.resistance_levels[0].price if structure.resistance_levels else 'N/A'}."
            )

        # 4. Construct Execution Levels
        nearest_sup = structure.support_levels[0].price if structure.support_levels else latest_c - (atr * 1.5)
        nearest_res = structure.resistance_levels[0].price if structure.resistance_levels else latest_c + (atr * 2.0)

        entry_price = round(latest_c, 2)
        sl_price = round(min(nearest_sup - (atr * 0.5), entry_price - (atr * 1.0)), 2)
        risk_per_share = max(entry_price - sl_price, 2.0)

        t1_price = round(entry_price + (risk_per_share * 2.0), 2)
        t2_price = round(entry_price + (risk_per_share * 3.2), 2)
        t3_price = round(entry_price + (risk_per_share * 4.5), 2)

        rr_ratio = (t1_price - entry_price) / risk_per_share
        conf_label = "High" if total_score >= 75 else "Medium"

        # Position Sizing based on Account Risk (1% of capital)
        risk_budget = account_size * (risk_pct / 100.0)
        suggested_shares = max(10, int(risk_budget // risk_per_share))

        # Chart Annotations
        ann = ChartAnnotations(
            symbol=symbol,
            timeframe=timeframe,
            support_lines=[ChartAnnotationLine(price=s.price, label=f"Support: NPR {s.price:.1f}", color="#10b981") for s in structure.support_levels],
            resistance_lines=[ChartAnnotationLine(price=r.price, label=f"Resistance: NPR {r.price:.1f}", color="#ef4444") for r in structure.resistance_levels],
            entry_line=ChartAnnotationLine(price=entry_price, label=f"ENTRY @ {entry_price:.2f}", color="#06b6d4"),
            stop_loss_line=ChartAnnotationLine(price=sl_price, label=f"STOP LOSS @ {sl_price:.2f}", color="#f43f5e"),
            target_lines=[
                ChartAnnotationLine(price=t1_price, label=f"TARGET 1 @ {t1_price:.2f} (1:2 R:R)", color="#10b981"),
                ChartAnnotationLine(price=t2_price, label=f"TARGET 2 @ {t2_price:.2f} (1:3.2 R:R)", color="#34d399"),
                ChartAnnotationLine(price=t3_price, label=f"TARGET 3 @ {t3_price:.2f}", color="#6ee7b7"),
            ],
            zones=[ChartZone(top=z.top_price, bottom=z.bottom_price, type=z.zone_type, label=z.label) for z in structure.supply_demand_zones],
            fibonacci_levels=[
                {
                    "ratio": f.get("ratio", 0.0) if isinstance(f, dict) else getattr(f, "ratio", 0.0),
                    "price": f.get("price", 0.0) if isinstance(f, dict) else getattr(f, "price", 0.0),
                    "label": f.get("label", "") if isinstance(f, dict) else getattr(f, "label", ""),
                }
                for f in structure.fibonacci_levels
            ],
            patterns=[ChartPatternBadge(candle_index=p.candle_index, pattern=p.name, direction=p.direction, price=p.price) for p in recent_patterns],
        )

        proposal = TradeProposal(
            symbol=symbol,
            market=market,
            direction=direction,
            market_structure=structure.structure_type,
            entry_price=entry_price,
            entry_zone=f"{entry_price - 2:.1f} - {entry_price:.1f}",
            stop_loss=sl_price,
            target_1=t1_price,
            target_2=t2_price,
            target_3=t3_price,
            risk_reward=f"1:{rr_ratio:.1f}",
            confidence=conf_label,
            confidence_score=float(total_score),
            estimated_risk_npr=round(risk_per_share * suggested_shares, 2),
            suggested_shares=suggested_shares,
            reasons=reasons,
        )

        # Beginner explanation
        if language == "ne":
            beginner_exp = (
                f"📈 **{symbol} ट्रेड अवसर**\n\n"
                f"- **दिशा**: {direction} (खरिद)\n"
                f"- **प्रवेश मूल्य (Entry)**: NPR {entry_price:.2f}\n"
                f"- **Stop Loss**: NPR {sl_price:.2f} (पुँजी सुरक्षाको लागि)\n"
                f"- **Target 1**: NPR {t1_price:.2f}\n"
                f"- **जोखिम र नाफा (R:R)**: 1:{rr_ratio:.1f}\n\n"
                f"💡 *{reasons[0] if reasons else 'राम्रो बजार संरचना'} देखिएको छ।*"
            )
        else:
            beginner_exp = (
                f"📈 **{symbol} Trade Setup Found**\n\n"
                f"- **Direction**: {direction} (Long)\n"
                f"- **Entry Price**: NPR {entry_price:.2f}\n"
                f"- **Stop Loss**: NPR {sl_price:.2f}\n"
                f"- **Target 1**: NPR {t1_price:.2f}\n"
                f"- **Target 2**: NPR {t2_price:.2f}\n"
                f"- **Risk / Reward**: 1:{rr_ratio:.1f}\n\n"
                f"💡 *Key reason: {reasons[0] if reasons else 'Bullish structure'} supported by volume.*"
            )

        # Pro analysis
        pro_exp = (
            f"🎯 **Institutional Setup Matrix — {symbol} ({timeframe.upper()})**\n\n"
            f"| Metric | Level / Value |\n|---|---|\n"
            f"| **Market Structure** | `{structure.structure_type}` |\n"
            f"| **Regime** | `{structure.regime}` |\n"
            f"| **Entry Trigger** | NPR {entry_price:.2f} |\n"
            f"| **Invalidation (SL)** | NPR {sl_price:.2f} |\n"
            f"| **Target 1 (1:2 R:R)** | NPR {t1_price:.2f} |\n"
            f"| **Target 2 (1:3.2 R:R)** | NPR {t2_price:.2f} |\n"
            f"| **RSI (14)** | {structure.rsi_14} ({structure.rsi_signal}) |\n"
            f"| **Volume Ratio** | {structure.volume_ratio}x relative volume |\n\n"
            f"**Confluence Factors:**\n" + "\n".join([f"• {r}" for r in reasons])
        )

        return SetupEvaluation(
            has_setup=True,
            setup=proposal,
            annotations=ann,
            patterns=patterns,
            structure=structure,
            beginner_explanation=beginner_exp,
            pro_analysis=pro_exp,
        )
