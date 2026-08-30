import React, { useState } from 'react';
import { api } from '../../services/api';
import { User } from '../../types';
import { ArrowLeft, UserPlus, Lock, Mail, User, Phone, CheckCircle2, AlertCircle } from 'lucide-react';

interface AuthRegisterProps {
  onSuccess: (user: User) => void;
  onGoToLogin: () => void;
  onGoToWelcome: () => void;
}

export const AuthRegister: React.FC<AuthRegisterProps> = ({ onSuccess, onGoToLogin, onGoToWelcome }) => {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.register({
        full_name: fullName,
        username: username,
        email: email,
        phone_number: phone || undefined,
        password: password,
        confirm_password: confirmPassword,
      });

      setSuccessMsg('Account created successfully.');
      setTimeout(() => {
        onSuccess(res.user);
      }, 700);
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please check your details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#080b12] text-slate-100 flex items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Glow Effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[350px] bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md bg-[#0e1424] border border-[#1d273f] rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 relative z-10">
        {/* Header Back Button */}
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
              REGISTER
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Create your isolated institutional trading intelligence profile.
          </p>
        </div>

        {/* Feedback Messages */}
        {error && (
          <div className="bg-rose-950/60 border border-rose-600/40 p-3 rounded-xl flex items-center gap-2 text-rose-300 text-xs font-mono">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-950/60 border border-emerald-500/40 p-3 rounded-xl flex items-center gap-2 text-emerald-300 text-xs font-mono">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg} Logging you into Shachina...</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5 font-mono text-xs">
          <div>
            <label className="text-slate-400 block mb-1">Full Name</label>
            <div className="relative">
              <User className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                required
                placeholder="e.g. Bibek"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-[#141b2e] border border-[#202b46] rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-slate-400 block mb-1">Username</label>
              <input
                type="text"
                required
                placeholder="bibek"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[#141b2e] border border-[#202b46] rounded-xl px-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Phone (Optional)</label>
              <input
                type="text"
                placeholder="+977-98..."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-[#141b2e] border border-[#202b46] rounded-xl px-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div>
            <label className="text-slate-400 block mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="email"
                required
                placeholder="bibek@shachina.ai"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#141b2e] border border-[#202b46] rounded-xl pl-9 pr-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-slate-400 block mb-1">Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#141b2e] border border-[#202b46] rounded-xl px-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Confirm Password</label>
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
            className="w-full py-3 px-4 rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 text-black font-extrabold text-xs tracking-wider shadow-lg shadow-cyan-500/25 transition-all mt-4 font-mono flex items-center justify-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            <span>{loading ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT'}</span>
          </button>
        </form>

        {/* Google OAuth Option */}
        <div className="space-y-3 pt-2 border-t border-[#1a233a]">
          <button
            onClick={() => setError('Google OAuth will connect to official OAuth client.')}
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
            Already have an account?{' '}
            <button
              onClick={onGoToLogin}
              className="text-cyan-400 hover:text-cyan-300 font-bold hover:underline"
            >
              Login
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
