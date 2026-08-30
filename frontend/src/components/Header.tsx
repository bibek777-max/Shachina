import React, { useState, useEffect } from 'react';
import { MarketStatus, User } from '../types';
import { ShieldCheck, Clock, Sparkles, User as UserIcon } from 'lucide-react';

interface HeaderProps {
  nepseStatus: MarketStatus | null;
  user: User | null;
  onOpenVoice: () => void;
  onOpenProfile: () => void;
}

export const Header: React.FC<HeaderProps> = ({ nepseStatus, user, onOpenVoice, onOpenProfile }) => {
  const [nepalTime, setNepalTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
      const nptOffset = (5 * 60 + 45) * 60000;
      const nptDate = new Date(utcTime + nptOffset);

      const timeStr = nptDate.toLocaleTimeString('en-US', {
        hour12: true,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const dateStr = nptDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      setNepalTime(`${dateStr} • ${timeStr} NPT`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const getSessionBadge = () => {
    if (!nepseStatus)
      return (
        <span className="bg-slate-800 text-slate-400 px-2.5 py-1 rounded-md text-xs font-mono">
          LOADING...
        </span>
      );
    if (nepseStatus.session === 'REGULAR') {
      return (
        <span className="bg-emerald-950/80 border border-emerald-500/50 text-emerald-400 px-3 py-1 rounded-full text-xs font-semibold font-mono flex items-center gap-1.5 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          NEPSE OPEN (11:00-15:00)
        </span>
      );
    } else if (nepseStatus.session === 'PRE_OPEN') {
      return (
        <span className="bg-amber-950/80 border border-amber-500/50 text-amber-300 px-3 py-1 rounded-full text-xs font-semibold font-mono flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400"></span>
          PRE-OPEN (10:30-11:00)
        </span>
      );
    } else if (nepseStatus.session === 'WEEKEND') {
      return (
        <span className="bg-slate-800 border border-slate-700 text-slate-400 px-3 py-1 rounded-full text-xs font-semibold font-mono flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-slate-500"></span>
          WEEKEND (CLOSED)
        </span>
      );
    } else {
      return (
        <span className="bg-rose-950/80 border border-rose-600/40 text-rose-300 px-3 py-1 rounded-full text-xs font-semibold font-mono flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
          NEPSE CLOSED
        </span>
      );
    }
  };

  return (
    <header className="h-16 border-b border-[#1c2438] bg-[#0c101c] px-4 flex items-center justify-between z-30 shrink-0 select-none">
      {/* Brand & Project Identity */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 ring-1 ring-white/20">
          <span className="font-black text-white text-base tracking-wider">⚡</span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-extrabold tracking-tight text-white text-lg leading-none">
              SHACHINA
            </h1>
            <span className="bg-cyan-950 text-cyan-400 border border-cyan-800/60 text-[10px] px-1.5 py-0.5 rounded font-mono font-bold tracking-wider uppercase">
              QUANT 2.0
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            AI Personal Assistant & Trading Intelligence
          </p>
        </div>
      </div>

      {/* Center Live Session & Kathmandu Clock */}
      <div className="hidden lg:flex items-center gap-4">
        {/* NPT Clock */}
        <div className="flex items-center gap-2 bg-[#121829] border border-[#1e293b] px-3 py-1.5 rounded-lg text-slate-200">
          <Clock className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-mono text-xs font-medium tracking-wide">
            {nepalTime || 'Loading Kathmandu Time...'}
          </span>
        </div>

        {/* NEPSE Live Session Badge */}
        {getSessionBadge()}

        {/* Zero-Fabrication Guarantee */}
        <div className="flex items-center gap-1.5 text-slate-300 bg-emerald-950/40 border border-emerald-800/50 px-2.5 py-1 rounded-md text-xs font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-emerald-300 font-medium">Deterministic Validation Active</span>
        </div>
      </div>

      {/* Right Controls & User Profile */}
      <div className="flex items-center gap-3">
        {/* Voice Trigger Button */}
        <button
          onClick={onOpenVoice}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500/20 to-blue-600/20 border border-cyan-500/40 hover:border-cyan-400 text-cyan-300 hover:text-cyan-200 text-xs font-semibold tracking-wide transition-all shadow-[0_0_15px_rgba(6,182,212,0.15)] group"
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400 group-hover:rotate-12 transition-transform" />
          <span>HEY SHACHINA</span>
        </button>

        {/* User Profile Trigger Button */}
        {user && (
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-2 bg-[#121829] hover:bg-[#1a233a] border border-[#1e293b] hover:border-cyan-500/40 pl-2.5 pr-3.5 py-1 rounded-lg transition-all text-left group"
          >
            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-[11px] font-bold text-black ring-1 ring-amber-300/40">
              {user.full_name[0]}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white leading-none group-hover:text-cyan-300">
                  {user.full_name}
                </span>
                <span className="text-[9px] bg-amber-950 text-amber-400 border border-amber-800/50 px-1 rounded font-mono font-semibold">
                  {user.role}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono leading-none block mt-0.5">
                Account Settings
              </span>
            </div>
          </button>
        )}
      </div>
    </header>
  );
};
