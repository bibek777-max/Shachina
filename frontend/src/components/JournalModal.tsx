import React, { useState, useEffect } from 'react';
import { X, BookOpen, Plus, Trash2, Loader2 } from 'lucide-react';
import { api } from '../services/api';

interface JournalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const JournalModal: React.FC<JournalModalProps> = ({ isOpen, onClose }) => {
  const [journals, setJournals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [symbol, setSymbol] = useState<string>('NABIL');
  const [market, setMarket] = useState<string>('NEPSE');
  const [direction, setDirection] = useState<string>('BUY');
  const [entryPrice, setEntryPrice] = useState<string>('');
  const [exitPrice, setExitPrice] = useState<string>('');
  const [pnl, setPnl] = useState<string>('');
  const [strategy, setStrategy] = useState<string>('Liquidity Sweep + BOS');
  const [notes, setNotes] = useState<string>('');

  const loadJournal = async () => {
    setIsLoading(true);
    try {
      const data = await api.getMyJournal();
      setJournals(data || []);
    } catch (err) {
      console.error('Failed to load journal:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) loadJournal();
  }, [isOpen]);

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol.trim() || !entryPrice.trim()) return;
    try {
      await api.createJournalEntry({
        symbol: symbol.toUpperCase(),
        market,
        direction,
        entry_price: parseFloat(entryPrice),
        exit_price: exitPrice ? parseFloat(exitPrice) : undefined,
        pnl: pnl ? parseFloat(pnl) : undefined,
        strategy,
        notes,
      });
      setEntryPrice('');
      setExitPrice('');
      setPnl('');
      setNotes('');
      loadJournal();
    } catch (err) {
      console.error('Failed to add journal entry:', err);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.deleteJournalEntry(id);
      setJournals((prev) => prev.filter((j) => j.id !== id));
    } catch (err) {
      console.error('Failed to delete journal entry:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="w-full max-w-2xl bg-[#090e1c] border border-[#1b2742] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-[#1b2742] flex items-center justify-between bg-[#0c1324]">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-cyan-400" />
            <h2 className="text-sm font-bold text-white font-mono">Personal Trading Journal</h2>
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
          {/* Add New Entry Form */}
          <form onSubmit={handleAddEntry} className="p-4 rounded-xl bg-[#0e162a] border border-[#1d2b4a] space-y-3 font-mono text-xs">
            <h3 className="font-bold text-cyan-300 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              <span>Log Trade Execution / Setup</span>
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
                <label className="text-slate-400 block mb-1">Direction</label>
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value)}
                  className="w-full bg-[#141d33] border border-[#233354] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="BUY">BUY / LONG</option>
                  <option value="SELL">SELL / SHORT</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Entry (NPR)</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="540"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  className="w-full bg-[#141d33] border border-[#233354] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Exit (Optional)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="580"
                  value={exitPrice}
                  onChange={(e) => setExitPrice(e.target.value)}
                  className="w-full bg-[#141d33] border border-[#233354] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-slate-400 block mb-1">Strategy / Confluence</label>
                <input
                  type="text"
                  placeholder="e.g. Liquidity Sweep + FVG"
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                  className="w-full bg-[#141d33] border border-[#233354] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Realized PnL (NPR)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. +4500"
                  value={pnl}
                  onChange={(e) => setPnl(e.target.value)}
                  className="w-full bg-[#141d33] border border-[#233354] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">Trading Notes & Psychology</label>
              <textarea
                rows={2}
                placeholder="Observed strong buyer displacement on 15m candle. Followed 1% risk rule."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-[#141d33] border border-[#233354] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-400 resize-none"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-black font-extrabold rounded-lg transition-all cursor-pointer"
            >
              SAVE JOURNAL ENTRY
            </button>
          </form>

          {/* Journal Entries List */}
          <div className="space-y-2">
            <h3 className="font-mono text-xs font-bold text-slate-300 uppercase tracking-wider">
              Recorded Trade Entries ({journals.length})
            </h3>

            {isLoading ? (
              <div className="flex items-center justify-center p-8 text-slate-500 font-mono text-xs">
                <Loader2 className="w-4 h-4 animate-spin mr-2 text-cyan-400" />
                Loading journal...
              </div>
            ) : journals.length === 0 ? (
              <div className="p-8 text-center text-slate-500 font-mono text-xs border border-dashed border-[#1e2a44] rounded-xl">
                No trading journal entries yet. Log your trades above to track your discipline and PnL.
              </div>
            ) : (
              journals.map((j) => (
                <div key={j.id} className="p-3 bg-[#0d1424] border border-[#1b2742] rounded-xl font-mono text-xs space-y-1 relative group">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">{j.symbol}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${j.direction === 'BUY' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'}`}>
                        {j.direction}
                      </span>
                      <span className="text-slate-400 text-[11px]">Entry: NPR {j.entry_price}</span>
                      {j.exit_price && <span className="text-slate-400 text-[11px]">→ Exit: NPR {j.exit_price}</span>}
                    </div>

                    <div className="flex items-center gap-2">
                      {j.pnl !== null && j.pnl !== undefined && (
                        <span className={`font-bold ${j.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {j.pnl >= 0 ? `+NPR ${j.pnl}` : `-NPR ${Math.abs(j.pnl)}`}
                        </span>
                      )}
                      <button
                        onClick={() => handleDelete(j.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                        title="Delete entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {j.strategy && (
                    <div className="text-[11px] text-cyan-400">
                      ⚡ Strategy: {j.strategy}
                    </div>
                  )}

                  {j.notes && (
                    <p className="text-[11px] text-slate-400 bg-[#090d18] p-2 rounded-lg border border-[#162035]">
                      {j.notes}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
