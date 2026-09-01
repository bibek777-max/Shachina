import React, { useState, useEffect } from 'react';
import { X, Bell, Plus, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

interface AlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AlertsModal: React.FC<AlertsModalProps> = ({ isOpen, onClose }) => {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [symbol, setSymbol] = useState<string>('NABIL');
  const [market, setMarket] = useState<string>('NEPSE');
  const [condition, setCondition] = useState<string>('ABOVE');
  const [targetValue, setTargetValue] = useState<string>('');
  const [alertType, setAlertType] = useState<string>('PRICE');

  const loadAlerts = async () => {
    setIsLoading(true);
    try {
      const data = await api.getMyAlerts();
      setAlerts(data || []);
    } catch (err) {
      console.error('Failed to load alerts:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) loadAlerts();
  }, [isOpen]);

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol.trim() || !targetValue.trim()) return;
    try {
      await api.createAlert({
        symbol: symbol.toUpperCase(),
        market,
        alert_type: alertType,
        condition,
        target_value: parseFloat(targetValue),
      });
      setTargetValue('');
      loadAlerts();
    } catch (err) {
      console.error('Failed to create alert:', err);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.deleteAlert(id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error('Failed to delete alert:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="w-full max-w-xl bg-[#090e1c] border border-[#1b2742] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-[#1b2742] flex items-center justify-between bg-[#0c1324]">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-bold text-white font-mono">Personal Price & Signal Alerts</h2>
            <span className="text-[10px] bg-cyan-950 border border-cyan-800 text-cyan-400 px-2 py-0.5 rounded font-mono font-bold">
              100% PRIVATE
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-5 flex-1">
          {/* Create Alert Form */}
          <form onSubmit={handleCreateAlert} className="p-4 rounded-xl bg-[#0e162a] border border-[#1d2b4a] space-y-3 font-mono text-xs">
            <h3 className="font-bold text-cyan-300 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              <span>Set Real-Time Alert</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="text-slate-400 block mb-1">Symbol</label>
                <input
                  type="text"
                  required
                  placeholder="NABIL"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  className="w-full bg-[#141d33] border border-[#233354] rounded-lg px-2.5 py-1.5 text-white uppercase focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Market</label>
                <select
                  value={market}
                  onChange={(e) => setMarket(e.target.value)}
                  className="w-full bg-[#141d33] border border-[#233354] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="NEPSE">NEPSE</option>
                  <option value="CRYPTO">CRYPTO</option>
                  <option value="US_STOCKS">US STOCKS</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Condition</label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="w-full bg-[#141d33] border border-[#233354] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="ABOVE">Price ≥ (Above)</option>
                  <option value="BELOW">Price ≤ (Below)</option>
                  <option value="BREAKOUT">Breakout Zone</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Target Price</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="560"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  className="w-full bg-[#141d33] border border-[#233354] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-black font-extrabold rounded-lg transition-all cursor-pointer"
            >
              CREATE PRIVATE ALERT
            </button>
          </form>

          {/* Alerts List */}
          <div className="space-y-2">
            <h3 className="font-mono text-xs font-bold text-slate-300 uppercase tracking-wider">
              Active Price & Signal Alerts ({alerts.length})
            </h3>

            {isLoading ? (
              <div className="flex items-center justify-center p-8 text-slate-500 font-mono text-xs">
                <Loader2 className="w-4 h-4 animate-spin mr-2 text-cyan-400" />
                Loading alerts...
              </div>
            ) : alerts.length === 0 ? (
              <div className="p-8 text-center text-slate-500 font-mono text-xs border border-dashed border-[#1e2a44] rounded-xl">
                No active price alerts. Add an alert above to get notified on key breakout levels.
              </div>
            ) : (
              alerts.map((a) => (
                <div key={a.id} className="p-3 bg-[#0d1424] border border-[#1b2742] rounded-xl font-mono text-xs flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
                    <div>
                      <span className="font-bold text-white mr-2">{a.symbol}</span>
                      <span className="text-slate-400">
                        {a.condition === 'ABOVE' ? '≥' : a.condition === 'BELOW' ? '≤' : '⚡'} NPR {a.target_value}
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        Market: {a.market} • Type: {a.alert_type}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDelete(a.id)}
                    className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                    title="Delete alert"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
