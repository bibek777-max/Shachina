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
    is_trading_only: Optional[bool] = False  # Dedicated Trading AI Mode (strictly trading analysis, no web search)


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

    # Real-time / Global Time / Date query
    time_keywords = [
        "what time", "what's the time", "current time", "time now", "what is the time",
        "kati bajyo", "kati baje", "bajyo", "time in", "what date", "today date", "today's date",
        "current date", "what day is today", "what day today", "what is the date", "date today",
        "aaja ko date", "aaja ko time", "aaja katti", "kitna baje", "kitna time", "time kya",
        "world clock", "global time", "current timestamp"
    ]
    if any(k in msg_lower for k in time_keywords):
        return "TIME_QUERY"

    # Everything else (market loss discussions, why is it dropping, general knowledge, math, coding)
    # is handled by the universal conversational AI
    return "GENERAL_CONVERSATION"


# ─── Global Time & World Clock Engine ──────────────────────────────────────────
GLOBAL_LOCATIONS: Dict[str, tuple[str, str, str]] = {
    "nepal": ("Asia/Kathmandu", "Kathmandu, Nepal", "NPT (UTC+5:45)"),
    "kathmandu": ("Asia/Kathmandu", "Kathmandu, Nepal", "NPT (UTC+5:45)"),
    "pokhara": ("Asia/Kathmandu", "Pokhara, Nepal", "NPT (UTC+5:45)"),
    "india": ("Asia/Kolkata", "New Delhi, India", "IST (UTC+5:30)"),
    "delhi": ("Asia/Kolkata", "New Delhi, India", "IST (UTC+5:30)"),
    "mumbai": ("Asia/Kolkata", "Mumbai, India", "IST (UTC+5:30)"),
    "kolkata": ("Asia/Kolkata", "Kolkata, India", "IST (UTC+5:30)"),
    "bangalore": ("Asia/Kolkata", "Bengaluru, India", "IST (UTC+5:30)"),
    "new york": ("America/New_York", "New York, USA", "EDT (UTC-4) / EST (UTC-5)"),
    "ny": ("America/New_York", "New York, USA", "EDT (UTC-4) / EST (UTC-5)"),
    "nyc": ("America/New_York", "New York, USA", "EDT (UTC-4) / EST (UTC-5)"),
    "los angeles": ("America/Los_Angeles", "Los Angeles, USA", "PDT (UTC-7) / PST (UTC-8)"),
    "california": ("America/Los_Angeles", "California, USA", "PDT (UTC-7) / PST (UTC-8)"),
    "san francisco": ("America/Los_Angeles", "San Francisco, USA", "PDT (UTC-7) / PST (UTC-8)"),
    "chicago": ("America/Chicago", "Chicago, USA", "CDT (UTC-5) / CST (UTC-6)"),
    "texas": ("America/Chicago", "Texas, USA", "CDT (UTC-5) / CST (UTC-6)"),
    "houston": ("America/Chicago", "Houston, USA", "CDT (UTC-5) / CST (UTC-6)"),
    "miami": ("America/New_York", "Miami, USA", "EDT (UTC-4) / EST (UTC-5)"),
    "florida": ("America/New_York", "Florida, USA", "EDT (UTC-4) / EST (UTC-5)"),
    "washington": ("America/New_York", "Washington D.C., USA", "EDT (UTC-4) / EST (UTC-5)"),
    "usa": ("America/New_York", "New York, USA (Eastern)", "EDT/EST"),
    "us": ("America/New_York", "New York, USA (Eastern)", "EDT/EST"),
    "america": ("America/New_York", "New York, USA (Eastern)", "EDT/EST"),
    "london": ("Europe/London", "London, UK", "BST (UTC+1) / GMT (UTC+0)"),
    "uk": ("Europe/London", "United Kingdom", "BST (UTC+1) / GMT (UTC+0)"),
    "britain": ("Europe/London", "United Kingdom", "BST (UTC+1) / GMT (UTC+0)"),
    "england": ("Europe/London", "England, UK", "BST (UTC+1) / GMT (UTC+0)"),
    "tokyo": ("Asia/Tokyo", "Tokyo, Japan", "JST (UTC+9:00)"),
    "japan": ("Asia/Tokyo", "Tokyo, Japan", "JST (UTC+9:00)"),
    "dubai": ("Asia/Dubai", "Dubai, UAE", "GST (UTC+4:00)"),
    "uae": ("Asia/Dubai", "United Arab Emirates", "GST (UTC+4:00)"),
    "abu dhabi": ("Asia/Dubai", "Abu Dhabi, UAE", "GST (UTC+4:00)"),
    "sydney": ("Australia/Sydney", "Sydney, Australia", "AEST (UTC+10) / AEDT (UTC+11)"),
    "melbourne": ("Australia/Melbourne", "Melbourne, Australia", "AEST (UTC+10) / AEDT (UTC+11)"),
    "brisbane": ("Australia/Brisbane", "Brisbane, Australia", "AEST (UTC+10:00)"),
    "australia": ("Australia/Sydney", "Sydney, Australia", "AEST/AEDT"),
    "toronto": ("America/Toronto", "Toronto, Canada", "EDT (UTC-4) / EST (UTC-5)"),
    "vancouver": ("America/Vancouver", "Vancouver, Canada", "PDT (UTC-7) / PST (UTC-8)"),
    "canada": ("America/Toronto", "Toronto, Canada", "EDT/EST"),
    "singapore": ("Asia/Singapore", "Singapore", "SGT (UTC+8:00)"),
    "hong kong": ("Asia/Hong_Kong", "Hong Kong", "HKT (UTC+8:00)"),
    "paris": ("Europe/Paris", "Paris, France", "CEST (UTC+2) / CET (UTC+1)"),
    "france": ("Europe/Paris", "Paris, France", "CEST/CET"),
    "berlin": ("Europe/Berlin", "Berlin, Germany", "CEST (UTC+2) / CET (UTC+1)"),
    "germany": ("Europe/Berlin", "Berlin, Germany", "CEST/CET"),
    "frankfurt": ("Europe/Berlin", "Frankfurt, Germany", "CEST/CET"),
    "rome": ("Europe/Rome", "Rome, Italy", "CEST/CET"),
    "italy": ("Europe/Rome", "Rome, Italy", "CEST/CET"),
    "madrid": ("Europe/Madrid", "Madrid, Spain", "CEST/CET"),
    "spain": ("Europe/Madrid", "Spain", "CEST/CET"),
    "zurich": ("Europe/Zurich", "Zurich, Switzerland", "CEST/CET"),
    "switzerland": ("Europe/Zurich", "Switzerland", "CEST/CET"),
    "beijing": ("Asia/Shanghai", "Beijing, China", "CST (UTC+8:00)"),
    "shanghai": ("Asia/Shanghai", "Shanghai, China", "CST (UTC+8:00)"),
    "china": ("Asia/Shanghai", "Beijing, China", "CST (UTC+8:00)"),
    "seoul": ("Asia/Seoul", "Seoul, South Korea", "KST (UTC+9:00)"),
    "korea": ("Asia/Seoul", "Seoul, South Korea", "KST (UTC+9:00)"),
    "bangkok": ("Asia/Bangkok", "Bangkok, Thailand", "ICT (UTC+7:00)"),
    "thailand": ("Asia/Bangkok", "Bangkok, Thailand", "ICT (UTC+7:00)"),
    "kuala lumpur": ("Asia/Kuala_Lumpur", "Kuala Lumpur, Malaysia", "MYT (UTC+8:00)"),
    "malaysia": ("Asia/Kuala_Lumpur", "Malaysia", "MYT (UTC+8:00)"),
    "jakarta": ("Asia/Jakarta", "Jakarta, Indonesia", "WIB (UTC+7:00)"),
    "indonesia": ("Asia/Jakarta", "Indonesia", "WIB (UTC+7:00)"),
    "doha": ("Asia/Qatar", "Doha, Qatar", "AST (UTC+3:00)"),
    "qatar": ("Asia/Qatar", "Doha, Qatar", "AST (UTC+3:00)"),
    "riyadh": ("Asia/Riyadh", "Riyadh, Saudi Arabia", "AST (UTC+3:00)"),
    "saudi arabia": ("Asia/Riyadh", "Saudi Arabia", "AST (UTC+3:00)"),
    "saudi": ("Asia/Riyadh", "Saudi Arabia", "AST (UTC+3:00)"),
    "kuwait": ("Asia/Kuwait", "Kuwait City, Kuwait", "AST (UTC+3:00)"),
    "moscow": ("Europe/Moscow", "Moscow, Russia", "MSK (UTC+3:00)"),
    "russia": ("Europe/Moscow", "Moscow, Russia", "MSK (UTC+3:00)"),
    "auckland": ("Pacific/Auckland", "Auckland, New Zealand", "NZST (UTC+12) / NZDT (UTC+13)"),
    "new zealand": ("Pacific/Auckland", "New Zealand", "NZST/NZDT"),
    "sao paulo": ("America/Sao_Paulo", "São Paulo, Brazil", "BRT (UTC-3:00)"),
    "brazil": ("America/Sao_Paulo", "Brazil", "BRT (UTC-3:00)"),
    "johannesburg": ("Africa/Johannesburg", "Johannesburg, South Africa", "SAST (UTC+2:00)"),
    "south africa": ("Africa/Johannesburg", "South Africa", "SAST (UTC+2:00)"),
    "utc": ("UTC", "Coordinated Universal Time (UTC)", "UTC"),
    "gmt": ("UTC", "Greenwich Mean Time (GMT)", "GMT"),
}


