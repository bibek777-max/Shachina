export type MarketType = 'NEPSE' | 'CRYPTO' | 'US_STOCKS' | 'FOREX' | 'COMMODITIES';

export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w';

export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  state?: string;
  body?: number;
  range?: number;
  upper_wick?: number;
  lower_wick?: number;
  is_bullish: boolean;
  is_bearish: boolean;
}

export interface DataQualityReport {
  score: number;
  is_valid: boolean;
  reasons: string[];
  total_candles: number;
  missing_candles: number;
  duplicate_candles: number;
  invalid_ohlc_count: number;
  gap_count: number;
  stale_count: number;
  abnormal_spikes: number;
  evaluated_at?: string;
}

export interface SymbolInfo {
  symbol: string;
  name: string;
  market: MarketType;
  currency: string;
  sector?: string;
  tick_size: number;
  lot_size: number;
  is_active: boolean;
}

export interface MarketStatus {
  market: MarketType;
  is_open: boolean;
  session: string;
  current_time: string;
  timezone: string;
  message: string;
}

export interface OHLCVResponse {
  symbol: string;
  market: MarketType;
  timeframe: Timeframe;
  currency: string;
  timezone: string;
  count: number;
  data_quality: DataQualityReport;
  candles: Candle[];
  last_updated: string;
}

export interface UserPreferences {
  primary_market: string;
  supported_markets: string[];
  language: string;
  dark_mode: boolean;
  chart_style: string;
  analysis_mode: 'beginner' | 'pro';
  onboarded: boolean;
}

export interface UserTradingSettings {
  account_size: number;
  currency: string;
  risk_percentage: number;
  max_daily_loss: number;
  min_risk_reward: number;
  emergency_stop_enabled: boolean;
}

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  analysis_mode?: 'beginner' | 'pro';
  preferences?: UserPreferences;
  trading_settings?: UserTradingSettings;
}

// ─── Shachina Chart Drawing Annotations ──────────────────────────────────────

export interface ChartAnnotationLine {
  price: number;
  label: string;
  color?: string;
}

export interface ChartZone {
  top: number;
  bottom: number;
  type: 'BREAKOUT' | 'SUPPLY' | 'DEMAND' | 'LIQUIDITY';
  label: string;
}

export interface ChartPatternBadge {
  candle_index: number;
  pattern: string;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  price: number;
}

export interface ChartAnnotations {
  symbol: string;
  timeframe: string;
  support_lines?: ChartAnnotationLine[];
  resistance_lines?: ChartAnnotationLine[];
  entry_line?: ChartAnnotationLine;
  stop_loss_line?: ChartAnnotationLine;
  target_lines?: ChartAnnotationLine[];
  zones?: ChartZone[];
  patterns?: ChartPatternBadge[];
  fibonacci_levels?: Array<{ ratio: number; price: number; label: string }>;
}

export interface TradeProposal {
  symbol: string;
  market: string;
  direction: 'BUY' | 'SELL';
  market_structure?: string;
  entry_price: number;
  entry_zone?: string;
  stop_loss: number;
  target_1: number;
  target_2?: number;
  target_3?: number;
  risk_reward?: string;
  confidence?: string;
  confidence_score?: number;
  estimated_risk_npr?: number;
  suggested_shares?: number;
  quantity?: number;
  risk_amount?: number;
  reasons?: string[];
  warning?: string;
  ready_for_execution?: boolean;
}

// ─── Trading Positions & Orders ──────────────────────────────────────────────

export interface TradingPosition {
  id: string;
  symbol: string;
  market: string;
  direction: 'LONG' | 'SHORT';
  quantity: number;
  entry_price: number;
  current_price: number;
  stop_loss?: number;
  target?: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  status: 'OPEN' | 'CLOSED';
  opened_at: string;
}

export interface TradeOrder {
  id: string;
  symbol: string;
  market: string;
  order_type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  stop_loss?: number;
  target?: number;
  status: string;
  execution_mode: 'LIVE_BROKER' | 'PAPER' | 'REJECTED';
  risk_amount: number;
  created_at: string;
}

export interface ClosedTrade {
  id: string;
  symbol: string;
  market: string;
  direction: 'LONG' | 'SHORT';
  quantity: number;
  entry_price: number;
  exit_price: number;
  stop_loss?: number;
  target?: number;
  realized_pnl: number;
  status: string;
  opened_at: string;
  closed_at: string;
}

export interface PortfolioSummary {
  account_size: number;
  account_equity: number;
  currency: string;
  total_unrealized_pnl: number;
  total_realized_pnl: number;
  net_pnl: number;
  open_positions: number;
  closed_trades: number;
  win_rate: number;
  risk_percentage: number;
  max_daily_loss: number;
  min_risk_reward: number;
  emergency_stop_enabled: boolean;
}

// ─── Conversation Memory ──────────────────────────────────────────────────────

export interface ConversationMessage {
  id: string;
  role: 'user' | 'shachina';
  content: string;
  speech_text?: string;
  annotations?: ChartAnnotations;
  trade_proposal?: TradeProposal;
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  message_count?: number;
  last_preview?: string;
  created_at: string;
  updated_at?: string;
  messages?: ConversationMessage[];
}

export interface UserMemoryItem {
  id: number;
  memory_key: string;
  memory_value: string;
  category: string;
  is_enabled: boolean;
  created_at?: string;
}

export interface ProjectItem {
  id: string;
  item_type: 'FILE' | 'NOTE' | 'DATASET' | 'CONVERSATION';
  title: string;
  content?: string;
  file_metadata?: Record<string, any>;
  created_at?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  context_data?: Record<string, any>;
  item_count?: number;
  items?: ProjectItem[];
  created_at?: string;
  updated_at?: string;
}

export interface AssistantChatPayload {
  message: string;
  symbol?: string;
  market?: string;
  timeframe?: string;
  language?: string;
  analysis_mode?: 'beginner' | 'pro';
  conversation_id?: string;
  history?: Array<{ role: string; content: string }>;
  image_data?: string;
  file_data?: { name: string; type: string; content: string };
  web_search?: boolean;
  deep_research?: boolean;
  project_id?: string;
  enable_memory?: boolean;
  is_trading_only?: boolean;
}

export interface AssistantChatResponse {
  response: string;
  speech_text: string;
  language: string;
  symbol?: string;
  market: string;
  conversation_id?: string;
  chart_annotations?: ChartAnnotations;
  trade_proposal?: TradeProposal;
  data_quality_score: number;
  thinking_status?: string;
  sources?: Array<{ title: string; url: string; snippet?: string }>;
  timestamp: string;
  cached: boolean;
}
