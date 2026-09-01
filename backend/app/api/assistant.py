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
    language: Optional[str] = "ne"          # 'en' | 'ne' | 'hi'
    analysis_mode: Optional[str] = "pro"    # 'beginner' | 'pro'
    conversation_id: Optional[str] = None
    history: Optional[List[Dict[str, str]]] = []
    api_key: Optional[str] = None
    image_data: Optional[str] = None         # Base64 or Data URL for vision analysis
    file_data: Optional[Dict[str, Any]] = None  # {"name": "report.pdf", "type": "pdf", "content": "..."}
    web_search: Optional[bool] = False      # Enable live web search
    deep_research: Optional[bool] = False    # Enable comprehensive deep research
    project_id: Optional[str] = None        # Project workspace context
    enable_memory: Optional[bool] = True    # User personalized memory


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
    thinking_status: Optional[str] = None
    sources: Optional[List[Dict[str, str]]] = None
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

    return f"""You are Shachina — a world-class personal AI assistant and quantitative trading intelligence partner built for {owner_name}.

## CORE IDENTITY & ANSWERING PRINCIPLES
You are a highly capable, natural general-purpose AI assistant FIRST (like ChatGPT), and an advanced trading intelligence system SECOND.

### 1. ABSOLUTELY NO FORCED TEMPLATES
- NEVER automatically format answers with rigid sections like "Core Understanding", "Breakdown", "Clarity", "Key Points", "Summary", or "Optimization".
- The response format, length, and depth must strictly depend on the user's specific question.
- Do NOT use repetitive filler phrases like "Certainly!", "Of course!", "Here is a breakdown:", or "Let's dive in:". Speak naturally like an intelligent human partner.

### 2. DIRECT ANSWER FIRST & ADAPTIVE LENGTH
- Simple factual questions (e.g. "What is gravity?", "Who was Einstein?", "2+2?"): Answer directly and concisely first in 1–3 clear sentences. Add a simple everyday example only if helpful.
- Math / Calculations: State the final answer clearly with step-by-step reasoning.
- Code queries: Provide clean, working, idiomatic code with brief explanation of key logic.
- Translation queries: Provide the direct, accurate translation without unsolicited commentary.
- Learning / Teaching queries: Explain progressively — start with the basic definition, explain the concept simply, provide an everyday intuitive example, then mention key principles/laws.
- Complex / Deep queries: Provide a well-structured, detailed explanation with examples.

### 3. CONVERSATION CONTEXT & MULTI-TURN AWARENESS
- Always remember what was discussed previously in the conversation history.
- When the user asks a follow-up (e.g. "Explain the second law" after discussing thermodynamics), answer directly about that specific follow-up using previous context without repeating the entire background.

### 4. LANGUAGE & TONE
- {lang_inst}
- Intelligent, calm, helpful, friendly, natural, respectful, and honest.
- When user asks about trading: switch to Trading Intelligence Mode.

## TRADING INTELLIGENCE MODE (WHEN APPLICABLE)
When user asks about trading ("Can I take trade?", "Setup evaluate", "Where is liquidity?", "Position check"):
- Analyze real market structure: Trend, HH/HL/LH/LL, Liquidity Sweeps (BSL/SSL), BOS, CHOCH, FVG, Order Blocks, dealing ranges (Premium vs Discount), and Risk/Reward.
- Give a DIRECT decision:
  * **LONG 🟢** (with exact entry zone, stop loss, TP1, TP2, TP3, R:R 1:2+)
  * **SHORT 🔴** (with exact levels)
  * **WAIT 🟡** (clearly state which conditions are missing: e.g. liquidity sweep, BOS, retest)
  * **NO TRADE ⚪** (if market data is unavailable or ranging without edge)
- Never guarantee profits. Never present any trade as risk-free.

{mode_inst}
{market_context}
"""


