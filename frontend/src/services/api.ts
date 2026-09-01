import {
  MarketType,
  Timeframe,
  MarketStatus,
  SymbolInfo,
  OHLCVResponse,
  User,
  Conversation,
  TradingPosition,
  TradeOrder,
} from '../types';

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

  // ── Auth Endpoints ─────────────────────────────────────────────────────────
  async login(username_or_email: string, password: string) {
    const res = await fetchWithTimeout(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username_or_email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Invalid username or password.' }));
      throw new Error(err.detail || 'Invalid username or password.');
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

  async getMyProfile(): Promise<User> {
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

  async logout() {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
      });
    } catch (_) {}
    this.clearToken();
  },

  // ── Market Endpoints ───────────────────────────────────────────────────────
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

  // ── User Watchlist ─────────────────────────────────────────────────────────
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

  // ── AI Personal Assistant ──────────────────────────────────────────────────
  async askAssistant(payload: {
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
  }) {
    const res = await fetchWithTimeout(`${API_BASE}/assistant/chat`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Assistant error' }));
      throw new Error(err.detail || 'Assistant error');
    }
    return res.json();
  },

  // ── User Memory ────────────────────────────────────────────────────────────
  async getMemories(): Promise<any[]> {
    const res = await fetchWithTimeout(`${API_BASE}/user/memory`, {
      headers: this.getAuthHeaders(),
    });
    if (!res.ok) return [];
    return res.json();
  },

  async createMemory(memory_key: string, memory_value: string, category: string = 'GENERAL') {
    const res = await fetchWithTimeout(`${API_BASE}/user/memory`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ memory_key, memory_value, category }),
    });
    return res.json();
  },

  async toggleMemory(id: number) {
    const res = await fetchWithTimeout(`${API_BASE}/user/memory/${id}/toggle`, {
      method: 'PATCH',
      headers: this.getAuthHeaders(),
    });
    return res.json();
  },

  async deleteMemory(id: number) {
    const res = await fetchWithTimeout(`${API_BASE}/user/memory/${id}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
    return res.json();
  },

  async deleteAllMemories() {
    const res = await fetchWithTimeout(`${API_BASE}/user/memory`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
    return res.json();
  },

  // ── Projects Workspace ─────────────────────────────────────────────────────
  async getProjects(): Promise<any[]> {
    const res = await fetchWithTimeout(`${API_BASE}/projects`, {
      headers: this.getAuthHeaders(),
    });
    if (!res.ok) return [];
    return res.json();
  },

  async createProject(name: string, description: string = '', instructions: string = '') {
    const res = await fetchWithTimeout(`${API_BASE}/projects`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ name, description, instructions }),
    });
    return res.json();
  },

  async getProject(id: string) {
    const res = await fetchWithTimeout(`${API_BASE}/projects/${id}`, {
      headers: this.getAuthHeaders(),
    });
    return res.json();
  },

  async addProjectItem(projectId: string, item_type: string, title: string, content: string = '') {
    const res = await fetchWithTimeout(`${API_BASE}/projects/${projectId}/items`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ item_type, title, content }),
    });
    return res.json();
  },

  async deleteProject(id: string) {
    const res = await fetchWithTimeout(`${API_BASE}/projects/${id}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
    return res.json();
  },

  // ── Conversation Memory ────────────────────────────────────────────────────
  async getConversations(): Promise<Conversation[]> {
    const res = await fetchWithTimeout(`${API_BASE}/conversations`, {
      headers: this.getAuthHeaders(),
    });
    if (!res.ok) return [];
    return res.json();
  },

  async createConversation(title: string = 'New Conversation'): Promise<Conversation> {
    const res = await fetchWithTimeout(`${API_BASE}/conversations`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error('Failed to create conversation');
    return res.json();
  },

  async getConversation(id: string): Promise<Conversation> {
    const res = await fetchWithTimeout(`${API_BASE}/conversations/${id}`, {
      headers: this.getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch conversation');
    return res.json();
  },

  async renameConversation(id: string, title: string) {
    const res = await fetchWithTimeout(`${API_BASE}/conversations/${id}`, {
      method: 'PATCH',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ title }),
    });
    return res.json();
  },

  async deleteConversation(id: string) {
    const res = await fetchWithTimeout(`${API_BASE}/conversations/${id}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
    return res.json();
  },

  async searchConversations(q: string) {
    const res = await fetchWithTimeout(`${API_BASE}/conversations/search?q=${encodeURIComponent(q)}`, {
      headers: this.getAuthHeaders(),
    });
    if (!res.ok) return [];
    return res.json();
  },

  // ── Controlled Trading & Positions ─────────────────────────────────────────
  async getTradingPositions(): Promise<TradingPosition[]> {
    const res = await fetchWithTimeout(`${API_BASE}/trading/positions`, {
      headers: this.getAuthHeaders(),
    });
    if (!res.ok) return [];
    return res.json();
  },

  async getTradingOrders(): Promise<TradeOrder[]> {
    const res = await fetchWithTimeout(`${API_BASE}/trading/orders`, {
      headers: this.getAuthHeaders(),
    });
    if (!res.ok) return [];
    return res.json();
  },

  async placeOrder(payload: {
    symbol: string;
    market?: string;
    order_type?: string;
    quantity: number;
    price: number;
    stop_loss?: number;
    target?: number;
    confirmed: boolean;
  }) {
    const res = await fetchWithTimeout(`${API_BASE}/trading/order`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Order execution failed' }));
      throw new Error(err.detail || 'Order execution failed');
    }
    return res.json();
  },

  async modifyPosition(position_id: string, stop_loss?: number, target?: number) {
    const res = await fetchWithTimeout(`${API_BASE}/trading/modify-position`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ position_id, stop_loss, target }),
    });
    return res.json();
  },

  async closePosition(position_id: string, exit_price?: number, confirmed: boolean = true) {
    const res = await fetchWithTimeout(`${API_BASE}/trading/close-position`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ position_id, exit_price, confirmed }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to close position' }));
      throw new Error(err.detail || 'Failed to close position');
    }
    return res.json();
  },

  async toggleEmergencyStop(enabled: boolean) {
    const res = await fetchWithTimeout(`${API_BASE}/trading/emergency-stop`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ enabled }),
    });
    return res.json();
  },
};
