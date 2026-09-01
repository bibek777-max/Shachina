import React, { useState, useEffect } from 'react';
import { TradingPosition, TradeOrder, ClosedTrade, PortfolioSummary } from '../types';
import { api } from '../services/api';
import {
  Briefcase,
  ListOrdered,
  ShieldAlert,
  History,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Power,
  Edit2,
  X,
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart,
  Sliders,
} from 'lucide-react';

interface TradingPanelProps {
  positions: TradingPosition[];
  orders: TradeOrder[];
  emergencyStop: boolean;
  onRefresh: () => void;
  onEmergencyStopToggle: (enabled: boolean) => void;
}

export const TradingPanel: React.FC<TradingPanelProps> = ({
  positions,
  orders,
  emergencyStop,
  onRefresh,
  onEmergencyStopToggle,
}) => {
  const [activeTab, setActiveTab] = useState<'positions' | 'orders' | 'history' | 'risk'>('positions');
  const [closingId, setClosingId] = useState<string | null>(null);
  const [modifyingPos, setModifyingPos] = useState<TradingPosition | null>(null);
  const [newSl, setNewSl] = useState<string>('');
  const [newTarget, setNewTarget] = useState<string>('');
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Trade History & Portfolio State
  const [history, setHistory] = useState<ClosedTrade[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [isEditingRisk, setIsEditingRisk] = useState<boolean>(false);
  const [riskPct, setRiskPct] = useState<string>('1.0');
  const [maxLossPct, setMaxLossPct] = useState<string>('3.0');
  const [minRr, setMinRr] = useState<string>('2.0');

  // Load History and Portfolio
  const loadHistoryAndPortfolio = async () => {
    try {
      setLoadingHistory(true);
      const [hist, port] = await Promise.all([
        api.getTradeHistory().catch(() => []),
        api.getPortfolioSummary().catch(() => null),
      ]);
      setHistory(hist);
      if (port) {
        setPortfolio(port);
        setRiskPct(port.risk_percentage?.toString() || '1.0');
        setMaxLossPct(port.max_daily_loss?.toString() || '3.0');
        setMinRr(port.min_risk_reward?.toString() || '2.0');
      }
    } catch (err) {
      console.error('Failed to load history/portfolio:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistoryAndPortfolio();
  }, [positions, orders]);

  // Auto-refresh interval every 6 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      onRefresh();
      if (activeTab === 'history' || activeTab === 'risk') {
        loadHistoryAndPortfolio();
      }
    }, 6000);
    return () => clearInterval(interval);
  }, [activeTab, onRefresh]);

  const handleClosePosition = async (posId: string) => {
    try {
      setClosingId(posId);
      const res = await api.closePosition(posId, undefined, true);
      setActionMsg(res.message);
      onRefresh();
      loadHistoryAndPortfolio();
      setTimeout(() => setActionMsg(null), 3500);
    } catch (err: any) {
      setActionMsg(err.message || 'Failed to close position');
      setTimeout(() => setActionMsg(null), 3500);
    } finally {
      setClosingId(null);
    }
  };

  const handleModifyPosition = async () => {
    if (!modifyingPos) return;
    try {
      await api.modifyPosition(
        modifyingPos.id,
        newSl ? parseFloat(newSl) : undefined,
        newTarget ? parseFloat(newTarget) : undefined
      );
      setActionMsg('Position parameters updated.');
      setModifyingPos(null);
      onRefresh();
      setTimeout(() => setActionMsg(null), 3000);
    } catch (err: any) {
      setActionMsg(err.message || 'Failed to update position');
      setTimeout(() => setActionMsg(null), 3000);
    }
  };

  const handleSaveRiskSettings = async () => {
    try {
      await api.updateTradingSettings({
        risk_percentage: parseFloat(riskPct),
        max_daily_loss: parseFloat(maxLossPct),
        min_risk_reward: parseFloat(minRr),
      });
      setActionMsg('Risk settings updated successfully.');
      setIsEditingRisk(false);
      loadHistoryAndPortfolio();
      setTimeout(() => setActionMsg(null), 3000);
    } catch (err: any) {
      setActionMsg(err.message || 'Failed to update risk settings');
      setTimeout(() => setActionMsg(null), 3000);
    }
  };

  const totalUnrealizedPnl = positions.reduce((acc, p) => acc + (p.unrealized_pnl || 0), 0);

  return (
    <div className="h-full flex flex-col bg-[#080d18] border-t border-[#1c2438] text-slate-100 select-none font-['Plus_Jakarta_Sans',sans-serif]">
      {/* ── Top Tabs & Status Bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#050811] border-b border-[#141c2e] text-xs font-mono">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setActiveTab('positions')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition-colors shrink-0 ${
              activeTab === 'positions'
                ? 'bg-[#121929] text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>Open Positions ({positions.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('orders')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition-colors shrink-0 ${
              activeTab === 'orders'
                ? 'bg-[#121929] text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5" />
            <span>Order Book ({orders.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('history');
              loadHistoryAndPortfolio();
            }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition-colors shrink-0 ${
              activeTab === 'history'
                ? 'bg-[#121929] text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Trade History ({history.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('risk');
              loadHistoryAndPortfolio();
            }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition-colors shrink-0 ${
              activeTab === 'risk'
                ? 'bg-[#121929] text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Risk & Portfolio</span>
          </button>
        </div>

        {/* Right Status & Emergency Kill Switch */}
        <div className="flex items-center gap-3 shrink-0">
          {actionMsg && (
            <span className="text-[11px] text-cyan-300 font-bold animate-pulse">
              ✓ {actionMsg}
            </span>
          )}

          {positions.length > 0 && (
            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-slate-400">Open P/L:</span>
              <span
                className={`font-extrabold ${
                  totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {totalUnrealizedPnl >= 0 ? '+' : ''}
                NPR {totalUnrealizedPnl.toFixed(2)}
              </span>
            </div>
          )}

          {/* Emergency Kill Switch */}
          <button
            onClick={() => onEmergencyStopToggle(!emergencyStop)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-extrabold border transition-all ${
              emergencyStop
                ? 'bg-rose-600 text-white border-rose-400 animate-pulse'
                : 'bg-[#141b2e] text-slate-300 border-slate-700 hover:border-rose-500'
            }`}
            title="Emergency Kill Switch: Halts all new trading executions"
          >
            <Power className="w-3 h-3" />
            {emergencyStop ? 'KILL SWITCH ACTIVE' : 'KILL SWITCH OFF'}
          </button>

          <button
            onClick={() => {
              onRefresh();
              loadHistoryAndPortfolio();
            }}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
            title="Refresh trading data"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Tab Content ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-2 text-xs font-mono">
        {/* TAB 1: POSITIONS */}
        {activeTab === 'positions' && (
          positions.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs gap-1">
              <span>No active open positions.</span>
              <span className="text-[11px] text-slate-600">Ask Shachina AI to analyze setups or confirm an order.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-slate-500 border-b border-[#141c2e] text-[10px] uppercase">
                    <th className="pb-1.5">Symbol</th>
                    <th className="pb-1.5">Market</th>
                    <th className="pb-1.5">Direction</th>
                    <th className="pb-1.5">Qty</th>
                    <th className="pb-1.5">Entry (NPR)</th>
                    <th className="pb-1.5">LTP (NPR)</th>
                    <th className="pb-1.5">Stop Loss</th>
                    <th className="pb-1.5">Target</th>
                    <th className="pb-1.5">Unrealized P/L</th>
                    <th className="pb-1.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#141c2e]">
                  {positions.map((p) => (
                    <tr key={p.id} className="hover:bg-[#0d1526]/50 transition-colors">
                      <td className="py-2 font-extrabold text-cyan-300">{p.symbol}</td>
                      <td className="py-2 text-slate-400">{p.market}</td>
                      <td className="py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                          p.direction === 'LONG'
                            ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                            : 'bg-rose-950 text-rose-400 border-rose-800'
                        }`}>
                          {p.direction}
                        </span>
                      </td>
                      <td className="py-2 text-slate-200">{p.quantity}</td>
                      <td className="py-2 text-slate-200">{p.entry_price.toFixed(2)}</td>
                      <td className="py-2 text-white font-bold">{p.current_price.toFixed(2)}</td>
                      <td className="py-2 text-rose-400">{p.stop_loss ? p.stop_loss.toFixed(2) : '-'}</td>
                      <td className="py-2 text-emerald-400">{p.target ? p.target.toFixed(2) : '-'}</td>
                      <td className="py-2 font-bold">
                        <span className={p.unrealized_pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {p.unrealized_pnl >= 0 ? '+' : ''}
                          NPR {p.unrealized_pnl.toFixed(2)} ({p.unrealized_pnl_pct >= 0 ? '+' : ''}{p.unrealized_pnl_pct.toFixed(2)}%)
                        </span>
                      </td>
                      <td className="py-2 text-right space-x-1.5">
                        <button
                          onClick={() => {
                            setModifyingPos(p);
                            setNewSl(p.stop_loss?.toString() || '');
                            setNewTarget(p.target?.toString() || '');
                          }}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
                        >
                          Modify
                        </button>
                        <button
                          onClick={() => handleClosePosition(p.id)}
                          disabled={closingId === p.id}
                          className="px-2 py-0.5 rounded bg-rose-950 hover:bg-rose-800 border border-rose-700 text-rose-300 text-[10px] font-bold"
                        >
                          {closingId === p.id ? 'Closing...' : 'Close'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* TAB 2: ORDER BOOK */}
        {activeTab === 'orders' && (
          orders.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-xs">
              No orders recorded in session history.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-slate-500 border-b border-[#141c2e] text-[10px] uppercase">
                    <th className="pb-1.5">Order ID</th>
                    <th className="pb-1.5">Symbol</th>
                    <th className="pb-1.5">Type</th>
                    <th className="pb-1.5">Qty</th>
                    <th className="pb-1.5">Price</th>
                    <th className="pb-1.5">Execution Mode</th>
                    <th className="pb-1.5">Status</th>
                    <th className="pb-1.5 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#141c2e]">
                  {orders.map((o) => (
                    <tr key={o.id} className="hover:bg-[#0d1526]/50">
                      <td className="py-2 font-mono text-[11px] text-slate-400">{o.id}</td>
                      <td className="py-2 font-bold text-white">{o.symbol}</td>
                      <td className="py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          o.order_type === 'BUY' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}>
                          {o.order_type}
                        </span>
                      </td>
                      <td className="py-2">{o.quantity}</td>
                      <td className="py-2 font-bold">NPR {o.price.toFixed(2)}</td>
                      <td className="py-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                          o.execution_mode === 'LIVE_BROKER' ? 'bg-cyan-950 text-cyan-300 border border-cyan-700' : 'bg-amber-950 text-amber-300 border border-amber-800'
                        }`}>
                          {o.execution_mode === 'LIVE_BROKER' ? '⚡ LIVE BROKER' : '🛡️ SIMULATED PAPER'}
                        </span>
                      </td>
                      <td className="py-2">
                        <span className={`font-bold ${o.status === 'FILLED' ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {o.status === 'FILLED' ? '✓ FILLED' : `✕ ${o.status}`}
                        </span>
                      </td>
                      <td className="py-2 text-right text-slate-500 text-[10px]">
                        {new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* TAB 3: TRADE HISTORY */}
        {activeTab === 'history' && (
          history.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs gap-1">
              <span>No closed trades in history yet.</span>
              <span className="text-[11px] text-slate-600">When you close open positions, their realized P/L will be logged here.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-slate-500 border-b border-[#141c2e] text-[10px] uppercase">
                    <th className="pb-1.5">Symbol</th>
                    <th className="pb-1.5">Direction</th>
                    <th className="pb-1.5">Qty</th>
                    <th className="pb-1.5">Entry Price</th>
                    <th className="pb-1.5">Exit Price</th>
                    <th className="pb-1.5">Realized P/L</th>
                    <th className="pb-1.5">Result</th>
                    <th className="pb-1.5 text-right">Closed At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#141c2e]">
                  {history.map((h) => {
                    const isWin = h.realized_pnl >= 0;
                    return (
                      <tr key={h.id} className="hover:bg-[#0d1526]/50">
                        <td className="py-2 font-extrabold text-cyan-300">{h.symbol}</td>
                        <td className="py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                            h.direction === 'LONG' ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-rose-950 text-rose-400 border-rose-800'
                          }`}>
                            {h.direction}
                          </span>
                        </td>
                        <td className="py-2 text-slate-200">{h.quantity}</td>
                        <td className="py-2 text-slate-300">NPR {h.entry_price.toFixed(2)}</td>
                        <td className="py-2 text-white font-bold">NPR {h.exit_price.toFixed(2)}</td>
                        <td className="py-2 font-extrabold">
                          <span className={isWin ? 'text-emerald-400' : 'text-rose-400'}>
                            {isWin ? '+' : ''}NPR {h.realized_pnl.toFixed(2)}
                          </span>
                        </td>
                        <td className="py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            isWin ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'
                          }`}>
                            {isWin ? '🏆 PROFIT' : '🛑 LOSS'}
                          </span>
                        </td>
                        <td className="py-2 text-right text-slate-500 text-[10px]">
                          {h.closed_at ? new Date(h.closed_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* TAB 4: RISK & PORTFOLIO */}
        {activeTab === 'risk' && (
          <div className="space-y-3 p-1">
            {/* Portfolio Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              <div className="bg-[#0b101e] border border-[#1c2438] p-3 rounded-xl">
                <span className="text-slate-400 text-[10px] block flex items-center gap-1">
                  <DollarSign className="w-3 h-3 text-cyan-400" /> Account Equity
                </span>
                <span className="text-sm font-extrabold text-cyan-300">
                  NPR {portfolio?.account_equity ? portfolio.account_equity.toLocaleString() : '1,000,000'}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Initial: NPR {portfolio?.account_size ? portfolio.account_size.toLocaleString() : '1,000,000'}</span>
              </div>

              <div className="bg-[#0b101e] border border-[#1c2438] p-3 rounded-xl">
                <span className="text-slate-400 text-[10px] block flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-emerald-400" /> Total Net P/L
                </span>
                <span className={`text-sm font-extrabold ${(portfolio?.net_pnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {(portfolio?.net_pnl || 0) >= 0 ? '+' : ''}NPR {(portfolio?.net_pnl || 0).toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Realized: NPR {(portfolio?.total_realized_pnl || 0).toFixed(2)}
                </span>
              </div>

              <div className="bg-[#0b101e] border border-[#1c2438] p-3 rounded-xl">
                <span className="text-slate-400 text-[10px] block flex items-center gap-1">
                  <PieChart className="w-3 h-3 text-amber-400" /> Win Rate
                </span>
                <span className="text-sm font-extrabold text-amber-300">
                  {portfolio?.win_rate || 0}%
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">{portfolio?.closed_trades || 0} closed trades</span>
              </div>

              <div className="bg-[#0b101e] border border-[#1c2438] p-3 rounded-xl">
                <span className="text-slate-400 text-[10px] block flex items-center gap-1">
                  <Briefcase className="w-3 h-3 text-indigo-400" /> Active Exposure
                </span>
                <span className="text-sm font-extrabold text-indigo-300">
                  {positions.length} / 5 Positions
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Unrealized: NPR {totalUnrealizedPnl.toFixed(2)}</span>
              </div>
            </div>

            {/* Risk Control Settings */}
            <div className="bg-[#0b101e] border border-[#1c2438] p-3.5 rounded-xl space-y-3">
              <div className="flex items-center justify-between border-b border-[#141c2e] pb-2">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  <span className="font-bold text-slate-200">Institutional Risk Management Parameters</span>
                </div>
                {!isEditingRisk ? (
                  <button
                    onClick={() => setIsEditingRisk(true)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[11px] font-bold"
                  >
                    Edit Rules
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setIsEditingRisk(false)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-400 text-[11px]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveRiskSettings}
                      className="px-2.5 py-1 rounded-lg bg-cyan-400 text-black font-extrabold text-[11px]"
                    >
                      Save Rules
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-[#070b16] p-2.5 rounded-lg border border-[#182236]">
                  <span className="text-slate-400 text-[10px] block mb-1">Max Capital Risk / Trade</span>
                  {isEditingRisk ? (
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="10"
                      value={riskPct}
                      onChange={(e) => setRiskPct(e.target.value)}
                      className="w-full bg-[#121929] border border-cyan-500/50 rounded px-2 py-1 text-cyan-300 font-bold"
                    />
                  ) : (
                    <span className="text-sm font-extrabold text-cyan-300">{riskPct}% of Equity</span>
                  )}
                  <p className="text-[10px] text-slate-500 mt-1">Automatic position size calculated based on exact stop loss distance.</p>
                </div>

                <div className="bg-[#070b16] p-2.5 rounded-lg border border-[#182236]">
                  <span className="text-slate-400 text-[10px] block mb-1">Daily Drawdown Circuit Breaker</span>
                  {isEditingRisk ? (
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="20"
                      value={maxLossPct}
                      onChange={(e) => setMaxLossPct(e.target.value)}
                      className="w-full bg-[#121929] border border-rose-500/50 rounded px-2 py-1 text-rose-300 font-bold"
                    />
                  ) : (
                    <span className="text-sm font-extrabold text-rose-400">{maxLossPct}% Max Loss</span>
                  )}
                  <p className="text-[10px] text-slate-500 mt-1">Trading halts automatically if daily drawdown hits {maxLossPct}%.</p>
                </div>

                <div className="bg-[#070b16] p-2.5 rounded-lg border border-[#182236]">
                  <span className="text-slate-400 text-[10px] block mb-1">Minimum Risk / Reward</span>
                  {isEditingRisk ? (
                    <input
                      type="number"
                      step="0.1"
                      min="1.0"
                      max="10"
                      value={minRr}
                      onChange={(e) => setMinRr(e.target.value)}
                      className="w-full bg-[#121929] border border-emerald-500/50 rounded px-2 py-1 text-emerald-300 font-bold"
                    />
                  ) : (
                    <span className="text-sm font-extrabold text-emerald-400">1 : {minRr} Minimum</span>
                  )}
                  <p className="text-[10px] text-slate-500 mt-1">Setups below 1:{minRr} R:R are automatically rejected by Shachina.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Modify Position Modal ──────────────────────────────────────────── */}
      {modifyingPos && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0e1424] border border-[#1d273f] rounded-2xl p-5 w-full max-w-sm space-y-4 text-xs font-mono shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1c2438] pb-2">
              <h4 className="font-extrabold text-cyan-300">Modify {modifyingPos.symbol} Levels</h4>
              <button onClick={() => setModifyingPos(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Stop Loss (NPR)</label>
              <input
                type="number"
                step="0.1"
                value={newSl}
                onChange={(e) => setNewSl(e.target.value)}
                placeholder="e.g. 520.0"
                className="w-full bg-[#141b2e] border border-[#202b46] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Target Price (NPR)</label>
              <input
                type="number"
                step="0.1"
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
                placeholder="e.g. 580.0"
                className="w-full bg-[#141b2e] border border-[#202b46] rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setModifyingPos(null)}
                className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleModifyPosition}
                className="flex-1 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-extrabold"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
