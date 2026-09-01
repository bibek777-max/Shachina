import React, { useState, useEffect } from 'react';
import { TradingPosition, TradeOrder } from '../types';
import { api } from '../services/api';
import {
  Briefcase,
  ListOrdered,
  ShieldAlert,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Power,
  Edit2,
  X,
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
  const [activeTab, setActiveTab] = useState<'positions' | 'orders' | 'risk'>('positions');
  const [closingId, setClosingId] = useState<string | null>(null);
  const [modifyingPos, setModifyingPos] = useState<TradingPosition | null>(null);
  const [newSl, setNewSl] = useState<string>('');
  const [newTarget, setNewTarget] = useState<string>('');
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const handleClosePosition = async (posId: string) => {
    try {
      setClosingId(posId);
      const res = await api.closePosition(posId, undefined, true);
      setActionMsg(res.message);
      onRefresh();
      setTimeout(() => setActionMsg(null), 3000);
    } catch (err: any) {
      setActionMsg(err.message || 'Failed to close position');
      setTimeout(() => setActionMsg(null), 3000);
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

  const totalUnrealizedPnl = positions.reduce((acc, p) => acc + p.unrealized_pnl, 0);

  return (
    <div className="h-full flex flex-col bg-[#080d18] border-t border-[#1c2438] text-slate-100 select-none font-['Plus_Jakarta_Sans',sans-serif]">
      {/* ── Top Tabs & Status Bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#050811] border-b border-[#141c2e] text-xs font-mono">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('positions')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition-colors ${
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
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition-colors ${
              activeTab === 'orders'
                ? 'bg-[#121929] text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5" />
            <span>Order Book ({orders.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('risk')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition-colors ${
              activeTab === 'risk'
                ? 'bg-[#121929] text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Risk Framework</span>
          </button>
        </div>

        {/* Right Status & Emergency Kill Switch */}
        <div className="flex items-center gap-3">
          {actionMsg && (
            <span className="text-[11px] text-cyan-300 font-bold animate-pulse">
              ✓ {actionMsg}
            </span>
          )}

          {positions.length > 0 && (
            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-slate-400">Total P/L:</span>
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
            onClick={onRefresh}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
            title="Refresh positions"
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
            <div className="h-full flex items-center justify-center text-slate-500 text-xs">
              No active open positions. Ask Shachina to analyze setups or place a trade.
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
                    <th className="pb-1.5">Entry</th>
                    <th className="pb-1.5">LTP</th>
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
                        <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 px-1.5 py-0.5 rounded text-[10px] font-bold">
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
                          {p.unrealized_pnl.toFixed(2)} ({p.unrealized_pnl_pct.toFixed(1)}%)
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
                        <span className="text-emerald-400 font-bold">✓ {o.status}</span>
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

        {/* TAB 3: RISK RULES */}
        {activeTab === 'risk' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-1">
            <div className="bg-[#0b101e] border border-[#1c2438] p-3 rounded-xl">
              <span className="text-slate-400 text-[10px] block">Capital Risk Rule</span>
              <span className="text-sm font-extrabold text-cyan-300">Max 1.0% / Trade</span>
              <p className="text-[10px] text-slate-500 mt-1">Automatic position size calculated based on exact stop loss distance.</p>
            </div>
            <div className="bg-[#0b101e] border border-[#1c2438] p-3 rounded-xl">
              <span className="text-slate-400 text-[10px] block">Daily Loss Circuit Breaker</span>
              <span className="text-sm font-extrabold text-rose-400">3.0% Max Loss</span>
              <p className="text-[10px] text-slate-500 mt-1">Trading halts automatically if daily drawdown hits 3%.</p>
            </div>
            <div className="bg-[#0b101e] border border-[#1c2438] p-3 rounded-xl">
              <span className="text-slate-400 text-[10px] block">Minimum Risk/Reward</span>
              <span className="text-sm font-extrabold text-emerald-400">1 : 2.0 Minimum</span>
              <p className="text-[10px] text-slate-500 mt-1">Setups below 1:2 R:R are automatically rejected by Shachina.</p>
            </div>
            <div className="bg-[#0b101e] border border-[#1c2438] p-3 rounded-xl">
              <span className="text-slate-400 text-[10px] block">Execution Mode</span>
              <span className="text-sm font-extrabold text-amber-400">Institutional Safety</span>
              <p className="text-[10px] text-slate-500 mt-1">2-Step explicit user authorization required prior to any order fill.</p>
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
