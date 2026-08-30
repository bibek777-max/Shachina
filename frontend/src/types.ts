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

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
}
