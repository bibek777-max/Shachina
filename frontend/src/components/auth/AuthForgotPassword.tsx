import React, { useState } from 'react';
import { api } from '../../services/api';
import { ArrowLeft, KeyRound, CheckCircle2, AlertCircle, Lock } from 'lucide-react';

interface AuthForgotPasswordProps {
  onGoToLogin: () => void;
}

export const AuthForgotPassword: React.FC<AuthForgotPasswordProps> = ({ onGoToLogin }) => {
  const [identifier, setIdentifier] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRequestToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.forgotPassword(identifier);
      setMessage(res.message);
      if (res.reset_token) {
        setResetToken(res.reset_token);
        setStep('reset');
      }
    } catch (err: any) {
      setError(err.message || 'Request failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.resetPassword(resetToken, newPassword, confirmPassword);
      setMessage(res.message);
      setTimeout(() => {
        onGoToLogin();
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#080b12] text-slate-100 flex items-center justify-center p-4 relative select-none">
      <div className="w-full max-w-md bg-[#0e1424] border border-[#1d273f] rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
        <button
          onClick={onGoToLogin}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white font-mono transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Login
        </button>

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xl font-black font-mono text-white tracking-tight">SHACHINA</span>
            <span className="text-[9px] bg-amber-950 text-amber-400 border border-amber-800 px-1.5 py-0.5 rounded font-mono font-bold">
              SECURITY
            </span>
          </div>
          <h2 className="text-base font-bold text-white">Reset Your Password</h2>
          <p className="text-xs text-slate-400">
            {step === 'request'
              ? 'Enter your verified Email, Phone Number, or Username.'
              : 'Enter your new secure password.'}
          </p>
        </div>

        {error && (
          <div className="bg-rose-950/60 border border-rose-600/40 p-3 rounded-xl flex items-center gap-2 text-rose-300 text-xs font-mono">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {message && (
          <div className="bg-cyan-950/60 border border-cyan-500/40 p-3 rounded-xl flex items-center gap-2 text-cyan-300 text-xs font-mono">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {step === 'request' ? (
          <form onSubmit={handleRequestToken} className="space-y-4 font-mono text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Email, Phone, or Username</label>
              <input
                type="text"
                required
                placeholder="bibek@shachina.ai"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full bg-[#141b2e] border border-[#202b46] rounded-xl px-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 text-black font-extrabold text-xs tracking-wider shadow-lg shadow-cyan-500/25 transition-all font-mono flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              <span>{loading ? 'PROCESSING...' : 'REQUEST PASSWORD RESET'}</span>
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4 font-mono text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Reset Token</label>
              <input
                type="text"
                required
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                className="w-full bg-[#141b2e] border border-[#202b46] rounded-xl px-3 py-2.5 text-white font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-400 block mb-1">New Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-[#141b2e] border border-[#202b46] rounded-xl px-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Confirm New</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-[#141b2e] border border-[#202b46] rounded-xl px-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-black font-extrabold text-xs tracking-wider shadow-lg shadow-emerald-500/25 transition-all font-mono flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" />
              <span>{loading ? 'UPDATING...' : 'SET NEW PASSWORD'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
