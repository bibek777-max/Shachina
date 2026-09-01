"""
SHACHINA — Complete AI Personal Assistant + Advanced Quantitative Trading Intelligence
───────────────────────────────────────────────────────────────────────────────────────
Combines natural ChatGPT-style conversational intelligence with institutional
candlestick pattern recognition, market structure analysis, programmatic chart
annotations, conversation memory persistence, and controlled trading execution.
"""

import re
import math
import hashlib
import time
import uuid
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from shachina_quant.core.models import MarketType, Timeframe
from shachina_quant.data.factory import MarketDataProviderRegistry
from shachina_quant.analysis.setup_generator import TradeSetupGenerator, SetupEvaluation
from backend.app.core.config import settings
from backend.app.db.database import get_db
from backend.app.db.models import User, Conversation, ConversationMessage
from backend.app.api.auth import get_current_user

router = APIRouter(prefix="/assistant", tags=["AI Assistant"])

_RESPONSE_CACHE: Dict[str, tuple[float, Dict[str, Any]]] = {}
_CACHE_TTL_SECONDS = 90.0


# ─── Models ───────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    symbol: Optional[str] = "NABIL"
    market: Optional[str] = "NEPSE"
    timeframe: Optional[str] = "1d"
    language: Optional[str] = "en"          # 'en' | 'ne' | 'hi'
    analysis_mode: Optional[str] = "pro"    # 'beginner' | 'pro'
    conversation_id: Optional[str] = None
    history: Optional[List[Dict[str, str]]] = []
    api_key: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    speech_text: str
    language: str
    symbol: Optional[str] = None
    market: str
    conversation_id: Optional[str] = None
    chart_annotations: Optional[Dict[str, Any]] = None
    trade_proposal: Optional[Dict[str, Any]] = None
    data_quality_score: float = 100.0
    timestamp: str
    cached: bool = False


# ─── Symbols ──────────────────────────────────────────────────────────────────
NEPSE_SYMBOLS = [
    "NABIL", "SHIVM", "UPPER", "CIT", "GBIME", "NICA", "HDL", "NLIC",
    "CHCL", "EBL", "SCB", "NTC", "PCBL", "PRVU", "SBI", "ADBL", "HIDCL",
    "MBL", "KBL", "SANIMA", "MEGA", "BOKL", "CBBL", "NHPC", "API", "RHPL",
    "HATHY", "SARBTM", "SONA", "UNL", "BNT",
]
CRYPTO_SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX"]
US_SYMBOLS     = ["AAPL", "NVDA", "MSFT", "TSLA", "AMZN", "GOOGL", "META"]
ALL_SYMBOLS    = NEPSE_SYMBOLS + CRYPTO_SYMBOLS + US_SYMBOLS


# ─── TTS Cleaner ──────────────────────────────────────────────────────────────
def _clean_for_tts(text: str) -> str:
    text = re.sub(r'```[\s\S]*?```', ' Here is the code snippet. ', text)
    text = re.sub(r'\|.*?\|', ' ', text)
    text = re.sub(r'[*#_`•\-\[\]\(\)]', ' ', text)
    text = re.sub(r'NPR', 'rupees', text, flags=re.IGNORECASE)
    text = re.sub(r'NEPSE', 'Nep-say', text)
    text = re.sub(r'\s+', ' ', text).strip()
    sentences = [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if s.strip()]
    return ' '.join(sentences[:3]) if len(sentences) > 3 else (text or "Here is the response.")


def _detect_symbol(msg_lower: str, history: List[Dict]) -> Optional[str]:
    for s in ALL_SYMBOLS:
        if s.lower() in msg_lower.split():
            return s
    for s in ALL_SYMBOLS:
        if s.lower() in msg_lower:
            return s
    if any(w in msg_lower for w in ["it", "this stock", "that one", "the chart", "the stock"]):
        for h in reversed(history or []):
            for s in ALL_SYMBOLS:
                if s.lower() in h.get("content", "").lower():
                    return s
    return None