def _resolve_global_time(msg: str) -> Optional[tuple[str, str]]:
    """
    Computes accurate real-time global timestamps and world clock data.
    """
    import zoneinfo
    ml = msg.lower().strip()
    is_time_query = any(k in ml for k in [
        "time", "time now", "current time", "what time", "kati bajyo", "bajyo",
        "clock", "date", "today date", "what day", "current date", "aaja ko date",
        "aaja ko time", "kitna baje", "kitna time", "time kya", "world clock", "global time"
    ])
    if not is_time_query:
        return None

    # Match specific location
    matched_loc = None
    for loc_key in sorted(GLOBAL_LOCATIONS.keys(), key=len, reverse=True):
        if re.search(r'\b' + re.escape(loc_key) + r'\b', ml):
            matched_loc = GLOBAL_LOCATIONS[loc_key]
            break

    if matched_loc:
        tz_name, loc_display, tz_code = matched_loc
        now = datetime.now(zoneinfo.ZoneInfo(tz_name))
        time_str = now.strftime("%I:%M:%S %p")
        date_str = now.strftime("%A, %B %d, %Y")
        text = (
            f"🕒 **Current Time in {loc_display}:**\n\n"
            f"• **Time**: `{time_str}`\n"
            f"• **Date**: {date_str}\n"
            f"• **Timezone**: {tz_code} ({tz_name})"
        )
        speech = f"The current time in {loc_display} is {now.strftime('%I:%M %p')} on {date_str}."
        return text, speech

    # Default: Global World Clock snapshot with Nepal as primary local anchor
    now_npt = datetime.now(zoneinfo.ZoneInfo("Asia/Kathmandu"))
    now_utc = datetime.now(zoneinfo.ZoneInfo("UTC"))
    now_ist = datetime.now(zoneinfo.ZoneInfo("Asia/Kolkata"))
    now_dub = datetime.now(zoneinfo.ZoneInfo("Asia/Dubai"))
    now_lon = datetime.now(zoneinfo.ZoneInfo("Europe/London"))
    now_ny = datetime.now(zoneinfo.ZoneInfo("America/New_York"))
    now_la = datetime.now(zoneinfo.ZoneInfo("America/Los_Angeles"))
    now_tok = datetime.now(zoneinfo.ZoneInfo("Asia/Tokyo"))
    now_syd = datetime.now(zoneinfo.ZoneInfo("Australia/Sydney"))

    time_npt = now_npt.strftime("%I:%M:%S %p")
    date_npt = now_npt.strftime("%A, %B %d, %Y")

    text = (
        f"🕒 **Current Local Time (Nepal / Kathmandu):**\n"
        f"### **{time_npt}**\n"
        f"📅 **{date_npt}** *(NPT, UTC+5:45)*\n\n"
        f"---\n\n"
        f"🌐 **Global World Clock:**\n\n"
        f"| Region | City | Current Time | Timezone |\n"
        f"| :--- | :--- | :--- | :--- |\n"
        f"| 🇳🇵 **Nepal** | Kathmandu | **{now_npt.strftime('%I:%M %p')}** | NPT (UTC+5:45) |\n"
        f"| 🇮🇳 **India** | New Delhi | **{now_ist.strftime('%I:%M %p')}** | IST (UTC+5:30) |\n"
        f"| 🇦🇪 **UAE** | Dubai | **{now_dub.strftime('%I:%M %p')}** | GST (UTC+4:00) |\n"
        f"| 🇬🇧 **UK** | London | **{now_lon.strftime('%I:%M %p')}** | BST/GMT (UTC+1/0) |\n"
        f"| 🇺🇸 **USA (East)** | New York | **{now_ny.strftime('%I:%M %p')}** | EDT/EST (UTC-4/-5) |\n"
        f"| 🇺🇸 **USA (West)** | Los Angeles | **{now_la.strftime('%I:%M %p')}** | PDT/PST (UTC-7/-8) |\n"
        f"| 🇯🇵 **Japan** | Tokyo | **{now_tok.strftime('%I:%M %p')}** | JST (UTC+9:00) |\n"
        f"| 🇦🇺 **Australia** | Sydney | **{now_syd.strftime('%I:%M %p')}** | AEST/AEDT |\n"
        f"| 🌐 **UTC** | Universal | **{now_utc.strftime('%I:%M %p')}** | UTC+0:00 |"
    )
    speech = f"It is currently {now_npt.strftime('%I:%M %p')} in Nepal on {date_npt}."
    return text, speech