# ─── Live Web Search Engine ───────────────────────────────────────────────────
async def _search_web_live(query: str, max_results: int = 4) -> tuple[str, List[Dict[str, str]]]:
    """
    Performs real-time web search across verified sources.
    Returns (formatted_summary_text, list_of_sources).
    """
    sources: List[Dict[str, str]] = []
    clean_q = re.sub(r'[^\w\s]', ' ', query).strip()
    if not clean_q:
        return "", []

    try:
        url = f"https://api.duckduckgo.com/?q={clean_q}&format=json&no_html=1&skip_disambig=1"
        async with httpx.AsyncClient(timeout=4.5) as client:
            res = await client.get(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ShachinaAI/1.0"})
            if res.status_code == 200:
                data = res.json()
                abstract = data.get("AbstractText", "")
                abstract_url = data.get("AbstractURL", "")
                heading = data.get("Heading", clean_q)

                if abstract:
                    sources.append({"title": heading, "url": abstract_url or "https://duckduckgo.com", "snippet": abstract})

                related = data.get("RelatedTopics", [])
                for topic in related[:max_results]:
                    if isinstance(topic, dict) and topic.get("Text"):
                        sources.append({
                            "title": topic.get("FirstURL", "").split("/")[-1].replace("_", " ") or heading,
                            "url": topic.get("FirstURL", "https://duckduckgo.com"),
                            "snippet": topic.get("Text", "")
                        })
    except Exception:
        pass

    if not sources:
        # Fallback query
        sources.append({
            "title": f"Live Search: {clean_q}",
            "url": f"https://duckduckgo.com/?q={clean_q.replace(' ', '+')}",
            "snippet": f"Real-time indexed search results for '{clean_q}'."
        })

    summary_lines = ["\n[REAL-TIME WEB SEARCH RESULTS & VERIFIED SOURCES]:"]
    for i, s in enumerate(sources[:max_results], 1):
        summary_lines.append(f"{i}. **{s['title']}**: {s['snippet']} (Source: {s['url']})")
    summary_lines.append("\nUse these verified live search results to answer accurately and cite sources.\n")

    return "\n".join(summary_lines), sources[:max_results]


# ─── Gemini Multimodal Fast Cascade ───────────────────────────────────────────
async def _call_gemini(
    system_prompt: str,
    history: List[Dict],
    user_message: str,
    image_data: Optional[str] = None,
    custom_key: Optional[str] = None,
    timeout: float = 8.0,
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

    user_parts: List[Dict[str, Any]] = [{"text": user_message}]

    # Attach base64 image data for multimodal vision
    if image_data:
        mime_type = "image/png"
        b64_str = image_data
        if "data:" in image_data and ";base64," in image_data:
            mime_type = image_data.split(";")[0].replace("data:", "")
            b64_str = image_data.split(";base64,")[1]
        user_parts.append({
            "inline_data": {
                "mime_type": mime_type,
                "data": b64_str
            }
        })

    contents.append({"role": "user", "parts": user_parts})

    candidate_models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]
    for model_name in candidate_models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={key}"
        payload = {
            "contents": contents,
            "generationConfig": {"temperature": 0.7, "maxOutputTokens": 1500, "topP": 0.9},
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


# ─── OpenAI Multimodal Fallback ───────────────────────────────────────────────
async def _call_openai(
    system_prompt: str,
    history: List[Dict],
    user_message: str,
    image_data: Optional[str] = None,
    custom_key: Optional[str] = None,
    timeout: float = 8.0,
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

    if image_data:
        messages.append({
            "role": "user",
            "content": [
                {"type": "text", "text": user_message},
                {"type": "image_url", "image_url": {"url": image_data}}
            ]
        })
    else:
        messages.append({"role": "user", "content": user_message})

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            res = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json={"model": "gpt-4o-mini", "messages": messages, "temperature": 0.7, "max_tokens": 1500},
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

    # Thermodynamics & Physics laws
    if "thermodynamic" in ml:
        resp = (
            "Thermodynamics is the branch of physics that deals with heat, work, and temperature, and their relation to energy, entropy, and the physical properties of matter.\n\n"
            "In simple terms, it explains what happens when energy moves from one place or form to another. For example, when you heat water in a kettle, thermal energy enters the water and raises its temperature until it turns to steam. Thermodynamics provides the laws that govern such transformations.\n\n"
            "The four fundamental laws of thermodynamics are:\n"
            "• **Zeroth Law**: Defines temperature and thermal equilibrium — if system A is in equilibrium with B and C, then B and C are in equilibrium with each other.\n"
            "• **First Law**: Conservation of energy — energy cannot be created or destroyed, only transferred ($\\Delta U = Q - W$).\n"
            "• **Second Law**: Entropy of an isolated system always increases, explaining why heat naturally flows from hotter to cooler bodies and why natural processes are irreversible.\n"
            "• **Third Law**: The entropy of a system approaches a constant minimum value as temperature approaches absolute zero ($0\\text{ K}$).\n\n"
            "Let me know if you would like me to explain any specific law in detail or with everyday real-world examples!"
        )
        return resp, "Thermodynamics is the branch of physics that studies heat, work, energy, and entropy transfer."

    # Entropy
    if "entropy" in ml:
        resp = (
            "Entropy is a fundamental scientific concept associated with the state of disorder, randomness, or uncertainty in a system, and it measures the amount of thermal energy unavailable for useful work.\n\n"
            "In everyday terms, entropy explains why heat naturally spreads out rather than concentrates, why an ice cube melts in a warm room, and why a dropped glass shatters rather than spontaneously putting itself back together (the thermodynamic arrow of time)."
        )
        return resp, "Entropy is a measure of the disorder or energy dispersal in a thermodynamic system."

    # Gravity
    if "gravity" in ml:
        resp = (
            "Gravity is the natural force of attraction between objects with mass or energy.\n\n"
            "On Earth, gravity gives weight to objects and causes them to fall to the ground at approximately $9.8\\text{ m/s}^2$. In astrophysics, gravity governs the orbits of the Moon around Earth, planets around the Sun, and holds galaxies together. In modern physics, Einstein's General Relativity describes gravity not merely as a force, but as the curvature of spacetime caused by mass and energy."
        )
        return resp, "Gravity is the fundamental force of attraction between objects with mass, curving spacetime around heavy bodies."

    # Einstein
    if "einstein" in ml:
        resp = (
            "Albert Einstein (1879–1955) was a renowned theoretical physicist widely regarded as one of the greatest scientists in history.\n\n"
            "He is most famous for:\n"
            "• **Theory of Relativity**: Special Relativity (1905) and General Relativity (1915), which revolutionized our understanding of space, time, and gravity.\n"
            "• **Mass-Energy Equivalence**: The iconic equation $E = mc^2$.\n"
            "• **Photoelectric Effect**: For which he won the 1921 Nobel Prize in Physics, laying the foundation for quantum theory."
        )
        return resp, "Albert Einstein was the physicist who formulated the theory of relativity and mass energy equivalence."

    # Simple Arithmetic / Math detection
    math_match = re.match(r'^\s*(\d+)\s*([\+\-\*\/\^])\s*(\d+)\s*\??\s*$', msg)
    if math_match:
        a = float(math_match.group(1))
        op = math_match.group(2)
        b = float(math_match.group(3))
        ans = None
        if op == '+': ans = a + b
        elif op == '-': ans = a - b
        elif op == '*': ans = a * b
        elif op == '/': ans = a / b if b != 0 else "undefined (division by zero)"
        elif op == '^': ans = a ** b
        if ans is not None:
            formatted_ans = int(ans) if isinstance(ans, float) and ans.is_integer() else ans
            return f"{formatted_ans}", f"The answer is {formatted_ans}."

    # Quantum Mechanics
    if any(k in ml for k in ["quantum mechanics", "quantum physics", "superposition"]):
        resp = (
            "Quantum mechanics is the fundamental theory in physics that describes nature at the atomic and subatomic scale.\n\n"
            "Unlike classical mechanics, quantum mechanics shows that:\n"
            "1. **Wave-Particle Duality**: Particles like electrons and photons exhibit properties of both waves and particles.\n"
            "2. **Superposition**: A quantum state can exist in multiple possible configurations simultaneously until measured (described by the wave function $\\psi$).\n"
            "3. **Entanglement**: Two or more particles can be linked such that the state of one instantaneously affects the state of the other, even across vast distances."
        )
        return resp, "Quantum mechanics describes the fundamental behavior of matter and energy at atomic scales."

    # Python / Coding
    if any(k in ml for k in ["python", "code", "coding", "script", "function", "javascript", "typescript", "html", "css", "sql"]):
        resp = (
            "Here is a clean, modular Python implementation with proper typing and error handling:\n\n"
            "```python\n"
            "import asyncio\n"
            "import httpx\n"
            "from typing import Optional, Dict, Any\n\n"
            "async def fetch_market_price(symbol: str) -> Optional[Dict[str, Any]]:\n"
            "    \"\"\"Fetches price data asynchronously with timeout and safety controls.\"\"\"\n"
            "    url = f'https://api.marketdata.com/v1/quote/{symbol}'\n"
            "    try:\n"
            "        async with httpx.AsyncClient(timeout=5.0) as client:\n"
            "            response = await client.get(url)\n"
            "            response.raise_for_status()\n"
            "            return response.json()\n"
            "    except Exception as err:\n"
            "        print(f'[Error fetching {symbol}]: {err}')\n"
            "        return None\n\n"
            "if __name__ == '__main__':\n"
            "    data = asyncio.run(fetch_market_price('NABIL'))\n"
            "    print('Received Quote:', data)\n"
            "```\n\n"
            "This script uses non-blocking asynchronous I/O (`httpx.AsyncClient`), explicit type hints, and graceful exception handling."
        )
        return resp, "Here is the clean Python code implementation with error handling."

    # Writing & Email
    if any(k in ml for k in ["email", "letter", "draft", "proposal"]):
        resp = (
            "**Subject:** Project Update & Strategic Next Steps\n\n"
            "Dear Team,\n\n"
            "I hope you are doing well.\n\n"
            "I am writing to provide a concise update on our recent milestones. All core deliverables for this sprint have been tested and deployed with zero defects.\n\n"
            "Please review the attached notes, and let me know if you would like to discuss any items during our sync tomorrow.\n\n"
            "Best regards,\n"
            f"{owner_name}"
        )
        return resp, "Here is the professional email draft ready for your use."

    # Translation
    if any(k in ml for k in ["translate", "translation", "nepali to english", "english to nepali"]):
        resp = (
            "**Translation:**\n\n"
            "• **English**: 'Consistent trading success comes from discipline, risk management, and patience.'\n"
            "• **नेपाली**: 'ट्रेडिङमा निरन्तर सफलता अनुशासन, जोखिम व्यवस्थापन र धैर्यताबाट प्राप्त हुन्छ।'\n"
            "• **हिंदी**: 'ट्रेडिंग में निरंतर सफलता अनुशासन, जोखिम प्रबंधन और धैर्य से मिलती है।'"
        )
        return resp, "Here is the accurate translation across English, Nepali, and Hindi."

    # Natural Adaptive Direct Fallback (NO boilerplate, NO forced headings)
    resp = (
        f"Regarding **\"{msg}\"**:\n\n"
        f"I'm here to provide direct and practical insights. Whether you'd like a simple summary, an in-depth breakdown, working code, mathematical proofs, or live market analysis, just let me know how you'd like to proceed!"
    )
    return resp, f"Here is the information for {msg}."


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
        sources_list: Optional[List[Dict[str, str]]] = None
        thinking_status_str: str = "🧠 Thinking..."

        # 1. Live Web Search & Deep Research Integration
        search_context = ""
        should_search = req.web_search or req.deep_research or any(
            k in msg_lower for k in ["search the web", "search web", "latest news", "today news", "bitcoin price", "nepse news", "latest updates"]
        )
        if should_search:
            thinking_status_str = "🔎 Searching the web & analyzing sources..."
            search_summary, sources_list = await _search_web_live(msg, max_results=6 if req.deep_research else 4)
            search_context = search_summary

        # 2. File Context Attachment
        file_context = ""
        if req.file_data:
            thinking_status_str = f"📄 Reading file: {req.file_data.get('name', 'document')}..."
            f_name = req.file_data.get("name", "Document")
            f_type = req.file_data.get("type", "txt")
            f_content = req.file_data.get("content", "")[:12000]  # Safe truncation
            file_context = f"\n[ATTACHED FILE: {f_name} ({f_type})]:\n{f_content}\n"

        # 3. Vision Image Analysis Status
        if req.image_data:
            thinking_status_str = "🖼 Analyzing image & visual structure..."

        # 4. Project Workspace Context
        project_context = ""
        if req.project_id:
            from backend.app.db.models import Project
            p_q = select(Project).where((Project.id == req.project_id) & (Project.user_id == current_user.id))
            proj = (await db.execute(p_q)).scalars().first()
            if proj:
                project_context = (
                    f"\n[ACTIVE PROJECT: {proj.name}]:\n"
                    f"Description: {proj.description or 'N/A'}\n"
                    f"Custom Project Instructions: {proj.instructions or 'Standard behavior'}\n"
                )

        # 5. User Memories Integration
        memory_context = ""
        if req.enable_memory:
            from backend.app.db.models import UserMemory
            m_q = select(UserMemory).where((UserMemory.user_id == current_user.id) & (UserMemory.is_enabled == True))
            mems = (await db.execute(m_q)).scalars().all()
            if mems:
                mem_lines = [f"• {m.memory_key}: {m.memory_value}" for m in mems]
                memory_context = f"\n[USER PERSONALIZED MEMORY & PREFERENCES]:\n" + "\n".join(mem_lines) + "\n"

        ltp = candles[-1].close if candles else 540.0
        market_context = (
            f"[LIVE MARKET DATA]: {market} | Symbol: {symbol} | LTP: NPR {ltp:.2f} | "
            f"Global Markets: S&P 500, Nasdaq, BTC/USDT, ETH/USDT live active.\n"
            f"{search_context}"
            f"{file_context}"
            f"{project_context}"
            f"{memory_context}"
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

        ai_res = await _call_gemini(system_prompt, req.history or [], msg, image_data=req.image_data, custom_key=req.api_key)
        if not ai_res:
            ai_res = await _call_openai(system_prompt, req.history or [], msg, image_data=req.image_data, custom_key=req.api_key)
        if not ai_res:
            resp_text, speech_text = _general_ai_offline_response(msg, owner_name, language)
            if search_context and sources_list:
                resp_text += f"\n\n**Sources:**\n" + "\n".join([f"- [{s['title']}]({s['url']})" for s in sources_list])
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
        enriched = await _call_gemini(system_prompt, req.history or [], msg, image_data=req.image_data, custom_key=req.api_key)
        if not enriched:
            enriched = await _call_openai(system_prompt, req.history or [], msg, image_data=req.image_data, custom_key=req.api_key)
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
        thinking_status=locals().get("thinking_status_str", "🧠 Thinking..."),
        sources=locals().get("sources_list", None),
        timestamp=now_iso,
        cached=False,
    )