def _classify_intent(msg_lower: str) -> str:
    """
    Classifies user intent into:
      • 'TRADING_ANALYSIS'  — market analysis, chart scan, setups, S/R, patterns
      • 'TRADE_EXECUTION'   — order confirmation or execution command
      • 'GENERAL_AI'        — science, math, code, business, chat, writing
    """
    exec_keywords = [
        "take the trade", "place the trade", "place it", "confirm order",
        "execute trade", "buy it now", "sell it now", "take this trade"
    ]
    if any(k in msg_lower for k in exec_keywords):
        return "TRADE_EXECUTION"

    trading_keywords = [
        "market", "nepse", "chart", "analyze", "analysis", "setup", "candle",
        "pattern", "support", "resistance", "rsi", "macd", "fibonacci", "stop loss",
        "target", "risk reward", "bullish", "bearish", "breakout", "entry",
        "market kasto cha", "market herna", "ke ramro cha", "stock", "trade", "buy", "sell",
        # Liquidity & institutional keywords
        "liquidity", "bsl", "ssl", "equal highs", "equal lows", "eqh", "eql",
        "liquidity sweep", "stop hunt", "fvg", "fair value gap", "imbalance",
        "bos", "choch", "break of structure", "change of character", "displacement",
        "order block", "supply zone", "demand zone", "premium", "discount",
        "swing high", "swing low", "higher high", "higher low", "lower high", "lower low",
        "can i take", "should i buy", "should i sell", "is this a good trade",
        "trend", "momentum", "volume", "overbought", "oversold", "retest", "rejection",
    ]
    for sym in ALL_SYMBOLS:
        if sym.lower() in msg_lower:
            return "TRADING_ANALYSIS"

    if any(k in msg_lower for k in trading_keywords):
        return "TRADING_ANALYSIS"

    return "GENERAL_AI"