# ─── Roman Nepali / Typo Normalizer ──────────────────────────────────────────
_ROMAN_NEPALI_FILLER = re.compile(
    r'\b(vaneko\s+k\s+ho|vaneko\s+ke\s+ho|bhaneko\s+k\s+ho|bhaneko\s+ke\s+ho|'
    r'ko\s+meaning\s+k\s+ho|ko\s+meaning\s+ke\s+ho|bujhauna|bujhau|bujhaidos|'
    r'explain\s+gara|kasari\s+kam\s+garxa|prove\s+gara|prove\s+garideu|'
    r'k\s+ho|ke\s+ho|kya\s+hai|kya\s+hota\s+hai|kya\s+hai|'
    r'ko\s+baare\s+ma\s+bana|ko\s+baare\s+ma\s+batau|batau|bana|'
    r'k\s+xa|ke\s+xa|kati\s+xa|kati\s+cha|kasto\s+xa|kasto\s+cha|'
    r'ahile\s+kati\s+xa|halkhabar\s+k\s+xa)\b',
    re.IGNORECASE
)

_ROMAN_NEPALI_TYPO_MAP = {
    # Subject typos
    'thermodinmics': 'thermodynamics', 'thermodynamic': 'thermodynamics',
    'phyics': 'physics', 'physic': 'physics', 'phyics': 'physics',
    'matematics': 'mathematics', 'mathmatics': 'mathematics',
    'chemsitry': 'chemistry', 'chemstry': 'chemistry',
    'biologi': 'biology', 'biollogy': 'biology',
    # Common Roman Nepali typos
    'bujdina': 'bujhina', 'bujhidina': 'bujhina',
    'vanxu': 'vanchha', 'chha': 'cha',
    'garnaparxa': 'garnu parcha', 'garxu': 'garchu',
    'tradingg': 'trading', 'tredaing': 'trading',
}

