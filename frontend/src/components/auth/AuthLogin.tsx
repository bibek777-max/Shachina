import React, { useState } from 'react';
import { api } from '../../services/api';
import { User } from '../../types';
import { LogIn, Lock, User as UserIcon, AlertCircle, Shield } from 'lucide-react';

interface AuthLoginProps {
  onSuccess: (user: User) => void;
  onGoToForgotPassword: () => void;
}

export const AuthLogin: React.FC<AuthLoginProps> = ({
  onSuccess,
  onGoToForgotPassword,
}) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.login(identifier, password);
      onSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#080b12] text-slate-100 flex items-center justify-center p-4 relative overflow-hidden select-none font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Ambient Glows */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[350px] bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-20 left-10 w-[300px] h-[300px] bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md bg-[#0e1424] border border-[#1d273f] rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 relative z-10">
        {/* Header Branding */}
        <div className="space-y-1 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <span className="text-2xl font-black font-mono text-cyan-300 tracking-wider">SHACHINA</span>
            <span className="text-[9px] bg-cyan-950 text-cyan-400 border border-cyan-800 px-1.5 py-0.5 rounded font-mono font-bold">
              SECURE ACCESS
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Sign in to access Bibek's AI personal assistant & institutional trading terminal.
          </p>
        </div>

        {/* Security Notice */}
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#090d18] border border-[#1e293b] text-[11px] font-mono text-slate-400">
          <Shield className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>Private single-user workspace. Public registration is disabled.</span>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="bg-rose-950/60 border border-rose-600/40 p-3 rounded-xl flex items-center gap-2 text-rose-300 text-xs font-mono">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4 font-mono text-xs">
          <div>
            <label className="text-slate-400 block mb-1">Username or Email</label>
            <div className="relative">
              <UserIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                required
                placeholder="bibek@shachina.ai"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full bg-[#141b2e] border border-[#202b46] rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400 transition-colors"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-slate-400">Password</label>
              <button
                type="button"
                onClick={onGoToForgotPassword}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                Forgot Password?
              </button>
            </div>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#141b2e] border border-[#202b46] rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 disabled:opacity-50 text-black font-extrabold text-xs tracking-wider shadow-lg shadow-cyan-500/25 transition-all mt-2 font-mono flex items-center justify-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            {loading ? 'AUTHENTICATING...' : 'ACCESS SHACHINA DASHBOARD'}
          </button>
        </form>

        {/* Footer info */}
        <div className="pt-2 border-t border-[#1a2337] text-center">
          <p className="text-[10px] text-slate-500 font-mono">
            SHACHINA v3.0 • Institutional Risk Rules Enforced • Asia/Kathmandu
          </p>
        </div>
      </div>
    </div>
  );
};