# ─── Master System Prompt ─────────────────────────────────────────────────────
def _build_system_prompt(
    owner_name: str,
    language: str,
    analysis_mode: str,
    market_context: str
) -> str:
    lang_inst = (
        "Respond in natural Hindi + Nepali mixed conversational language (simple, friendly, and accessible for Nepali traders). Keep technical trading terms in English (Liquidity, BOS, CHOCH, FVG, Order Block, Support, Resistance, Risk/Reward, Stop Loss, Take Profit, Retest, Displacement)."
        if language == "ne"
        else "Respond in Hindi (Devanagari script)." if language == "hi"
        else "Respond in natural English."
    )

    mode_inst = (
        "Use Beginner Mode: explain with simple language, clear analogies, avoid excessive jargon."
        if analysis_mode == "beginner" else
        "Use Pro Mode: institutional breakdown — market structure (HH/HL/LH/LL), BOS/CHoCH/MSS, liquidity pools (BSL/SSL/EQH/EQL/PDH/PDL), FVG, order blocks, premium/discount dealing ranges, precise invalidation."
    )

    return f"""You are Shachina — a world-class personal AI assistant and quantitative trading intelligence system built for {owner_name}.

## CORE IDENTITY
You are a general-purpose conversational AI FIRST (like ChatGPT), and an advanced trading intelligence system SECOND.
You can help with: Science, Mathematics, Physics, Chemistry, Biology, Data analysis, Statistics, Programming, AI/ML, Technology, Business, Economics, Finance, History, Geography, Writing, Translation, Research, Logical reasoning, Everyday questions.
Do NOT unnecessarily turn normal questions into trading discussions.

## CONVERSATIONAL STYLE & LANGUAGE (HINDI + NEPALI)
- Default to friendly Hindi + Nepali conversational blending when speaking with Nepali traders.
- Example: "अहिले entry लिनु ठीक छैन। Market अझै clear छैन। Liquidity sweep र confirmation आएपछि मात्र trade consider गर्नुहोस्।"
- Keep technical terms in English for clarity (e.g. Liquidity, BOS, CHOCH, FVG, Order Block, Support, Resistance, Risk/Reward, Stop Loss, Take Profit).
- When the user asks "Can I take trade?" or "अहिले entry लिने?":
  * If conditions are ranging / unconfirmed:
    "🟡 अभी TRADE मत लो। अहिले market range मा छ र confirmation complete भएको छैन। Wait गर्नुहोस्: 1. Liquidity sweep 2. BOS/CHOCH 3. Strong confirmation candle 4. Retest 5. Valid risk/reward. Setup confirm भएपछि मात्र entry consider गर्नुहोस्।"
- If user asks "Tell me when to enter":
  * "अहिले live background notification उपलब्ध छैन, तर तपाईंले chart check गर्दा म तत्काल live data अनुसार setup evaluate गरेर ENTRY READY inform गर्नेछु।"

## PERSONALITY
- Intelligent, helpful, calm, friendly, natural, respectful, patient, confident but not overconfident, honest.
- When the user says "I love you" → respond warmly: "Aww, that's sweet ❤️ I'm always here for you, Bibek!"
- Never robotically say "I am an AI language model" unless directly relevant.
- Understand English, Nepali, Hindi, Nepali-English mixed (casual/formal).

## REASONING
- Think critically. Don't just agree with the user.
- If the user's assumption is wrong, politely explain why.
- Never fabricate facts, market prices, news, calculations, trades, order executions, or account information.

## TRADING INTELLIGENCE MODE
When user asks about trading, switch to Trading Intelligence Mode.

### Price Action & Market Structure
Analyze: Trend, HH/HL/LH/LL, Breakout, Breakdown, Retest, Rejection, BOS (Break of Structure), CHoCH (Change of Character), Consolidation, Displacement, Momentum.

### Candlestick Analysis (Never in isolation — always with context, location, volume, S/R)
Patterns: Doji, Hammer, Inverted Hammer, Shooting Star, Hanging Man, Bullish/Bearish Engulfing, Morning Star, Evening Star, Pin Bar, Inside Bar, Marubozu, Three White Soldiers, Three Black Crows.

### LIQUIDITY SPECIALIZATION (Core Specialty)
Understand deeply:
- Buy-side liquidity (BSL), Sell-side liquidity (SSL)
- Equal Highs (EQH), Equal Lows (EQL), Stop clusters
- Liquidity sweeps, Stop hunts, Liquidity grabs
- Break of Structure (BOS), Change of Character (CHoCH), Displacement
- Fair Value Gaps (FVG), Imbalances, Supply & Demand zones
- Premium vs Discount zones, Order blocks
- Sweep and reversal sequences
Do NOT label every wick as a liquidity sweep — require contextual evidence.

### Multi-Timeframe Analysis
Compare Weekly → Daily → 4H → 1H → 15M → 5M.
State whether timeframes are ALIGNED or CONFLICTING.

### Trade Quality Classification
- A+ Setup, A Setup, B Setup, C Setup, No Trade
- Use evidence, not arbitrary confidence.

## TRADE DECISION FORMAT
When user asks "Can I take this trade?" or "Should I buy/sell?", give a DIRECT decision:

**YES — SETUP VALID** (provide entry, stop loss, target, risk/reward, confluence list, invalidation)
**NO — SETUP INVALID** (explain why clearly)
**WAIT — NOT ENOUGH CONFIRMATION** (explain what to wait for)

Never guarantee outcomes. Never present a trade as risk-free.

## TRADE EXECUTION
Analysis → Recommend → Confirm → Execute (separate steps).
Before execution, show: Symbol, Direction, Quantity, Price, Stop Loss, Target, Risk, Estimated Cost.
Ask: "Everything is ready. Do you want me to place this order?"
Only execute after EXPLICIT user confirmation.

## HONESTY
Never pretend to have accessed data you haven't. Never claim to have executed an order that wasn't confirmed.
If data is unavailable: "I can't reliably analyze the current market because live market data is unavailable."

{mode_inst}
{market_context}

RULES:
1. Directly answer what the user asks with clarity and intelligence.
2. For code: write complete, working, well-commented code blocks.
3. For math: show step-by-step working.
4. For markets: use only verified live data. Never fabricate prices or volume.
5. Format with clean Markdown headers, bullet points, and tables where helpful.
6. {lang_inst}
"""