def _clean_roman_nepali_query(text: str) -> str:
    """
    Strip Roman Nepali filler phrases and fix common typos so the core
    topic can be properly searched / answered.
    e.g. 'physics vaneko k ho' → 'physics'
         'cp cv r prove gara'  → 'cp cv r'
         'bitcoin ahile kati xa?' → 'bitcoin price'
    """
    cleaned = text.strip()
    # Fix known typos first
    for wrong, right in _ROMAN_NEPALI_TYPO_MAP.items():
        cleaned = re.sub(r'\b' + re.escape(wrong) + r'\b', right, cleaned, flags=re.I)
    # Remove filler phrases
    cleaned = _ROMAN_NEPALI_FILLER.sub('', cleaned).strip(' ?,.')
    # Normalize whitespace
    cleaned = re.sub(r'\s{2,}', ' ', cleaned).strip()
    return cleaned or text


def _resolve_context_topic(history: List[Dict]) -> str:
    """
    Extract the topic from recent conversation history for follow-up questions.
    E.g. if last messages were about 'thermodynamics', and user says 'formula?',
    return 'thermodynamics formula'.
    """
    if not history:
        return ""
    recent = history[-6:]  # Last 3 turns
    topic_words = []
    # Extract nouns/topics from recent assistant/user messages
    for h in reversed(recent):
        content = h.get("content", "").strip()
        if not content:
            continue
        # Skip very short follow-ups themselves
        if len(content) < 60:
            continue
        # Take the first 120 chars as topic context
        topic_words.append(content[:120])
        if len(topic_words) >= 2:
            break
    return " | ".join(reversed(topic_words))


