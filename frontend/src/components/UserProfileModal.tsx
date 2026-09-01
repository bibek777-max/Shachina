import React, { useState } from 'react';
import { api } from '../services/api';
import { User } from '../types';
import {
  X,
  User as UserIcon,
  Shield,
  Sliders,
  Mic,
  Languages,
  LogOut,
  CheckCircle2,
  Database,
  Lock,
} from 'lucide-react';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onLogout: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  onLogout,
}) => {
  const [tab, setTab] = useState<'profile' | 'trading' | 'voice' | 'security' | 'memory'>('profile');
  const [accountSize, setAccountSize] = useState<number>(1000000);
  const [riskPct, setRiskPct] = useState<number>(1.0);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  const handleSaveTrading = async () => {
    try {
      await api.updateTradingSettings({
        account_size: accountSize,
        risk_percentage: riskPct,
      });
      setSavedMsg('Trading risk rules updated.');
      setTimeout(() => setSavedMsg(null), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="bg-[#0f1424] border border-[#1e293b] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-[#1c2438] bg-[#0c101c] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center font-bold text-black text-sm">
              {user.full_name[0]}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-white text-sm">{user.full_name}</h3>
                <span className="text-[9px] bg-amber-950 text-amber-400 border border-amber-800 px-1.5 py-0.5 rounded font-mono font-bold">
                  {user.role}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">@{user.username} • {user.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#1c2438] bg-[#090d16] overflow-x-auto text-xs font-mono">
          {[
            { id: 'profile', label: 'Profile', icon: UserIcon },
            { id: 'trading', label: 'Trading & Risk', icon: Sliders },
            { id: 'voice', label: 'Voice & Lang', icon: Mic },
            { id: 'security', label: 'Security', icon: Lock },
            { id: 'memory', label: 'AI Memory', icon: Database },
          ].map((t) => {
            const Icon = t.icon;
            const isSel = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as any)}
                className={`flex items-center gap-1.5 px-4 py-2.5 border-b-2 font-semibold transition-colors whitespace-nowrap ${
                  isSel
                    ? 'border-cyan-400 text-cyan-300 bg-[#121929]'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4 font-mono text-xs">
          {savedMsg && (
            <div className="bg-emerald-950/60 border border-emerald-500/40 p-2.5 rounded-xl flex items-center gap-2 text-emerald-300">
              <CheckCircle2 className="w-4 h-4" />
              <span>{savedMsg}</span>
            </div>
          )}

          {/* Profile Tab */}
          {tab === 'profile' && (
            <div className="space-y-3">
              <div className="bg-[#141b2e] p-3 rounded-xl border border-[#1f2b45] space-y-1">
                <span className="text-slate-400 text-[10px] block">FULL NAME</span>
                <span className="text-white font-bold">{user.full_name}</span>
              </div>
              <div className="bg-[#141b2e] p-3 rounded-xl border border-[#1f2b45] space-y-1">
                <span className="text-slate-400 text-[10px] block">USERNAME</span>
                <span className="text-cyan-300 font-bold">@{user.username}</span>
              </div>
              <div className="bg-[#141b2e] p-3 rounded-xl border border-[#1f2b45] space-y-1">
                <span className="text-slate-400 text-[10px] block">EMAIL ADDRESS</span>
                <span className="text-white">{user.email}</span>
              </div>
              <div className="bg-[#141b2e] p-3 rounded-xl border border-[#1f2b45] space-y-1">
                <span className="text-slate-400 text-[10px] block">ACCOUNT ISOLATION STATUS</span>
                <span className="text-emerald-400 font-bold">ENFORCED (User ID: #{user.id})</span>
              </div>
            </div>
          )}

          {/* Trading & Risk Tab */}
          {tab === 'trading' && (
            <div className="space-y-3">
              <div>
                <label className="text-slate-400 block mb-1">ACCOUNT CAPITAL (NPR)</label>
                <input
                  type="number"
                  value={accountSize}
                  onChange={(e) => setAccountSize(Number(e.target.value))}
                  className="w-full bg-[#141b2e] border border-[#202b46] rounded-xl px-3 py-2 text-white font-bold"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">MAX RISK PER SETUP (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={riskPct}
                  onChange={(e) => setRiskPct(Number(e.target.value))}
                  className="w-full bg-[#141b2e] border border-[#202b46] rounded-xl px-3 py-2 text-white font-bold"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Planned Max Risk: NPR {((accountSize * riskPct) / 100).toLocaleString()}
                </span>
              </div>
              <button
                onClick={handleSaveTrading}
                className="w-full py-2.5 px-4 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-extrabold shadow-md transition-colors"
              >
                Save Trading Rules
              </button>
            </div>
          )}

          {/* Voice & Lang Tab */}
          {tab === 'voice' && (
            <div className="space-y-3">
              <div className="bg-[#141b2e] p-3 rounded-xl border border-[#1f2b45] space-y-1">
                <span className="text-slate-400 text-[10px] block">WAKE WORD</span>
                <span className="text-cyan-300 font-bold text-sm tracking-wider">"HEY SHACHINA"</span>
              </div>
              <div className="bg-[#141b2e] p-3 rounded-xl border border-[#1f2b45] space-y-1">
                <span className="text-slate-400 text-[10px] block">ACTIVE VOICE LANGUAGE</span>
                <span className="text-white font-bold">नेपाली (Nepali) • English • हिन्दी</span>
              </div>
            </div>
          )}

          {/* Security Tab */}
          {tab === 'security' && (
            <div className="space-y-4">
              <div className="bg-[#141b2e] p-3 rounded-xl border border-[#1f2b45] space-y-1">
                <span className="text-slate-400 text-[10px] block">PASSWORD ENCRYPTION</span>
                <span className="text-emerald-400 font-bold">PBKDF2-HMAC-SHA256 (100,000 Rounds)</span>
              </div>

              {/* Change Password Sub-form */}
              <div className="p-3.5 bg-[#12192b] border border-[#212f4c] rounded-xl space-y-3 font-mono text-xs">
                <h4 className="font-bold text-cyan-300 text-xs flex items-center gap-1.5 uppercase">
                  <Lock className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Update Password</span>
                </h4>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.target as HTMLFormElement;
                    const cur = (form.elements.namedItem('current_pass') as HTMLInputElement).value;
                    const n1 = (form.elements.namedItem('new_pass') as HTMLInputElement).value;
                    const n2 = (form.elements.namedItem('confirm_pass') as HTMLInputElement).value;
                    if (n1 !== n2) {
                      alert('New passwords do not match.');
                      return;
                    }
                    if (n1.length < 6) {
                      alert('New password must be at least 6 characters.');
                      return;
                    }
                    try {
                      await api.changePassword(cur, n1, n2);
                      setSavedMsg('Password updated successfully.');
                      form.reset();
                      setTimeout(() => setSavedMsg(null), 3000);
                    } catch (err: any) {
                      alert(err.message || 'Failed to update password.');
                    }
                  }}
                  className="space-y-2.5"
                >
                  <div>
                    <label className="text-slate-400 block mb-1 text-[11px]">Current Password</label>
                    <input
                      name="current_pass"
                      type="password"
                      required
                      placeholder="Current password"
                      className="w-full bg-[#162035] border border-[#243354] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-slate-400 block mb-1 text-[11px]">New Password</label>
                      <input
                        name="new_pass"
                        type="password"
                        required
                        placeholder="Min 6 chars"
                        className="w-full bg-[#162035] border border-[#243354] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1 text-[11px]">Confirm New</label>
                      <input
                        name="confirm_pass"
                        type="password"
                        required
                        placeholder="Confirm"
                        className="w-full bg-[#162035] border border-[#243354] rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-black font-extrabold rounded-lg transition-all"
                  >
                    CHANGE PASSWORD
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Memory Tab */}
          {tab === 'memory' && (
            <div className="space-y-3">
              <p className="text-slate-400 text-xs font-sans leading-relaxed">
                Shachina's long-term memory is strictly sandboxed to your user ID. You have complete control to inspect, edit, or purge learned preferences.
              </p>
              <div className="bg-[#141b2e] p-3 rounded-xl border border-[#1f2b45] flex items-center justify-between">
                <span>Personal Assistant Memory</span>
                <span className="text-emerald-400 font-bold">ACTIVE</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer with Logout */}
        <div className="p-4 border-t border-[#1c2438] bg-[#0c101c] flex items-center justify-between">
          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-600/40 text-rose-300 hover:text-white text-xs font-bold font-mono transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>LOG OUT</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#172033] hover:bg-[#202c46] text-slate-300 text-xs font-mono font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