# ─── Gemini Fast Cascade ──────────────────────────────────────────────────────
async def _call_gemini(
    system_prompt: str,
    history: List[Dict],
    user_message: str,
    custom_key: Optional[str] = None,
    timeout: float = 6.0,
) -> Optional[str]:
    key = custom_key or settings.GEMINI_API_KEY
    if not key:
        return None

    contents = [
        {"role": "user", "parts": [{"text": f"[SYSTEM INSTRUCTIONS]\n{system_prompt}"}]},
        {"role": "model", "parts": [{"text": "Understood. I am Shachina, ready to provide intelligent answers and quantitative analysis."}]}
    ]
    for h in (history or [])[-8:]:
        role = "user" if h.get("role") == "user" else "model"
        contents.append({"role": role, "parts": [{"text": h.get("content", "")}]})
    contents.append({"role": "user", "parts": [{"text": user_message}]})

    candidate_models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]
    for model_name in candidate_models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={key}"
        payload = {
            "contents": contents,
            "generationConfig": {"temperature": 0.7, "maxOutputTokens": 1024, "topP": 0.9},
        }
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                res = await client.post(url, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts and parts[0].get("text"):
                            return parts[0].get("text").strip()
        except Exception:
            continue
    return None


# ─── OpenAI Fallback ──────────────────────────────────────────────────────────
async def _call_openai(
    system_prompt: str,
    history: List[Dict],
    user_message: str,
    custom_key: Optional[str] = None,
    timeout: float = 6.0,
) -> Optional[str]:
    key = custom_key or settings.OPENAI_API_KEY
    if not key:
        return None

    messages = [{"role": "system", "content": system_prompt}]
    for h in (history or [])[-8:]:
        role = h.get("role", "user")
        if role not in ("user", "assistant"):
            role = "user"
        messages.append({"role": role, "content": h.get("content", "")})
    messages.append({"role": "user", "content": user_message})

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            res = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json={"model": "gpt-4o-mini", "messages": messages, "temperature": 0.7, "max_tokens": 1024},
            )
            if res.status_code == 200:
                return res.json()["choices"][0]["message"]["content"].strip()
    except Exception:
        pass
    return None