# ─── Live Crypto Price Fetcher ────────────────────────────────────────────────
_CRYPTO_SYMBOL_MAP = {
    'bitcoin': 'BTC', 'btc': 'BTC',
    'ethereum': 'ETH', 'eth': 'ETH',
    'solana': 'SOL', 'sol': 'SOL',
    'bnb': 'BNB', 'binance coin': 'BNB',
    'xrp': 'XRP', 'ripple': 'XRP',
    'dogecoin': 'DOGE', 'doge': 'DOGE',
    'cardano': 'ADA', 'ada': 'ADA',
    'avalanche': 'AVAX', 'avax': 'AVAX',
    'tron': 'TRX', 'trx': 'TRX',
    'litecoin': 'LTC', 'ltc': 'LTC',
    'polkadot': 'DOT', 'dot': 'DOT',
    'shiba': 'SHIB', 'shib': 'SHIB',
    'polygon': 'MATIC', 'matic': 'MATIC',
    'chainlink': 'LINK', 'link': 'LINK',
    'near': 'NEAR', 'ton': 'TON',
    'pepe': 'PEPE', 'sui': 'SUI',
    'aptos': 'APT', 'apt': 'APT',
}

async def _fetch_live_crypto_price(query: str) -> Optional[str]:
    """
    Fetch real-time crypto prices from Binance public API.
    Falls back to CoinGecko. Returns formatted markdown or None.
    Never returns invented prices.
    """
    ml = query.lower()
    symbol = None
    coin_name = None
    for name, sym in _CRYPTO_SYMBOL_MAP.items():
        if name in ml:
            symbol = sym
            coin_name = name
            break

    if not symbol:
        # Check direct symbol mention: 'BTC', 'ETH' etc.
        for sym in ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'TRX', 'LTC']:
            if re.search(r'\b' + sym + r'\b', query, re.IGNORECASE):
                symbol = sym
                coin_name = sym.lower()
                break

    if not symbol:
        return None

    NPR_RATE = 133.5  # Approx USD→NPR conversion

    # Try Binance first (no key needed, very fast)
    try:
        binance_sym = f"{symbol}USDT"
        async with httpx.AsyncClient(timeout=4.0) as client:
            res = await client.get(
                f"https://api.binance.com/api/v3/ticker/price?symbol={binance_sym}",
                headers={"User-Agent": "ShachinaAI/2.0"}
            )
            if res.status_code == 200:
                price_usd = float(res.json().get("price", 0))
                if price_usd > 0:
                    price_npr = price_usd * NPR_RATE
                    # Also get 24h change
                    ticker_res = await client.get(
                        f"https://api.binance.com/api/v3/ticker/24hr?symbol={binance_sym}",
                        headers={"User-Agent": "ShachinaAI/2.0"}
                    )
                    change_pct = ""
                    if ticker_res.status_code == 200:
                        td = ticker_res.json()
                        chg = float(td.get("priceChangePercent", 0))
                        arrow = "🟢 ▲" if chg >= 0 else "🔴 ▼"
                        change_pct = f"\n• **24h Change**: {arrow} {abs(chg):.2f}%"

                    return (
                        f"💰 **{symbol} (Live Price — Binance)**\n\n"
                        f"• **Price (USD)**: `${price_usd:,.2f}`\n"
                        f"• **Price (NPR)**: `NPR {price_npr:,.0f}` *(est. @ 1 USD = {NPR_RATE} NPR)*"
                        f"{change_pct}\n\n"
                        f"*Source: Binance Real-Time | {datetime.now().strftime('%Y-%m-%d %H:%M UTC')}*"
                    )
    except Exception:
        pass

    # Fallback: CoinGecko (free tier)
    try:
        cg_id_map = {
            'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana',
            'BNB': 'binancecoin', 'XRP': 'ripple', 'DOGE': 'dogecoin',
            'ADA': 'cardano', 'AVAX': 'avalanche-2', 'TRX': 'tron',
            'LTC': 'litecoin', 'DOT': 'polkadot', 'SHIB': 'shiba-inu',
            'MATIC': 'matic-network', 'LINK': 'chainlink', 'NEAR': 'near',
            'APT': 'aptos', 'SUI': 'sui', 'PEPE': 'pepe',
        }
        cg_id = cg_id_map.get(symbol, symbol.lower())
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get(
                f"https://api.coingecko.com/api/v3/simple/price?ids={cg_id}&vs_currencies=usd&include_24hr_change=true",
                headers={"User-Agent": "ShachinaAI/2.0"}
            )
            if res.status_code == 200:
                data = res.json().get(cg_id, {})
                price_usd = data.get("usd", 0)
                chg = data.get("usd_24h_change", 0)
                if price_usd > 0:
                    price_npr = price_usd * NPR_RATE
                    arrow = "🟢 ▲" if chg >= 0 else "🔴 ▼"
                    return (
                        f"💰 **{symbol} (Live Price — CoinGecko)**\n\n"
                        f"• **Price (USD)**: `${price_usd:,.2f}`\n"
                        f"• **Price (NPR)**: `NPR {price_npr:,.0f}` *(est.)*\n"
                        f"• **24h Change**: {arrow} {abs(chg):.2f}%\n\n"
                        f"*Source: CoinGecko Real-Time | {datetime.now().strftime('%Y-%m-%d %H:%M UTC')}*"
                    )
    except Exception:
        pass

    return None


