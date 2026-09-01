import React, { useState } from 'react';
import { api } from '../../services/api';
import { User } from '../../types';
import { LogIn, Lock, User as UserIcon, AlertCircle, Shield, Eye, EyeOff, KeyRound, CheckCircle2, X } from 'lucide-react';

interface AuthLoginProps {
  onSuccess: (user: User) => void;
  onGoToForgotPassword: () => void;
}

export const AuthLogin: React.FC<AuthLoginProps> = ({
  onSuccess,
  onGoToForgotPassword,
}) => {
  const [identifier, setIdentifier] = useState('shachina.ai');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Change Password Modal State
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [cpIdentifier, setCpIdentifier] = useState('shachina.ai');
  const [cpCurrentPassword, setCpCurrentPassword] = useState('');
  const [cpNewPassword, setCpNewPassword] = useState('');
  const [cpConfirmPassword, setCpConfirmPassword] = useState('');
  const [cpShowCurrentPassword, setCpShowCurrentPassword] = useState(false);
  const [cpShowNewPassword, setCpShowNewPassword] = useState(false);
  const [cpLoading, setCpLoading] = useState(false);
  const [cpError, setCpError] = useState<string | null>(null);
  const [cpSuccess, setCpSuccess] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
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

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCpError(null);
    setCpSuccess(null);

    if (cpNewPassword !== cpConfirmPassword) {
      setCpError('New passwords do not match.');
      return;
    }
    if (cpNewPassword.length < 6) {
      setCpError('New password must be at least 6 characters.');
      return;
    }

    setCpLoading(true);
    try {
      const res = await api.directChangePassword(
        cpIdentifier,
        cpCurrentPassword,
        cpNewPassword,
        cpConfirmPassword
      );
      setCpSuccess(res.message || 'Password changed successfully! You may now log in.');
      setPassword(cpNewPassword);
      setTimeout(() => {
        setShowChangePasswordModal(false);
        setCpSuccess(null);
        setCpCurrentPassword('');
        setCpNewPassword('');
        setCpConfirmPassword('');
      }, 2000);
    } catch (err: any) {
      setCpError(err.message || 'Failed to change password. Please check your current password.');
    } finally {
      setCpLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#080b12] text-slate-100 flex items-center justify-center p-4 relative overflow-hidden select-none font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Ambient Glow Backgrounds */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-20 left-10 w-[350px] h-[350px] bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md bg-[#0e1424] border border-[#1d273f] rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 relative z-10">
        {/* Header Branding */}
        <div className="space-y-1 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-400 to-blue-600 flex items-center justify-center font-black text-black font-mono text-base shadow-[0_0_15px_rgba(34,211,238,0.4)]">
              S
            </div>
            <span className="text-2xl font-black font-mono text-cyan-300 tracking-wider">SHACHINA</span>
            <span className="text-[9px] bg-cyan-950 text-cyan-400 border border-cyan-800 px-1.5 py-0.5 rounded font-mono font-bold">
              SECURE ACCESS
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Sign in to access your personal AI assistant & institutional trading terminal.
          </p>
        </div>

        {/* Security & Private Workspace Notice */}
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#090d18] border border-[#1e293b] text-[11px] font-mono text-slate-400">
          <Shield className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>Personal AI Workspace. All user data, chats, and files are 100% private.</span>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="bg-rose-950/60 border border-rose-600/40 p-3 rounded-xl flex items-center gap-2 text-rose-300 text-xs font-mono animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLoginSubmit} className="space-y-4 font-mono text-xs">
          {/* Username Field */}
          <div>
            <label className="text-slate-400 block mb-1 font-semibold">Username</label>
            <div className="relative">
              <UserIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                required
                placeholder="shachina.ai"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full bg-[#141b2e] border border-[#202b46] rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400 transition-colors font-mono"
              />
            </div>
          </div>

          {/* Password Field with Show/Hide Toggle */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-slate-400 font-semibold">Password</label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[11px] text-slate-400 hover:text-cyan-300 transition-colors flex items-center gap-1"
              >
                {showPassword ? (
                  <>
                    <EyeOff className="w-3 h-3 text-cyan-400" />
                    <span>HIDE PASSWORD</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3 h-3 text-cyan-400" />
                    <span>SHOW PASSWORD</span>
                  </>
                )}
              </button>
            </div>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#141b2e] border border-[#202b46] rounded-xl pl-9 pr-10 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400 transition-colors font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-0.5"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* LOGIN Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 disabled:opacity-50 text-black font-extrabold text-xs tracking-wider shadow-lg shadow-cyan-500/25 transition-all mt-2 font-mono flex items-center justify-center gap-2 uppercase cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            {loading ? 'AUTHENTICATING...' : 'LOGIN'}
          </button>

          {/* Action Links: Change Password & Forgot Password */}
          <div className="flex items-center justify-between pt-2 text-[11px] font-mono text-slate-400">
            <button
              type="button"
              onClick={() => {
                setCpIdentifier(identifier || 'shachina.ai');
                setCpError(null);
                setCpSuccess(null);
                setShowChangePasswordModal(true);
              }}
              className="text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1 cursor-pointer font-bold"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Change Password</span>
            </button>
            <button
              type="button"
              onClick={onGoToForgotPassword}
              className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              Forgot Password?
            </button>
          </div>
        </form>

        {/* Footer info */}
        <div className="pt-2 border-t border-[#1a2337] text-center">
          <p className="text-[10px] text-slate-500 font-mono">
            SHACHINA AI • Personal Intelligence & Institutional Trading Platform
          </p>
        </div>
      </div>

      {/* ── Change Password Modal ───────────────────────────────────────────── */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0e1424] border border-[#1d273f] rounded-2xl shadow-2xl p-6 space-y-5 relative">
            <div className="flex items-center justify-between border-b border-[#1b263e] pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-cyan-400" />
                <h3 className="font-mono font-bold text-sm text-white">Change Password</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowChangePasswordModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {cpError && (
              <div className="bg-rose-950/60 border border-rose-600/40 p-2.5 rounded-xl flex items-center gap-2 text-rose-300 text-xs font-mono">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{cpError}</span>
              </div>
            )}

            {cpSuccess && (
              <div className="bg-emerald-950/60 border border-emerald-600/40 p-2.5 rounded-xl flex items-center gap-2 text-emerald-300 text-xs font-mono">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{cpSuccess}</span>
              </div>
            )}

            <form onSubmit={handleChangePasswordSubmit} className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Username or Email</label>
                <input
                  type="text"
                  required
                  value={cpIdentifier}
                  onChange={(e) => setCpIdentifier(e.target.value)}
                  className="w-full bg-[#141b2e] border border-[#202b46] rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400 transition-colors"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-400">Current Password</label>
                  <button
                    type="button"
                    onClick={() => setCpShowCurrentPassword(!cpShowCurrentPassword)}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300"
                  >
                    {cpShowCurrentPassword ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
                <input
                  type={cpShowCurrentPassword ? 'text' : 'password'}
                  required
                  placeholder="Current password"
                  value={cpCurrentPassword}
                  onChange={(e) => setCpCurrentPassword(e.target.value)}
                  className="w-full bg-[#141b2e] border border-[#202b46] rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400 transition-colors"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-400">New Password</label>
                  <button
                    type="button"
                    onClick={() => setCpShowNewPassword(!cpShowNewPassword)}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300"
                  >
                    {cpShowNewPassword ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
                <input
                  type={cpShowNewPassword ? 'text' : 'password'}
                  required
                  placeholder="New password (min 6 chars)"
                  value={cpNewPassword}
                  onChange={(e) => setCpNewPassword(e.target.value)}
                  className="w-full bg-[#141b2e] border border-[#202b46] rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400 transition-colors"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Confirm New Password</label>
                <input
                  type={cpShowNewPassword ? 'text' : 'password'}
                  required
                  placeholder="Confirm new password"
                  value={cpConfirmPassword}
                  onChange={(e) => setCpConfirmPassword(e.target.value)}
                  className="w-full bg-[#141b2e] border border-[#202b46] rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400 transition-colors"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowChangePasswordModal(false)}
                  className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={cpLoading}
                  className="px-4 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-extrabold transition-all"
                >
                  {cpLoading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