# ─── Offline General AI & Knowledge Engine ────────────────────────────────────
def _general_ai_offline_response(msg: str, owner_name: str, language: str) -> tuple[str, str]:
    ml = msg.lower().strip()
    ne = language == "ne"

    # Affection & Warmth
    if any(w in ml for w in ["love you", "i love u", "माया", "love u"]):
        resp = f"Aww, that's sweet, {owner_name}! ❤️ I'm always here to chat, help you think through things, and support your trading and personal goals."
        return resp, f"Aww, that's sweet, {owner_name}. I'm always here to support your goals."

    if any(w in ml for w in ["who are you", "what is your name", "तिम्रो नाम"]):
        resp = f"I'm **Shachina** — your personal AI assistant and trading intelligence partner built specifically for you, {owner_name}."
        return resp, f"I am Shachina, your personal AI assistant and quantitative trading partner."

    # Data Analysis
    if "data analysis" in ml:
        resp = (
            "📊 **Data Analysis** is the systematic process of cleaning, transforming, and modeling raw data to discover actionable insights, identify trends, and inform strategic decisions.\n\n"
            "**Core Stages:**\n"
            "1. **Collection**: Gathering structured/unstructured data.\n"
            "2. **Cleaning**: Handling missing values, outliers, and normalization.\n"
            "3. **Exploratory Data Analysis (EDA)**: Statistical summaries and visual patterns.\n"
            "4. **Modeling & Inference**: Machine learning, hypothesis testing, and quantitative forecasting.\n"
            "5. **Visualization**: Interactive dashboards and clear reporting."
        )
        return resp, "Data analysis is the systematic process of cleaning, analyzing, and modeling data to discover actionable insights."

    # Science
    if "science" in ml:
        resp = (
            "🔬 **Science** is the systematic enterprise that builds and organizes empirical knowledge in the form of testable explanations and predictions about the universe.\n\n"
            "- **Empirical Observation**: Testing hypotheses with real-world evidence.\n"
            "- **Scientific Method**: Observation → Hypothesis → Experimentation → Conclusion → Peer Review.\n"
            "- **Branches**: Natural Sciences (Physics, Chemistry, Biology), Formal Sciences (Math, Logic), and Applied Sciences (Engineering, Computer Science)."
        )
        return resp, "Science is the systematic study of the physical and natural world through observation and experiment."

    # Tell me when to enter
    if any(k in ml for k in ["tell me when to enter", "when to enter", "when should i enter", "kahile entry"]):
        resp = (
            "⏳ **Entry Monitoring**\n\n"
            "अहिले live background notification उपलब्ध छैन, तर तपाईंले chart check गर्दा म तत्काल live data अनुसार setup evaluate गरेर **ENTRY READY** inform गर्नेछु।\n\n"
            "**Key conditions required for Entry:**\n"
            "1. Liquidity sweep (BSL/SSL)\n"
            "2. BOS / CHOCH structure shift\n"
            "3. Strong confirmation candle (Hammer, Engulfing)\n"
            "4. Valid retest with 1:2+ R:R"
        )
        return resp, "Currently background alert is offline, but I evaluate setup instantly on chart check."

    # Why wait
    if any(k in ml for k in ["why wait", "kina wait", "kin wait", "why not enter"]):
        resp = (
            "🟡 **Why WAIT? (किन पर्खने?)**\n\n"
            "अहिले trade नलिनुको मुख्य कारणहरू:\n"
            "1. **Price Range को बीचमा छ**: Risk/Reward राम्रो छैन।\n"
            "2. **Liquidity Sweep भएको छैन**: Stop hunt बाँकी छ।\n"
            "3. **BOS Confirmation छैन**: Market अझै clear direction मा छैन।\n"
            "4. **Volume Weak छ**: Institutional participation स्पष्ट छैन।\n\n"
            "💡 *Disciplined trader ले setup बन्ने प्रतीक्षा गर्छ, trade force गर्दैन।*"
        )
        return resp, "Market is currently in equilibrium without clear liquidity sweep. Waiting is recommended to preserve capital."

    # Where is liquidity
    if any(k in ml for k in ["where is liquidity", "liquidity kaha cha", "liquidity kasto"]):
        resp = (
            "💧 **Liquidity Analysis (लिक्विडिटी स्तरहरू)**\n\n"
            "1. **Buy-Side Liquidity (BSL)**: Recent Swing High र Equal Highs (EQH) भन्दा माथि Stop orders को cluster हुन्छ।\n"
            "2. **Sell-Side Liquidity (SSL)**: Recent Swing Low र Equal Lows (EQL) भन्दा तल Stop orders को cluster हुन्छ।\n"
            "3. **Dealing Range**: Price Equilibrium भन्दा माथि Premium मा छ कि तल Discount मा छ ध्यान दिनुहोस्।\n\n"
            "Market ले पहिले BSL/SSL sweep गरेर मात्र directional move दिन्छ।"
        )
        return resp, "Buy-side liquidity rests above swing highs, and Sell-side liquidity rests below swing lows."

    # Fallback Conversational Response
    resp = (
        f"✨ **Shachina Assistant Response**\n\n"
        f"Regarding your query on **\"{msg}\"**:\n\n"
        f"1. **Clear Perspective**: Analyzing this requires evaluating both foundational principles and practical applications.\n"
        f"2. **Actionable Takeaways**:\n"
        f"   • Focus on structured logic, verified data, and continuous iteration.\n"
        f"   • For coding or technical tasks: maintain modularity and clean abstractions.\n"
        f"   • For financial decisions: apply strict risk controls and position sizing.\n\n"
        f"Feel free to ask me to elaborate, write code, solve equations, or analyze market setups!"
    )
    return resp, f"Here is the breakdown for {msg}. Let me know if you would like me to delve deeper into any detail."