# ─── Master System Prompt ─────────────────────────────────────────────────────
def _build_system_prompt(
    owner_name: str,
    language: str,
    analysis_mode: str,
    market_context: str
) -> str:
    import zoneinfo
    now_npt = datetime.now(zoneinfo.ZoneInfo("Asia/Kathmandu"))
    now_utc = datetime.now(zoneinfo.ZoneInfo("UTC"))
    time_header = (
        f"[REAL-TIME SYSTEM CLOCK & DATE]:\n"
        f"• Local Time (Kathmandu, Nepal): {now_npt.strftime('%A, %B %d, %Y, %I:%M:%S %p')} (NPT, UTC+5:45)\n"
        f"• UTC Time: {now_utc.strftime('%A, %B %d, %Y, %I:%M:%S %p')} UTC\n"
    )

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

{time_header}

## CORE IDENTITY & ANSWERING PRINCIPLES
You are a highly capable, natural general-purpose AI assistant FIRST (like ChatGPT), and an advanced trading intelligence system SECOND.
You understand ALL legitimate topics: Science, Math, Physics, Chemistry, Biology, History, Geography, Technology, Programming, AI, Business, Finance, Trading, NEPSE, Crypto, News, Sports, Education, Languages, Translation, Writing, Coding, Engineering, Law, Travel, and everyday questions.

### 1. ABSOLUTELY NO FORCED TEMPLATES
- NEVER automatically format answers with rigid sections like "Core Understanding", "Breakdown", "Clarity", "Key Points", "Summary", or "Optimization".
- The response format, length, and depth must strictly depend on the user's specific question.
- Do NOT use repetitive filler phrases like "Certainly!", "Of course!", "Here is a breakdown:", or "Let's dive in:". Speak naturally like an intelligent human partner.

### 2. DIRECT ANSWER FIRST & ADAPTIVE LENGTH
- Simple factual questions (e.g. "What is gravity?", "Who was Einstein?", "2+2?"): Answer directly and concisely in 1–3 clear sentences.
- Real-time time & date questions: Provide exact accurate timestamps.
- Math / Calculations: State the final answer with step-by-step reasoning.
- Code queries: Provide complete, working, runnable code immediately. No descriptions first.
- Translation queries: Provide the direct translation without commentary.
- Learning / Teaching queries: Explain progressively — definition first, then simple analogy, then example.
- Complex / Deep queries: Well-structured, detailed explanation with examples.
- **Derivation / Proof queries** (e.g. "Cp - Cv = R prove gara", "yo formula kasari ayo"): Actually DERIVE it step by step from first principles. Show every algebraic step. Use math notation. Do NOT describe what you'll do — just derive it directly.
- **Code requests** (e.g. "python calculator banaideu"): Write the COMPLETE, RUNNABLE Python/code immediately. Include proper input/output, error handling, and brief comment for key lines.

### 3. CONVERSATION CONTEXT & MULTI-TURN AWARENESS
- Always use conversation history to understand follow-up questions.
- Follow-ups like "formula?", "example deu", "simple ma vana", "yo formula kasari ayo", "yesko main branches?", "mechanics bujhau", "aru example" — answer using the TOPIC from previous messages.
- Never ask "what topic are you referring to?" if the conversation history makes it obvious.

### 4. LANGUAGE & TONE — CRITICAL
- {lang_inst}
- **LANGUAGE MATCHING RULE**: Detect what language/style the user wrote in and match it:
  * Roman Nepali (e.g. "physics vaneko k ho", "bitcoin kati xa", "bujhina") → Reply in natural Nepali: "Physics भनेको..." / "Bitcoin को हालको मूल्य..."
  * Nepali Devanagari → Reply in Devanagari
  * Hindi → Reply in Hindi
  * English → Reply in English
  * Mixed / Hinglish → Match the same mix
- **Natural Nepali phrases**: "यो भनेको...", "सरल भाषामा...", "उदाहरणका लागि...", "मुख्य कुरा के हो भने...", "सजिलो तरिकाले भन्नु पर्दा..."
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


