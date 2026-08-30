import React, { useState } from 'react';
import { api } from '../../services/api';
import { User } from '../../types';
import { ArrowLeft, LogIn, Lock, User as UserIcon, AlertCircle } from 'lucide-react';

interface AuthLoginProps {
  onSuccess: (user: User) => void;
  onGoToRegister: () => void;
  onGoToForgotPassword: () => void;
  onGoToWelcome: () => void;
}

export const AuthLogin: React.FC<AuthLoginProps> = ({
  onSuccess,
  onGoToRegister,
  onGoToForgotPassword,
  onGoToWelcome,
}) => {
  const [identifier, setIdentifier] = useState('bibek');
  const [password, setPassword] = useState('Shachina2026!');
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
      setError(err.message || 'Incorrect username/email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#080b12] text-slate-100 flex items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Glow Effects */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[450px] h-[300px] bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md bg-[#0e1424] border border-[#1d273f] rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 relative z-10">
        {/* Back Button */}
        <button
          onClick={onGoToWelcome}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white font-mono transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Welcome
        </button>

        {/* Title */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black font-mono text-white tracking-tight">SHACHINA</span>
            <span className="text-[9px] bg-cyan-950 text-cyan-400 border border-cyan-800 px-1.5 py-0.5 rounded font-mono font-bold">
              LOGIN
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Sign in to access your quantitative trading platform and personal AI.
          </p>
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
                placeholder="bibek or bibek@shachina.ai"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full bg-[#141b2e] border border-[#202b46] rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400"
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
                className="w-full bg-[#141b2e] border border-[#202b46] rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 text-black font-extrabold text-xs tracking-wider shadow-lg shadow-cyan-500/25 transition-all mt-2 font-mono flex items-center justify-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            <span>{loading ? 'SIGNING IN...' : 'LOGIN TO SHACHINA'}</span>
          </button>
        </form>

        {/* Google OAuth & Register Links */}
        <div className="space-y-3 pt-2 border-t border-[#1a233a]">
          <button
            onClick={() => setError('Google OAuth integration is enabled in production.')}
            className="w-full py-2.5 px-4 rounded-xl bg-[#141b2e] hover:bg-[#1a243d] border border-[#202c49] text-slate-300 hover:text-white text-xs font-semibold font-mono flex items-center justify-center gap-2.5 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.03h3.88c2.27-2.09 3.66-5.17 3.66-9.12z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.03c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.13C3.27 21.39 7.35 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.58H1.26C.46 8.18 0 9.99 0 12s.46 3.82 1.26 5.42l4.02-3.13z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.27 2.61 1.26 6.58l4.02 3.13c.95-2.83 3.6-4.96 6.72-4.96z"
              />
            </svg>
            <span>CONTINUE WITH GOOGLE</span>
          </button>

          <p className="text-center text-xs text-slate-400 font-mono">
            New to Shachina?{' '}
            <button
              onClick={onGoToRegister}
              className="text-cyan-400 hover:text-cyan-300 font-bold hover:underline"
            >
              Create Account
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