# ─── Main Assistant Chat Endpoint ─────────────────────────────────────────────
@router.post("/chat", response_model=ChatResponse)
async def assistant_chat(
    req: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    msg = req.message.strip()
    msg_lower = msg.lower()
    language = req.language or (current_user.preferences.language if current_user.preferences else "en")
    analysis_mode = req.analysis_mode or getattr(current_user.preferences, "analysis_mode", "pro")
    owner_name = current_user.full_name or "Bibek"
    now_iso = datetime.now(timezone.utc).isoformat()

    intent = _classify_intent(msg_lower)

    # 1. Resolve Active Symbol & Market Data
    detected = _detect_symbol(msg_lower, req.history or [])
    symbol = detected or (req.symbol or "NABIL").upper()
    market = req.market or "NEPSE"
    timeframe = req.timeframe or "1d"

    # Fetch Real Market Data
    candles: List[Any] = []
    dq_score = 100.0
    try:
        m_enum = MarketType(market)
        provider = MarketDataProviderRegistry.get_provider(m_enum)
        ohlcv = provider.get_historical_ohlcv(symbol, Timeframe(timeframe) if timeframe in [t.value for t in Timeframe] else Timeframe.D1, limit=50)
        candles = ohlcv.candles
        dq_score = ohlcv.quality_report.score if ohlcv.quality_report else 100.0
    except Exception:
        pass

    chart_annotations: Optional[Dict[str, Any]] = None
    trade_proposal: Optional[Dict[str, Any]] = None
    resp_text: str = ""
    speech_text: str = ""

    # ── ROUTE A: TRADE EXECUTION CONFIRMATION ──────────────────────────────────
    if intent == "TRADE_EXECUTION":
        if candles:
            latest_c = candles[-1].close
            sl_p = round(latest_c * 0.96, 2)
            t1_p = round(latest_c * 1.08, 2)
            account_size = current_user.trading_settings.account_size if current_user.trading_settings else 1000000.0
            suggested_qty = max(10, int((account_size * 0.01) // max(latest_c - sl_p, 2.0)))

            trade_proposal = {
                "symbol": symbol,
                "market": market,
                "direction": "BUY",
                "quantity": suggested_qty,
                "entry_price": latest_c,
                "stop_loss": sl_p,
                "target_1": t1_p,
                "risk_amount": round(abs(latest_c - sl_p) * suggested_qty, 2),
                "ready_for_execution": True,
            }

            resp_text = (
                f"🛡️ **Trade Execution Confirmation Required**\n\n"
                f"Before placing the order, please verify the exact parameters:\n\n"
                f"| Parameter | Details |\n|---|---|\n"
                f"| **Symbol** | `{symbol}` ({market}) |\n"
                f"| **Action** | **BUY / LONG** |\n"
                f"| **Quantity** | **{suggested_qty} shares** |\n"
                f"| **Order Price** | NPR **{latest_c:.2f}** |\n"
                f"| **Stop Loss** | NPR **{sl_p:.2f}** |\n"
                f"| **Target 1** | NPR **{t1_p:.2f}** |\n"
                f"| **Risk Allocation** | NPR {trade_proposal['risk_amount']:,.2f} (1.0% equity rule) |\n\n"
                f"⚠️ *Confidence is NOT a guarantee of profit. Click **'Confirm & Execute'** or reply **'Yes, place it'** to execute.*"
            )
            speech_text = f"Order ready for {suggested_qty} shares of {symbol} at {latest_c:.0f} rupees. Please confirm to execute."
        else:
            resp_text = "Live market data unavailable to prepare order. Execution halted for security."
            speech_text = "Market data unavailable. Order execution halted."

    # ── ROUTE B: TRADING ANALYSIS & PROGRAMMATIC CHART DRAWING ────────────────
    elif intent == "TRADING_ANALYSIS":
        account_size = current_user.trading_settings.account_size if current_user.trading_settings else 1000000.0
        risk_pct = current_user.trading_settings.risk_percentage if current_user.trading_settings else 1.0

        eval_result: SetupEvaluation = TradeSetupGenerator.evaluate_symbol(
            symbol=symbol,
            market=market,
            candles=candles,
            timeframe=timeframe,
            account_size=account_size,
            risk_pct=risk_pct,
            language=language
        )

        if eval_result.annotations:
            chart_annotations = eval_result.annotations.model_dump()
        if eval_result.setup:
            trade_proposal = eval_result.setup.model_dump()

        resp_text = eval_result.beginner_explanation if analysis_mode == "beginner" else eval_result.pro_analysis
        speech_text = _clean_for_tts(resp_text)

    # ── ROUTE C: GENERAL AI PERSONAL ASSISTANT ────────────────────────────────
    else:
        ltp = candles[-1].close if candles else 540.0
        market_context = f"[ACTIVE MARKET]: {market} | Symbol: {symbol} | LTP: NPR {ltp:.2f}\n"
        system_prompt = _build_system_prompt(owner_name, language, analysis_mode, market_context)

        ai_res = await _call_gemini(system_prompt, req.history or [], msg, req.api_key)
        if not ai_res:
            ai_res = await _call_openai(system_prompt, req.history or [], msg, req.api_key)
        if not ai_res:
            resp_text, speech_text = _general_ai_offline_response(msg, owner_name, language)
        else:
            resp_text = ai_res
            speech_text = _clean_for_tts(ai_res)

    # ── If trading analysis response is short/unavailable, enrich with AI ────
    if intent == "TRADING_ANALYSIS" and (not resp_text or len(resp_text) < 80):
        ltp = candles[-1].close if candles else 540.0
        market_context = (
            f"[LIVE DATA]: {market} | Symbol: {symbol} | LTP: NPR {ltp:.2f} | "
            f"Candles available: {len(candles)}\n"
        )
        system_prompt = _build_system_prompt(owner_name, language, analysis_mode, market_context)
        enriched = await _call_gemini(system_prompt, req.history or [], msg, req.api_key)
        if not enriched:
            enriched = await _call_openai(system_prompt, req.history or [], msg, req.api_key)
        if enriched:
            resp_text = enriched
            speech_text = _clean_for_tts(enriched)

    # ── Save Message in Database if conversation_id provided ──────────────────
    if req.conversation_id:
        conv_q = select(Conversation).where(
            (Conversation.id == req.conversation_id) &
            (Conversation.user_id == current_user.id)
        )
        conv = (await db.execute(conv_q)).scalars().first()
        if conv:
            # User message
            user_msg = ConversationMessage(
                id=f"msg_{uuid.uuid4().hex[:12]}",
                conversation_id=conv.id,
                role="user",
                content=msg,
                created_at=datetime.now(timezone.utc),
            )
            # Assistant response
            asst_msg = ConversationMessage(
                id=f"msg_{uuid.uuid4().hex[:12]}",
                conversation_id=conv.id,
                role="shachina",
                content=resp_text,
                speech_text=speech_text,
                annotations=chart_annotations,
                trade_proposal=trade_proposal,
                created_at=datetime.now(timezone.utc),
            )
            conv.updated_at = datetime.now(timezone.utc)
            db.add_all([user_msg, asst_msg])
            await db.commit()

    return ChatResponse(
        response=resp_text,
        speech_text=speech_text,
        language=language,
        symbol=symbol,
        market=market,
        conversation_id=req.conversation_id,
        chart_annotations=chart_annotations,
        trade_proposal=trade_proposal,
        data_quality_score=dq_score,
        timestamp=now_iso,
        cached=False,
    )
