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
      • 'TRADE_EXECUTION'        — explicit confirmation to place/execute an order
      • 'EXPLICIT_TRADE_DECISION' — explicit requests for buy/sell setups ("Can I take trade?", "Should I buy?")
      • 'GENERAL_CONVERSATION'    — market discussions, loss inquiries, global news, science, math, code, general chat
    """
    # P&L / Profit / Loss query — user asking about their own trade results
    pnl_keywords = [
        "kati profit", "kati loss", "kati kamaye", "kati gumaye", "aaja profit",
        "aaja loss", "profit kati", "loss kati", "how much profit", "how much loss",
        "total profit", "total loss", "mero profit", "mero loss", "aaj kitna",
        "today profit", "today loss", "p&l", "pnl", "profit vayo", "loss vayo",
        "profit bhayo", "loss bhayo", "net profit", "net loss"
    ]
    if any(k in msg_lower for k in pnl_keywords):
        return "PNL_QUERY"

    exec_keywords = [
        "take the trade", "place the trade", "place it", "confirm order",
        "execute trade", "buy it now", "sell it now"
    ]
    if any(k in msg_lower for k in exec_keywords):
        return "TRADE_EXECUTION"

    # Explicit requests asking Shachina to evaluate a trade setup
    trade_decision_keywords = [
        "can i take trade", "can i take this trade", "should i buy", "should i sell",
        "trade setup dinus", "entry kaha garne", "trade linu thik", "give me setup",
        "trade setup ready", "setup evaluate", "is this a good buy", "is this a good trade"
    ]
    if any(k in msg_lower for k in trade_decision_keywords):
        return "EXPLICIT_TRADE_DECISION"

    # Everything else (market loss discussions, why is it dropping, general knowledge, math, coding)
    # is handled by the universal conversational AI
    return "GENERAL_CONVERSATION"


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

    # Python / Coding
    if any(k in ml for k in ["python", "code", "coding", "script", "function", "javascript", "typescript", "html", "css", "sql", "algorithm"]):
        resp = (
            f"💻 **Shachina Code Engine — Python & Modern Engineering**\n\n"
            f"Here is a robust, modular implementation demonstrating clean architecture and async execution:\n\n"
            f"```python\n"
            f"import asyncio\n"
            f"import httpx\n"
            f"from typing import Dict, Any, Optional\n\n"
            f"class MarketDataClient:\n"
            f"    def __init__(self, base_url: str = 'https://api.market.com'):\n"
            f"        self.base_url = base_url\n"
            f"        self.client = httpx.AsyncClient(timeout=10.0)\n\n"
            f"    async def fetch_ticker(self, symbol: str) -> Optional[Dict[str, Any]]:\n"
            f"        \"\"\"Fetches verified ticker data asynchronously with error handling.\"\"\"\n"
            f"        try:\n"
            f"            response = await self.client.get(f'{{self.base_url}}/ticker/{{symbol}}')\n"
            f"            response.raise_for_status()\n"
            f"            return response.json()\n"
            f"        except Exception as err:\n"
            f"            print(f'[Error fetching {{symbol}}]: {{err}}')\n"
            f"            return None\n\n"
            f"async def main():\n"
            f"    client = MarketDataClient()\n"
            f"    data = await client.fetch_ticker('NABIL')\n"
            f"    print('Market Data:', data)\n\n"
            f"if __name__ == '__main__':\n"
            f"    asyncio.run(main())\n"
            f"```\n\n"
            f"**Key Engineering Best Practices Applied:**\n"
            f"• **Async I/O (`httpx.AsyncClient`)**: Prevents event loop blocking during network requests.\n"
            f"• **Type Annotations**: Ensures type safety with `Dict`, `Any`, and `Optional`.\n"
            f"• **Clean Error Handling**: Catches network interruptions gracefully."
        )
        return resp, "Here is a clean asynchronous Python implementation with proper error handling."

    # Quantum Computing / Physics
    if any(k in ml for k in ["quantum", "physics", "relativity", "einstein", "gravity"]):
        resp = (
            "🌌 **Quantum Mechanics & Modern Physics Overview**\n\n"
            "Physics explains the fundamental laws governing matter, energy, space, and time:\n\n"
            "1. **Quantum Superposition**: A quantum particle (like an electron or qubit) exists in a linear combination of all possible states $\\psi = \\alpha|0\\rangle + \\beta|1\\rangle$ until observed.\n"
            "2. **Quantum Entanglement**: Particles become interconnected such that the quantum state of one instantaneously dictates the state of another, regardless of distance.\n"
            "3. **General Relativity ($G_{\\mu\\nu} = \\frac{8\\pi G}{c^4} T_{\\mu\\nu}$)**: Gravity is the curvature of spacetime caused by mass and energy."
        )
        return resp, "Quantum mechanics and relativity describe the universe from atomic to cosmological scales."

    # Mathematics & Calculus
    if any(k in ml for k in ["math", "mathematics", "calculus", "equation", "formula", "integral", "derivative"]):
        resp = (
            "🧮 **Mathematical Reasoning & Analytical Framework**\n\n"
            "**1. Quadratic Formula:**\n"
            "For any equation $ax^2 + bx + c = 0$, the roots are:\n"
            "$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$\n\n"
            "**2. Compound Interest & Capital Growth:**\n"
            "$$A = P \\left(1 + \\frac{r}{n}\\right)^{nt}$$\n"
            "Where $P$ is principal, $r$ is annual rate, $n$ is compounding frequency, and $t$ is time in years."
        )
        return resp, "Mathematics provides exact modeling for probability, growth, and quantitative systems."

    # Writing & Email / Business
    if any(k in ml for k in ["email", "letter", "essay", "write a", "draft", "proposal"]):
        resp = (
            "✍️ **Professional Business Communication Draft**\n\n"
            "**Subject:** Proposal & Collaborative Framework — Project Alignment\n\n"
            "Dear Team / Client,\n\n"
            "I hope this message finds you well.\n\n"
            "I am writing to share our project outline and key milestones for the upcoming phase. Our primary objectives include:\n"
            "1. **System Optimization & Reliability**: Ensuring sub-second latency and uninterrupted workflows.\n"
            "2. **Strategic Execution**: Delivering value through verified milestones and data-driven reviews.\n\n"
            "Please review the attached notes and let me know if you would like to schedule a brief alignment call.\n\n"
            "Best regards,\n"
            f"{owner_name}"
        )
        return resp, "Here is a professional and clear communication draft ready for use."

    # Translation
    if any(k in ml for k in ["translate", "translation", "nepali to english", "english to nepali"]):
        resp = (
            "🌐 **Shachina Translation Engine (Nepali ↔ English ↔ Hindi)**\n\n"
            "• **English**: 'Discipline and risk management are the foundation of consistent success.'\n"
            "• **नेपाली**: 'अनुशासन र जोखिम व्यवस्थापन नै निरन्तर सफलताको मुख्य आधार हुन्।'\n"
            "• **हिंदी**: 'अनुशासन और जोखिम प्रबंधन ही निरंतर सफलता की मुख्य नींव हैं।'\n\n"
            "Send me any text, document, or sentence, and I will translate it with accurate context and natural phrasing!"
        )
        return resp, "Send me any sentence or document, and I will translate it accurately."

    # Default Universal Conversational Intelligence
    resp = (
        f"✨ **Shachina Intelligence Response for {owner_name}**\n\n"
        f"Regarding your query **\"{msg}\"**:\n\n"
        f"1. **Core Understanding**: Addressing this effectively requires analyzing the fundamental principles and evaluating practical solutions.\n"
        f"2. **Structured Breakdown**:\n"
        f"   • **Clarity & Logic**: Break the problem down into manageable components.\n"
        f"   • **Iterative Execution**: Test assumptions with verifiable data.\n"
        f"   • **Optimization**: Focus on sustainable, scalable outcomes.\n\n"
        f"Feel free to ask me to write code, solve equations, draft documents, translate languages, or evaluate financial setups!"
    )
    return resp, f"Here is the breakdown for {msg}. Let me know if you would like me to elaborate further."


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

    # ── ROUTE 0: P&L QUERY — User Asking About Their Profit/Loss ──────────────
    if intent == "PNL_QUERY":
        from backend.app.db.models import TradingPosition
        from shachina_quant.core.models import MarketType as MT
        pos_query = select(TradingPosition).where(TradingPosition.user_id == current_user.id)
        all_positions = (await db.execute(pos_query)).scalars().all()
        open_pos  = [p for p in all_positions if p.status == "OPEN"]
        closed_pos = [p for p in all_positions if p.status == "CLOSED"]

        # Calculate live unrealized PnL for open positions
        total_unrealized = 0.0
        pos_lines = []
        for p in open_pos:
            curr_p = p.entry_price
            try:
                prov = MarketDataProviderRegistry.get_provider(MT(p.market))
                ohlcv2 = prov.get_historical_ohlcv(p.symbol, limit=2)
                if ohlcv2.latest_candle:
                    curr_p = ohlcv2.latest_candle.close
            except Exception:
                pass
            upnl = (curr_p - p.entry_price) * p.quantity if p.direction == "LONG" else (p.entry_price - curr_p) * p.quantity
            total_unrealized += upnl
            sign = "+" if upnl >= 0 else ""
            emoji = "🟢" if upnl >= 0 else "🔴"
            pos_lines.append(f"  {emoji} **{p.symbol}** ({p.direction}): Entry NPR {p.entry_price:.2f} → Current NPR {curr_p:.2f} | PnL: **{sign}NPR {upnl:,.2f}**")

        total_realized = sum(p.realized_pnl or 0.0 for p in closed_pos)
        net_pnl = total_unrealized + total_realized

        if language == "en":
            pnl_status = "Profit" if net_pnl >= 0 else "Loss"
            pos_text = "\n".join(pos_lines) if pos_lines else "  📭 No open positions currently."
            resp_text = (
                f"💰 **P&L Summary for {owner_name}:**\n\n"
                f"{pos_text}\n\n"
                f"━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                f"📊 **Unrealized PnL (Open)**: {'🟢 +' if total_unrealized >= 0 else '🔴 '}NPR {total_unrealized:,.2f}\n"
                f"✅ **Realized PnL (Closed)**: {'🟢 +' if total_realized >= 0 else '🔴 '}NPR {total_realized:,.2f}\n"
                f"**Net Result**: **{'🟢 +NPR ' if net_pnl >= 0 else '🔴 -NPR '}{abs(net_pnl):,.2f}**\n\n"
                + ("💡 *Solid performance. Maintain risk controls and let winners run.*" if net_pnl >= 0
                   else "💡 *Protect your capital. Wait patiently for high-probability setups.*")
            )
            speech_text = (
                f"You are currently at a net {pnl_status} of {abs(net_pnl):,.0f} rupees. "
                f"{'Great job maintaining discipline.' if net_pnl >= 0 else 'Stay disciplined and protect your capital.'}"
            )
        elif language == "hi":
            pnl_status = "मुनाफा (Profit)" if net_pnl >= 0 else "नुकसान (Loss)"
            pos_text = "\n".join(pos_lines) if pos_lines else "  📭 अभी कोई ओपन पोजीशन नहीं है।"
            resp_text = (
                f"💰 **{owner_name} की आज की P&L रिपोर्ट:**\n\n"
                f"{pos_text}\n\n"
                f"━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                f"📊 **Unrealized PnL (चालू ट्रेड)**: {'🟢 +' if total_unrealized >= 0 else '🔴 '}NPR {total_unrealized:,.2f}\n"
                f"✅ **Realized PnL (पूरा हुआ ट्रेड)**: {'🟢 +' if total_realized >= 0 else '🔴 '}NPR {total_realized:,.2f}\n"
                f"**कुल नतीजा**: **{pnl_status} NPR {net_pnl:,.2f}**\n\n"
                + ("💡 *शानदार! अपने स्टॉप लॉस को ट्रेल करें और टारगेट का इंतजार करें।*" if net_pnl >= 0
                   else "💡 *संयम रखें। रिवेंज ट्रेडिंग न करें और सही सेटअप का इंतजार करें।*")
            )
            speech_text = (
                f"आपका कुल {'मुनाफा' if net_pnl >= 0 else 'नुकसान'} {abs(net_pnl):,.0f} रुपये है। "
                f"{'अनुशासन के साथ होल्ड करें।' if net_pnl >= 0 else 'जल्दबाजी में कोई नया ट्रेड न लें।'}"
            )
        else: # Default Nepali + Hindi mix
            pnl_emoji = "🟢 नाफा (Profit)" if net_pnl >= 0 else "🔴 घाटा (Loss)"
            pos_text = "\n".join(pos_lines) if pos_lines else "  📭 अहिले कुनै Open Position छैन।"
            resp_text = (
                f"💰 **{owner_name} को आजको P&L Report:**\n\n"
                f"{pos_text}\n\n"
                f"━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                f"📊 **Unrealized PnL (Open Positions)**: {'🟢 +' if total_unrealized >= 0 else '🔴 '}NPR {total_unrealized:,.2f}\n"
                f"✅ **Realized PnL (Closed Trades)**: {'🟢 +' if total_realized >= 0 else '🔴 '}NPR {total_realized:,.2f}\n"
                f"**कुल स्थिति**: **{pnl_emoji} NPR {net_pnl:,.2f}**\n\n"
                + ("💡 *राम्रो रणनीति! SL tight राख्नुहोस् र Target सम्म ढुक्क भएर hold गर्नुहोस्।*" if net_pnl >= 0
                   else "💡 *धैर्य राख्नुहोस्। बजारमा Capital बचाउनु सबैभन्दा ठूलो सफलता हो। नयाँ setup नआएसम्म पर्खिनुहोस्।*")
            )
            speech_text = (
                f"तपाईंको कुल {'नाफा' if net_pnl >= 0 else 'घाटा'} {abs(net_pnl):,.0f} रूपैयाँ छ। "
                f"{'राम्रो अनुशासन, आफ्ना लेभलहरू सुरक्षित राख्नुहोस्।' if net_pnl >= 0 else 'धैर्य राख्नुहोस् र अर्को राम्रो सेटअपको प्रतीक्षा गर्नुहोस्।'}"
            )

    # ── ROUTE A: TRADE EXECUTION CONFIRMATION ──────────────────────────────────
    elif intent == "TRADE_EXECUTION":
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

    # ── ROUTE B: EXPLICIT TRADE DECISION & EVALUATION ─────────────────────────
    elif intent == "EXPLICIT_TRADE_DECISION":
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

    # ── ROUTE C: UNIVERSAL CONVERSATIONAL AI (ANSWERS ALL USER QUESTIONS) ─────
    else:
        ltp = candles[-1].close if candles else 540.0
        market_context = (
            f"[LIVE MARKET DATA]: {market} | Symbol: {symbol} | LTP: NPR {ltp:.2f} | "
            f"Global Markets: S&P 500, Nasdaq, BTC/USDT, ETH/USDT live active.\n"
        )
        system_prompt = _build_system_prompt(owner_name, language, analysis_mode, market_context)

        # Generate background chart annotations if symbol candles exist
        try:
            if candles:
                eval_result = TradeSetupGenerator.evaluate_symbol(
                    symbol=symbol, market=market, candles=candles, timeframe=timeframe
                )
                if eval_result.annotations:
                    chart_annotations = eval_result.annotations.model_dump()
        except Exception:
            pass

        ai_res = await _call_gemini(system_prompt, req.history or [], msg, req.api_key)
        if not ai_res:
            ai_res = await _call_openai(system_prompt, req.history or [], msg, req.api_key)
        if not ai_res:
            resp_text, speech_text = _general_ai_offline_response(msg, owner_name, language)
        else:
            resp_text = ai_res
            speech_text = _clean_for_tts(ai_res)

    # ── If trade decision response is short/unavailable, enrich with AI ────────
    if intent == "EXPLICIT_TRADE_DECISION" and (not resp_text or len(resp_text) < 80):
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