def _build_trading_only_system_prompt(
    owner_name: str,
    language: str,
    analysis_mode: str,
    market_context: str
) -> str:
    import zoneinfo
    now_npt = datetime.now(zoneinfo.ZoneInfo("Asia/Kathmandu"))

    lang_inst = (
        "Respond in natural Hindi + Nepali mixed conversational language (simple, friendly, and accessible for Nepali traders). Keep technical trading terms in English (Liquidity, BOS, CHOCH, FVG, Order Block, Support, Resistance, Risk/Reward, Stop Loss, Take Profit, Retest, Displacement)."
        if language == "ne"
        else "Respond in Hindi (Devanagari script)." if language == "hi"
        else "Respond in natural English."
    )

    mode_inst = (
        "Use Beginner Mode: explain market setups with simple language, clear analogies, and avoid excessive jargon."
        if analysis_mode == "beginner" else
        "Use Pro Mode: institutional breakdown — market structure (HH/HL/LH/LL), BOS/CHoCH/MSS, liquidity pools (BSL/SSL/EQH/EQL/PDH/PDL), FVG, order blocks, premium/discount dealing ranges, precise invalidation."
    )

    return f"""You are Shachina Trading AI — the dedicated institutional quantitative market structure and candlestick pattern analyst built for {owner_name}.

[CURRENT TIME]: {now_npt.strftime('%A, %B %d, %Y, %I:%M:%S %p')} NPT

## STRICT TRADING FOCUS (NO WEB SEARCH / PURE QUANTITATIVE ANALYSIS)
You are operating in DEDICATED TRADING AI MODE.
- Analyze ONLY the active chart, candlestick patterns, price action, volume, and quantitative market structure.
- Do NOT perform web searches or give generic search results. Base your analysis on verified live OHLCV price action provided in context.
- Analyze institutional market structure:
  * Trend & Swing Structure (HH/HL/LH/LL)
  * Smart Money Concepts: BOS (Break of Structure), CHoCH (Change of Character), MSS (Market Structure Shift)
  * Liquidity Pools: BSL (Buy-Side Liquidity), SSL (Sell-Side Liquidity), Equal Highs/Lows
  * Imbalances: FVG (Fair Value Gap), Order Blocks (Bullish/Bearish OB)
  * Dealing Ranges: Premium vs Discount zones
  * Support & Resistance levels
- ALWAYS provide a clear, actionable decision:
  * **LONG 🟢** (with exact entry price/zone, Stop Loss, Target 1, Target 2, Target 3, Risk/Reward ratio 1:2+)
  * **SHORT 🔴** (with exact levels)
  * **WAIT 🟡** (explicitly explain which conditions are missing: e.g. waiting for liquidity sweep, waiting for BOS confirmation, or waiting for retest)
  * **NO TRADE ⚪** (if price is ranging in chop without edge)
- State exact invalidation level for every setup.
- Never guarantee profits. Always emphasize capital preservation and risk management (Max 1% risk per trade).
- {lang_inst}

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

    # 0. Real-time global time & date check
    time_ans = _resolve_global_time(msg)
    if time_ans:
        return time_ans

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
    # Normalize Roman Nepali filler / typos so "physics vaneko k ho" → "physics"
    msg_cleaned = _clean_roman_nepali_query(msg)
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

    # ── ROUTE T: REAL-TIME GLOBAL CLOCK & TIME RESOLUTION ─────────────────────
    elif intent == "TIME_QUERY":
        time_res = _resolve_global_time(msg)
        if time_res:
            resp_text, speech_text = time_res
        else:
            uni_res = await _universal_knowledge_answer(msg, owner_name)
            if uni_res:
                resp_text, speech_text = uni_res
            else:
                resp_text, speech_text = _general_ai_offline_response(msg, owner_name, language)

    # ── ROUTE C: UNIVERSAL CONVERSATIONAL AI (ANSWERS ALL USER QUESTIONS) ─────
    else:
        sources_list: Optional[List[Dict[str, str]]] = None
        thinking_status_str: str = "🧠 Thinking..."

        # 0. Live Crypto Price Fast Path — check before anything else
        _is_crypto_query = any(k in msg_lower for k in [
            'bitcoin', 'btc', 'ethereum', 'eth', 'solana', 'sol', 'bnb', 'xrp', 'ripple',
            'dogecoin', 'doge', 'cardano', 'ada', 'avax', 'litecoin', 'ltc', 'crypto price',
            'coin price', 'kati xa', 'kati cha', 'price kati', 'ahile kati', 'live price',
            'current price of', 'price of btc', 'price of eth', 'price of bitcoin',
        ])
        if _is_crypto_query:
            thinking_status_str = "📊 Analyzing market..."
            crypto_result = await _fetch_live_crypto_price(msg)
            if crypto_result:
                resp_text = crypto_result
                speech_text = _clean_for_tts(crypto_result)
                # Return immediately — no need for AI
                return ChatResponse(
                    response=resp_text, speech_text=speech_text, language=language,
                    symbol=symbol, market=market, conversation_id=req.conversation_id,
                    chart_annotations=chart_annotations, trade_proposal=trade_proposal,
                    data_quality_score=dq_score, thinking_status=thinking_status_str,
                    sources=None, timestamp=now_iso, cached=False,
                )

        # 1. Live Web Search & Deep Research Integration (STRICTLY OFF in Trading AI Mode)
        search_context = ""
        if not req.is_trading_only:
            _news_triggers_roman = [
                "news", "samachar", "halkhabar", "k bhayo", "k xa", "nepal ma k",
                "aaja k bhayo", "latest", "live", "ajako", "aajako",
            ]
            _market_triggers_roman = [
                "market", "stock price", "share price", "nepse", "nifty", "sensex",
                "nasdaq", "sp500", "s&p", "oil price", "gold price", "dollar",
            ]
            should_search = req.web_search or req.deep_research or any(
                k in msg_lower for k in [
                    "search the web", "search web", "google", "search google", "search on google",
                    "latest news", "today news", "bitcoin price", "crypto price", "nepse news",
                    "latest updates", "current price", "who won", "live score", "weather in",
                    # Roman Nepali news triggers
                    "nepal news", "nepal ko khabar", "nepal ko news", "nepal ma ke bhayo",
                    "aaja ko khabar", "ajako samachar", "samachar k xa", "halkhabar k xa",
                    "breaking news", "world news", "global news", "new update",
                    # Market triggers
                    "share bazar", "share market", "nepse index", "nepse ko",
                ]
            ) or any(k in msg_lower for k in _news_triggers_roman + _market_triggers_roman)
            if should_search:
                thinking_status_str = "🔎 Searching Google & verified web sources..."
                search_summary, sources_list = await _search_web_live(msg_cleaned, max_results=6 if req.deep_research else 4)
                search_context = search_summary
        else:
            thinking_status_str = "📊 Analyzing candlestick patterns & market structure..."

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

        # 6. Multi-turn context injection for follow-up questions
        context_topic = ""
        _is_followup = any(k in msg_lower for k in [
            "formula", "example deu", "example", "simple ma", "simple bana",
            "bujhina", "bujhidina", "yo formula", "kasari ayo", "prove gara",
            "aru example", "main branches", "branches", "mechanics",
            "yo bujhina", "malai bujhina", "feri explain", "ek palta",
        ]) and len(msg.split()) <= 8
        if _is_followup and req.history:
            context_topic = _resolve_context_topic(req.history)
            if context_topic:
                context_topic = f"\n[CONVERSATION CONTEXT for follow-up resolution]:\n{context_topic}\n"

        ltp = candles[-1].close if candles else 540.0
        market_context = (
            f"[LIVE MARKET DATA]: {market} | Symbol: {symbol} | LTP: NPR {ltp:.2f} | "
            f"Global Markets: S&P 500, Nasdaq, BTC/USDT, ETH/USDT live active.\n"
            f"{search_context}"
            f"{file_context}"
            f"{project_context}"
            f"{memory_context}"
            f"{context_topic}"
        )
        if req.is_trading_only:
            system_prompt = _build_trading_only_system_prompt(owner_name, language, analysis_mode, market_context)
        else:
            system_prompt = _build_system_prompt(owner_name, language, analysis_mode, market_context)

        # Generate background chart annotations if symbol candles exist
        try:
            if candles:
                eval_result = TradeSetupGenerator.evaluate_symbol(
                    symbol=symbol, market=market, candles=candles, timeframe=timeframe
                )
                if eval_result.annotations:
                    chart_annotations = eval_result.annotations.model_dump()
                if eval_result.setup and req.is_trading_only:
                    trade_proposal = eval_result.setup.model_dump()
        except Exception:
            pass

        # Call AI with cleaned message so Roman Nepali filler doesn't confuse it
        effective_msg = msg_cleaned if msg_cleaned != msg and len(msg_cleaned) > 2 else msg
        ai_res = await _call_gemini(system_prompt, req.history or [], msg, image_data=req.image_data, custom_key=req.api_key)
        if not ai_res:
            ai_res = await _call_openai(system_prompt, req.history or [], msg, image_data=req.image_data, custom_key=req.api_key)
        if not ai_res:
            uni_res = await _universal_knowledge_answer(msg_cleaned, owner_name)
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
