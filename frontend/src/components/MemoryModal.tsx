import React, { useState, useEffect } from 'react';
import { X, Database, Plus, Trash2, Check, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { UserMemoryItem } from '../types';

interface MemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MemoryModal: React.FC<MemoryModalProps> = ({ isOpen, onClose }) => {
  const [memories, setMemories] = useState<UserMemoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [newKey, setNewKey] = useState<string>('');
  const [newValue, setNewValue] = useState<string>('');
  const [category, setCategory] = useState<string>('PREFERENCES');

  const loadMemories = async () => {
    setIsLoading(true);
    try {
      const data = await api.getMemories();
      setMemories(data);
    } catch (err) {
      console.error('Failed to load memories:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) loadMemories();
  }, [isOpen]);

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;
    try {
      const created = await api.createMemory(newKey, newValue, category);
      setMemories((prev) => [created, ...prev]);
      setNewKey('');
      setNewValue('');
    } catch (err) {
      console.error('Failed to add memory:', err);
    }
  };

  const handleToggle = async (id: number) => {
    try {
      const updated = await api.toggleMemory(id);
      setMemories((prev) =>
        prev.map((m) => (m.id === id ? { ...m, is_enabled: updated.is_enabled } : m))
      );
    } catch (err) {
      console.error('Failed to toggle memory:', err);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.deleteMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      console.error('Failed to delete memory:', err);
    }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm('Are you sure you want to delete ALL AI memories?')) return;
    try {
      await api.deleteAllMemories();
      setMemories([]);
    } catch (err) {
      console.error('Failed to delete all memories:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 select-none font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="w-full max-w-xl bg-[#090e1c] border border-[#1e2a44] rounded-3xl p-6 shadow-2xl space-y-5 text-slate-200 font-mono text-xs">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#16233b] pb-3">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-cyan-400" />
            <h3 className="font-extrabold text-base text-white">AI Memory Management</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[#16233b] text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-slate-400 text-xs leading-relaxed font-sans">
          SHACHINA remembers your preferences and style across conversations to provide personalized intelligence. You have full control to view, disable, or delete memories.
        </p>

        {/* Add Memory Form */}
        <form onSubmit={handleAddMemory} className="p-3.5 rounded-2xl bg-[#0d1424] border border-[#1c2944] space-y-2.5">
          <span className="font-bold text-cyan-300 block text-[11px]">➕ Add New Memory</span>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Key (e.g. Preferred Language)"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="bg-[#050812] border border-[#1e2a44] rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-[#050812] border border-[#1e2a44] rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
            >
              <option value="PREFERENCES">Preferences</option>
              <option value="TRADING_STYLE">Trading Style</option>
              <option value="PERSONAL">Personal</option>
              <option value="GENERAL">General</option>
            </select>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Value (e.g. Speak Nepali+Hindi, 1H timeframe)"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              className="flex-1 bg-[#050812] border border-[#1e2a44] rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              disabled={!newKey.trim() || !newValue.trim()}
              className="px-4 py-1.5 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-40 text-black font-extrabold rounded-xl transition-all"
            >
              Save
            </button>
          </div>
        </form>

        {/* Memory List */}
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-6 gap-2 text-cyan-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading memories...</span>
            </div>
          ) : memories.length === 0 ? (
            <div className="text-center py-6 text-slate-500">No memories stored yet.</div>
          ) : (
            memories.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between p-3 rounded-xl bg-[#0b1120] border border-[#1a263f] hover:border-cyan-500/30 transition-all"
              >
                <div className="space-y-0.5 flex-1 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-xs">{m.memory_key}</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                      {m.category}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300">{m.memory_value}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggle(m.id)}
                    className="p-1 text-cyan-400 hover:text-cyan-300"
                    title={m.is_enabled ? 'Disable memory' : 'Enable memory'}
                  >
                    {m.is_enabled ? <ToggleRight className="w-6 h-6 text-cyan-400" /> : <ToggleLeft className="w-6 h-6 text-slate-600" />}
                  </button>
                  <button
                    onClick={() => handleDelete(m.id)}
                    className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#16233b] pt-3">
          {memories.length > 0 && (
            <button
              onClick={handleDeleteAll}
              className="text-rose-400 hover:text-rose-300 text-[11px] font-bold"
            >
              Delete All Memories
            </button>
          )}
          <button
            onClick={onClose}
            className="ml-auto px-4 py-1.5 bg-[#16233b] hover:bg-[#203152] text-slate-200 font-bold rounded-xl"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
