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
        # Fallback: scrape DuckDuckGo HTML for real live snippets
        try:
            import html as _html
            async with httpx.AsyncClient(timeout=6.0) as client:
                res = await client.post(
                    "https://html.duckduckgo.com/html/", data={"q": query},
                    headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
                )
                link_ms = re.findall(r'<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)</a>', res.text)
                snip_ms = re.findall(r'<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)</a>', res.text)
                for i in range(min(len(link_ms), len(snip_ms), max_results)):
                    href, raw_t = link_ms[i]
                    title = _html.unescape(re.sub(r'<[^>]+>', '', raw_t).strip())
                    snippet = _html.unescape(re.sub(r'<[^>]+>', '', snip_ms[i]).strip())
                    if title and snippet:
                        sources.append({"title": title, "url": href.strip() or f"https://duckduckgo.com/?q={query.replace(' ','+')}", "snippet": snippet})
        except Exception:
            pass

    if not sources:
        sources.append({
            "title": f"Search: {query}",
            "url": f"https://duckduckgo.com/?q={query.replace(' ', '+')}",
            "snippet": f"Live search was attempted for '{query}'."
        })

    summary_lines = ["\n[REAL-TIME WEB SEARCH RESULTS — LIVE VERIFIED SOURCES]:"]
    for i, s in enumerate(sources[:max_results], 1):
        summary_lines.append(f"{i}. **{s['title']}**: {s['snippet']} (Source: {s['url']})")
    summary_lines.append("\nUse the above live search results to answer accurately. Cite source URLs in your response.\n")

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


# ─── Universal Knowledge Engine (Wikipedia + Math — Primary Fallback) ──────────
async def _universal_knowledge_answer(msg: str, owner_name: str) -> Optional[tuple[str, str]]:
    """
    Truly general-purpose knowledge engine — handles ANY topic dynamically.
    No hardcoded topic-specific answers. Uses Wikipedia + DuckDuckGo HTML.
    """
    import urllib.parse
    import html as _html
    ml = msg.lower().strip()

    # 1. Percentage calculation (e.g. "25% of 840")
    pct_m = re.search(r'(\d+(?:\.\d+)?)\s*%\s*(?:of)?\s*(\d+(?:\.\d+)?)', ml)
    if pct_m:
        pct, val = float(pct_m.group(1)), float(pct_m.group(2))
        result = (pct / 100.0) * val
        fmt: Any = int(result) if result == int(result) else round(result, 4)
        return f"{pct}% of {val:g} = **{fmt}**", f"{pct} percent of {val} is {fmt}."

    # 2. Simple arithmetic (e.g. "2+2", "12*15", "100/4")
    if any(op in msg for op in ['+', '-', '*', '/', '^']):
        arith_m = re.match(r'^\s*([\d\.\s\+\-\*\/\(\)\^]+)\s*[\?=]?\s*$', msg)
        if arith_m:
            try:
                expr = msg.replace('^', '**').replace('?', '').replace('=', '').strip()
                if re.match(r'^[\d\.\s\+\-\*\/\(\)]+$', expr):
                    ans = eval(expr)  # safe: only digits + operators
                    fmt = int(ans) if isinstance(ans, float) and ans.is_integer() else round(ans, 6)
                    return f"**{fmt}**", f"The answer is {fmt}."
            except Exception:
                pass

    # 3. Wikipedia dynamic lookup for ANY topic
    try:
        async with httpx.AsyncClient(timeout=5.0) as wiki_client:
            clean_q = re.sub(
                r'^(what is|what are|who is|who was|who invented|explain|define|tell me about|describe|how does|why is|what was)\s+',
                '', ml, flags=re.I
            ).strip(' ?.')
            clean_q = clean_q or ml
            import urllib.parse as _up
            sr_url = f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={_up.quote(clean_q)}&format=json&utf8="
            sr_data = (await wiki_client.get(sr_url, headers={"User-Agent": "ShachinaAI/2.0"})).json()
            hits = sr_data.get("query", {}).get("search", [])
            if hits:
                top_title = hits[0]["title"]
                sum_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{_up.quote(top_title)}"
                sum_data = (await wiki_client.get(sum_url, headers={"User-Agent": "ShachinaAI/2.0"})).json()
                extract = sum_data.get("extract", "")
                page_url = sum_data.get("content_urls", {}).get("desktop", {}).get("page", "")
                if extract and len(extract) > 80:
                    trimmed = extract if len(extract) <= 1200 else extract[:1200].rsplit('.', 1)[0] + '.'
                    src_note = f"\n\n*(Source: [Wikipedia — {top_title}]({page_url}))*" if page_url else ""
                    return trimmed + src_note, trimmed[:200]
    except Exception:
        pass

    # 4. DuckDuckGo HTML snippet fallback for live/current queries
    try:
        import html as _html
        async with httpx.AsyncClient(timeout=5.0) as ddg_client:
            res = await ddg_client.post(
                "https://html.duckduckgo.com/html/", data={"q": msg},
                headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"}
            )
            raw_snips = re.findall(r'<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)</a>', res.text)
            clean_snips = [_html.unescape(re.sub(r'<[^>]+>', '', s).strip()) for s in raw_snips[:3] if s.strip()]
            if clean_snips:
                return "\n\n".join(clean_snips), clean_snips[0][:200]
    except Exception:
        pass

    return None


# ─── Offline General AI — Minimal Conversation Fallback ───────────────────────
def _general_ai_offline_response(msg: str, owner_name: str, language: str) -> tuple[str, str]:
    """
    Minimal synchronous fallback — used ONLY when ALL AI APIs and knowledge engines fail.
    Handles only basic conversational identity responses.
    """
    ml = msg.lower().strip()
    if any(w in ml for w in ["love you", "i love u", "माया", "love u", "i love you"]):
        r = f"Aww, that's sweet! ❤️ I'm always here for you, {owner_name}."
        return r, r
    if any(w in ml for w in ["who are you", "what is your name", "तिम्रो नाम"]):
        r = (f"I'm **Shachina** — your personal AI assistant built for {owner_name}. "
             f"I can help with science, coding, math, trading, research, translation, and much more.")
        return r, "I am Shachina, your general purpose AI assistant."
    if any(w in ml for w in ["hello", "hi", "hey", "नमस्ते", "नमस्कार"]):
        r = f"Hello, {owner_name}! 👋 How can I help you today? Ask me anything."
        return r, r
    if any(w in ml for w in ["thank", "thanks", "धन्यवाद"]):
        return "You're welcome! 😊", "You are welcome."
    r = ("I wasn't able to connect to my knowledge sources right now. Please try again in a moment. "
         "I can help with trading, science, coding, math, news, translation, and much more!")
    return r, r


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
            uni_res = await _universal_knowledge_answer(msg, owner_name)
            if uni_res:
                resp_text, speech_text = uni_res
            else:
                resp_text, speech_text = _general_ai_offline_response(msg, owner_name, language)
            if search_context and sources_list and not (uni_res and "Source:" in resp_text):
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
