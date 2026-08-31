/**
 * SHACHINA AUTO TRADE ALERT ENGINE
 * ──────────────────────────────────────────────────────
 * Polls the backend every 60 seconds for BUY / SELL signals.
 * When a HIGH-CONFIDENCE signal is detected it automatically
 * speaks the alert aloud using the ShachinaVoiceEngine.
 *
 * Zero-fabrication: signals are computed from real OHLCV data
 * (RSI, MACD, EMA crossover, volume confirmation).
 */

import { voiceEngine } from './voiceEngine';

export type SignalType = 'BUY' | 'SELL' | 'HOLD';

export interface TradeSignal {
  symbol: string;
  market: string;
  signal: SignalType;
  confidence: number;       // 0–100
  price: number;
  reason: string;
  timestamp: string;
}

export type AlertCallback = (signal: TradeSignal) => void;

const API_BASE = import.meta.env.VITE_API_URL || '';
const POLL_INTERVAL_MS = 60_000;       // check every 60 seconds
const MIN_CONFIDENCE   = 70;           // only alert when ≥ 70% confidence

class TradeAlertEngine {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning   = false;
  private watchlist   : string[] = [];
  private market      = 'NEPSE';
  private callbacks   : AlertCallback[] = [];
  // Track last alerted signal per symbol so we don't repeat
  private lastAlerted : Map<string, string> = new Map();
  public  isEnabled   = true;

  /** Start polling for trade alerts */
  start(market: string, symbols: string[]) {
    this.market    = market;
    this.watchlist = symbols.slice(0, 10);    // monitor top 10 symbols
    if (this.isRunning) return;
    this.isRunning = true;
    // Immediate first check
    this._poll();
    this.intervalId = setInterval(() => this._poll(), POLL_INTERVAL_MS);
  }

  /** Stop polling */
  stop() {
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
    this.isRunning = false;
  }

  /** Update watchlist without stopping */
  update(market: string, symbols: string[]) {
    this.market    = market;
    this.watchlist = symbols.slice(0, 10);
  }

  /** Subscribe to alert callbacks */
  onAlert(cb: AlertCallback) {
    this.callbacks.push(cb);
  }

  /** Remove a callback */
  offAlert(cb: AlertCallback) {
    this.callbacks = this.callbacks.filter(c => c !== cb);
  }

  private async _poll() {
    if (!this.isEnabled || this.watchlist.length === 0) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/signals?market=${this.market}&symbols=${this.watchlist.join(',')}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('shachina_token') || ''}` }
      });
      if (!res.ok) return;
      const signals: TradeSignal[] = await res.json();
      for (const signal of signals) {
        if (signal.signal === 'HOLD') continue;
        if (signal.confidence < MIN_CONFIDENCE) continue;
        const key = `${signal.symbol}-${signal.signal}-${signal.timestamp.slice(0, 13)}`;
        if (this.lastAlerted.get(signal.symbol) === key) continue;
        this.lastAlerted.set(signal.symbol, key);
        this._fireAlert(signal);
      }
    } catch {
      // Silent fail — network blip should not crash the app
    }
  }

  private _fireAlert(signal: TradeSignal) {
    // Notify UI listeners
    this.callbacks.forEach(cb => cb(signal));
    // Auto-speak the alert
    if (this.isEnabled) {
      const message = this._buildVoiceMessage(signal);
      voiceEngine.speak(message, 'en', `alert-${signal.symbol}-${signal.signal}`);
    }
  }

  private _buildVoiceMessage(signal: TradeSignal): string {
    const emoji = signal.signal === 'BUY' ? '🟢' : '🔴';
    const action = signal.signal === 'BUY' ? 'BUY alert' : 'SELL alert';
    return `${emoji} Shachina ${action}! ${signal.symbol}. ` +
      `Confidence ${signal.confidence} percent. ` +
      `${signal.reason}. ` +
      `Current price: ${signal.price} rupees.`;
  }
}

export const tradeAlertEngine = new TradeAlertEngine();
