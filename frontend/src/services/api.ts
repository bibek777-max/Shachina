import { MarketType, Timeframe, MarketStatus, SymbolInfo, OHLCVResponse, User } from '../types';

const API_BASE = '/api/v1';

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 25000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (err: any) {
    clearTimeout(id);
    if (err.name === 'AbortError') {
      throw new Error('Connection timed out. Please check your network and try again.');
    }
    if (!navigator.onLine || err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
      throw new Error('Connection lost. Please try again.');
    }
    throw err;
  }
}

export const api = {
  // Token management
  getToken(): string | null {
    return localStorage.getItem('shachina_auth_token');
  },

  setToken(token: string) {
    localStorage.setItem('shachina_auth_token', token);
  },

  clearToken() {
    localStorage.removeItem('shachina_auth_token');
  },

  getAuthHeaders(): Record<string, string> {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  },

  // Auth Endpoints
  async register(data: {
    full_name: string;
    username: string;
    email: string;
    phone_number?: string;
    password: string;
    confirm_password: string;
  }) {
    const res = await fetchWithTimeout(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Registration failed' }));
      throw new Error(err.detail || 'Registration failed');
    }
    const json = await res.json();
    if (json.access_token) this.setToken(json.access_token);
    return json;
  },

  async login(username_or_email: string, password: string) {
    const res = await fetchWithTimeout(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username_or_email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Invalid credentials' }));
      throw new Error(err.detail || 'Invalid credentials');
    }
    const json = await res.json();
    if (json.access_token) this.setToken(json.access_token);
    return json;
  },

  async forgotPassword(identifier: string) {
    const res = await fetchWithTimeout(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier }),
    });
    return res.json();
  },

  async resetPassword(reset_token: string, new_password: string, confirm_password: string) {
    const res = await fetchWithTimeout(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reset_token, new_password, confirm_password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Password reset failed' }));
      throw new Error(err.detail || 'Password reset failed');
    }
    return res.json();
  },

  async getMyProfile() {
    const res = await fetchWithTimeout(`${API_BASE}/auth/me`, {
      headers: this.getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Session expired');
    return res.json();
  },

  async updatePreferences(data: any) {
    const res = await fetchWithTimeout(`${API_BASE}/auth/preferences`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async updateTradingSettings(data: any) {
    const res = await fetchWithTimeout(`${API_BASE}/auth/trading-settings`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async updateVoiceSettings(data: any) {
    const res = await fetchWithTimeout(`${API_BASE}/auth/voice-settings`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async logout() {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
      });
    } catch (_) {}
    this.clearToken();
  },

  // Market Endpoints
  async getMarketStatuses(): Promise<MarketStatus[]> {
    const res = await fetchWithTimeout(`${API_BASE}/markets/all-statuses`);
    if (!res.ok) throw new Error('Failed to fetch market statuses');
    return res.json();
  },

  async getNepseStatus(): Promise<MarketStatus> {
    const res = await fetchWithTimeout(`${API_BASE}/markets/nepse/status`);
    if (!res.ok) throw new Error('Failed to fetch NEPSE status');
    return res.json();
  },

  async getNepseSectors(): Promise<any> {
    const res = await fetchWithTimeout(`${API_BASE}/markets/nepse/sectors`);
    if (!res.ok) throw new Error('Failed to fetch NEPSE sectors');
    return res.json();
  },

  async getSymbols(market: MarketType): Promise<SymbolInfo[]> {
    const res = await fetchWithTimeout(`${API_BASE}/markets/${market}/symbols`);
    if (!res.ok) throw new Error(`Failed to fetch symbols for ${market}`);
    return res.json();
  },

  async getOHLCV(market: MarketType, symbol: string, timeframe: Timeframe = '1d', limit: number = 80): Promise<OHLCVResponse> {
    const res = await fetchWithTimeout(`${API_BASE}/markets/${market}/ohlcv/${encodeURIComponent(symbol)}?timeframe=${timeframe}&limit=${limit}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to fetch OHLCV' }));
      throw new Error(err.detail || 'Failed to fetch OHLCV');
    }
    return res.json();
  },

  // User Watchlist
  async getUserWatchlist(): Promise<any[]> {
    const res = await fetchWithTimeout(`${API_BASE}/user/watchlist`, {
      headers: this.getAuthHeaders(),
    });
    if (!res.ok) return [];
    return res.json();
  },

  async addToUserWatchlist(symbol: string, market: string = 'NEPSE') {
    const res = await fetchWithTimeout(`${API_BASE}/user/watchlist`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ symbol, market }),
    });
    return res.json();
  },

  async removeFromUserWatchlist(symbol: string) {
    const res = await fetchWithTimeout(`${API_BASE}/user/watchlist/${encodeURIComponent(symbol)}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
    return res.json();
  },

  // AI Voice Assistant with Multi-Turn Conversation History
  async askAssistant(
    message: string,
    symbol: string = 'NABIL',
    market: string = 'NEPSE',
    language: string = 'en',
    history: Array<{ role: string; content: string }> = []
  ) {
    const res = await fetchWithTimeout(`${API_BASE}/assistant/chat`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ message, symbol, market, language, history }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Assistant failed' }));
      throw new Error(err.detail || 'Assistant error');
    }
    return res.json();
  },
};
