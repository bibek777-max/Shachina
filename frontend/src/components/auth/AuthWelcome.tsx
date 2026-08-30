import React from 'react';
import { ShieldCheck, TrendingUp, Sparkles, Globe2, ChevronRight, Lock, UserPlus, LogIn } from 'lucide-react';

interface AuthWelcomeProps {
  onGoToRegister: () => void;
  onGoToLogin: () => void;
}

export const AuthWelcome: React.FC<AuthWelcomeProps> = ({ onGoToRegister, onGoToLogin }) => {
  return (
    <div className="min-h-screen w-full bg-[#080b12] text-slate-100 flex flex-col justify-between relative overflow-hidden select-none">
      {/* Background Ambient Glows */}
      <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-gradient-to-b from-cyan-500/15 via-blue-600/10 to-transparent blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-5%] w-[450px] h-[350px] bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Top Navbar */}
      <nav className="h-20 border-b border-[#161f33] px-6 sm:px-12 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/25 ring-1 ring-white/20">
            <span className="font-black text-white text-xl">⚡</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-white text-lg tracking-tight font-mono">
                SHACHINA
              </span>
              <span className="text-[9px] bg-cyan-950 text-cyan-400 border border-cyan-800 px-1.5 py-0.5 rounded font-mono font-bold tracking-widest uppercase">
                QUANT ENGINE
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              Global Trading Intelligence & AI Assistant
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onGoToLogin}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800/60 border border-[#1e293b] transition-all flex items-center gap-1.5 font-mono"
          >
            <LogIn className="w-3.5 h-3.5 text-cyan-400" />
            LOGIN
          </button>
          <button
            onClick={onGoToRegister}
            className="px-4 py-2 rounded-xl text-xs font-bold text-black bg-cyan-400 hover:bg-cyan-300 shadow-lg shadow-cyan-500/25 transition-all flex items-center gap-1.5 font-mono"
          >
            <UserPlus className="w-3.5 h-3.5 text-black" />
            CREATE ACCOUNT
          </button>
        </div>
      </nav>

      {/* Main Hero & Welcome Banner */}
      <main className="flex-1 max-w-5xl mx-auto px-6 py-12 flex flex-col items-center justify-center text-center z-10">
        {/* Status Pill */}
        <div className="inline-flex items-center gap-2 bg-[#121929] border border-cyan-500/30 px-3.5 py-1.5 rounded-full text-xs font-mono text-cyan-300 mb-6 shadow-inner">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
          <span>Zero-Fabrication Quantitative Architecture • Primary Market: NEPSE</span>
        </div>

        {/* Hero Title */}
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-3xl leading-[1.15]">
          SHACHINA
        </h1>
        <p className="text-lg sm:text-xl text-slate-300 mt-4 max-w-2xl font-normal leading-relaxed">
          Your AI Personal Trading & Marketing Assistant
        </p>

        <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-xl font-mono">
          Institutional market analysis, deterministic candlestick algorithms, risk management, and multilingual voice intelligence for Bibek.
        </p>

        {/* CTA Button Group */}
        <div className="mt-8 flex flex-col sm:flex-row items-center gap-4 w-full max-w-md">
          <button
            onClick={onGoToRegister}
            className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-black font-extrabold text-sm tracking-wide shadow-xl shadow-cyan-500/25 transition-all flex items-center justify-center gap-2 font-mono group"
          >
            <span>CREATE ACCOUNT</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
          <button
            onClick={onGoToLogin}
            className="w-full py-3.5 px-6 rounded-xl bg-[#121828] hover:bg-[#1a233a] border border-[#222e48] hover:border-cyan-500/50 text-white font-bold text-sm tracking-wide transition-all flex items-center justify-center gap-2 font-mono"
          >
            <span>LOGIN</span>
          </button>
        </div>

        {/* Value Propositions Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-14 w-full text-left font-mono">
          <div className="bg-[#0e1424] border border-[#1c2742] p-4 rounded-xl space-y-1.5 shadow-md">
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold">
              <TrendingUp className="w-4 h-4" />
              <span>NEPSE PRIMARY</span>
            </div>
            <p className="text-[11px] text-slate-400 font-sans">
              Asia/Kathmandu timezone, NPR currency, verified sector analytics, and scrip intelligence.
            </p>
          </div>

          <div className="bg-[#0e1424] border border-[#1c2742] p-4 rounded-xl space-y-1.5 shadow-md">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>ZERO FABRICATION</span>
            </div>
            <p className="text-[11px] text-slate-400 font-sans">
              Strict mathematical OHLC verification. If data is unavailable or stale, returns WAIT.
            </p>
          </div>

          <div className="bg-[#0e1424] border border-[#1c2742] p-4 rounded-xl space-y-1.5 shadow-md">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
              <Sparkles className="w-4 h-4" />
              <span>AI VOICE ASSISTANT</span>
            </div>
            <p className="text-[11px] text-slate-400 font-sans">
              Wake word "HEY SHACHINA" with fluent multilingual speech in Nepali, English, and Hindi.
            </p>
          </div>

          <div className="bg-[#0e1424] border border-[#1c2742] p-4 rounded-xl space-y-1.5 shadow-md">
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold">
              <Lock className="w-4 h-4" />
              <span>ACCOUNT ISOLATION</span>
            </div>
            <p className="text-[11px] text-slate-400 font-sans">
              User-specific databases for watchlists, trading journals, portfolios, and memory.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="h-14 border-t border-[#161f33] px-6 sm:px-12 flex items-center justify-between text-xs text-slate-500 font-mono z-10">
        <span>© 2026 SHACHINA QUANT. All rights reserved.</span>
        <span>Dedicated to Bibek • Institutional AI Platform</span>
      </footer>
    </div>
  );
};
