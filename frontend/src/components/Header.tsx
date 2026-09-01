import React, { useState, useEffect } from 'react';
import { MarketStatus, User, TradingPosition } from '../types';
import {
  ShieldCheck,
  Clock,
  Sparkles,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
} from 'lucide-react';

interface HeaderProps {
  nepseStatus: MarketStatus | null;
  user: User | null;
  positions?: TradingPosition[];
  onOpenVoice: () => void;
  onOpenProfile: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  nepseStatus,
  user,
  positions = [],
  onOpenVoice,
  onOpenProfile,
}) => {
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

  // Calculate Today's Profit / PnL
  const nepsePositions = positions.filter((p) => p.market === 'NEPSE' || !p.market);
  const totalUnrealizedPnl = nepsePositions.reduce((acc, p) => acc + (p.unrealized_pnl || 0), 0);
  const accountSize = user?.trading_settings?.account_size || 1000000.0;
  const pnlPercentage = (totalUnrealizedPnl / accountSize) * 100;
  const isProfitable = totalUnrealizedPnl >= 0;

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
    <header className="h-16 border-b border-[#1c2438] bg-[#070b14] px-4 flex items-center justify-between z-30 shrink-0 select-none">
      {/* Brand & Project Identity */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 ring-1 ring-white/20">
          <span className="font-black text-white text-base tracking-wider">⚡</span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-extrabold tracking-tight text-white text-lg leading-none font-mono">
              SHACHINA
            </h1>
            <span className="bg-cyan-950 text-cyan-400 border border-cyan-800/60 text-[10px] px-1.5 py-0.5 rounded font-mono font-bold tracking-wider uppercase">
              AI 3.0
            </span>
          </div>
          <p className="text-[10px] text-slate-400 font-mono mt-0.5">
            Institutional Trading Intelligence
          </p>
        </div>
      </div>

      {/* ── Center: TODAY'S NEPSE PROFIT / P&L WIDGET ─────────────────────── */}
      <div className="flex items-center gap-3">
        {/* TODAY PROFIT BADGE (PROMINENT) */}
        <div
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border font-mono shadow-xl transition-all ${
            isProfitable && totalUnrealizedPnl > 0
              ? 'bg-emerald-950/90 border-emerald-500 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.25)]'
              : totalUnrealizedPnl < 0
              ? 'bg-rose-950/90 border-rose-500 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.25)]'
              : 'bg-[#0e1628] border-cyan-500/40 text-cyan-300'
          }`}
        >
          <div className="flex items-center gap-1.5">
            {isProfitable && totalUnrealizedPnl > 0 ? (
              <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : totalUnrealizedPnl < 0 ? (
              <TrendingDown className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <Activity className="w-4 h-4 text-cyan-400 shrink-0" />
            )}
            <div>
              <span className="text-[9px] text-slate-400 uppercase tracking-wider block leading-none font-bold">
                TODAY'S NEPSE P&L
              </span>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-sm font-black tracking-tight">
                  {totalUnrealizedPnl >= 0 ? '+' : ''}NPR {Math.abs(totalUnrealizedPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span
                  className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded ${
                    isProfitable && totalUnrealizedPnl > 0
                      ? 'bg-emerald-900 text-emerald-200'
                      : totalUnrealizedPnl < 0
                      ? 'bg-rose-900 text-rose-200'
                      : 'bg-cyan-950 text-cyan-300'
                  }`}
                >
                  {pnlPercentage >= 0 ? '+' : ''}{pnlPercentage.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* NEPSE Index / Session Status */}
        <div className="hidden xl:flex items-center gap-3">
          {getSessionBadge()}

          {/* NPT Clock */}
          <div className="flex items-center gap-1.5 bg-[#0e1628] border border-[#1e293b] px-3 py-1.5 rounded-lg text-slate-300 font-mono text-xs">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>{nepalTime || 'Kathmandu Time'}</span>
          </div>
        </div>
      </div>

      {/* Right Controls & User Profile */}
      <div className="flex items-center gap-2.5">
        {/* Voice Trigger Button */}
        <button
          onClick={onOpenVoice}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500/20 to-blue-600/20 border border-cyan-500/40 hover:border-cyan-400 text-cyan-300 hover:text-cyan-200 text-xs font-semibold tracking-wide transition-all shadow-[0_0_15px_rgba(6,182,212,0.15)] group"
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400 group-hover:rotate-12 transition-transform" />
          <span className="font-mono text-xs font-bold">HEY SHACHINA</span>
        </button>

        {/* User Profile Trigger Button */}
        {user && (
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-2 bg-[#0e1628] hover:bg-[#152038] border border-[#1e293b] hover:border-cyan-500/40 pl-2.5 pr-3 py-1 rounded-lg transition-all text-left group"
          >
            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-cyan-400 to-blue-600 flex items-center justify-center text-[11px] font-bold text-black ring-1 ring-cyan-300/40">
              {user.full_name ? user.full_name[0] : 'B'}
            </div>
            <div className="hidden sm:block">
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-white leading-none group-hover:text-cyan-300 font-mono">
                  {user.full_name || 'Bibek'}
                </span>
                <span className="text-[9px] bg-cyan-950 text-cyan-400 border border-cyan-800/50 px-1 rounded font-mono font-semibold">
                  {user.role || 'OWNER'}
                </span>
              </div>
            </div>
          </button>
        )}
      </div>
    </header>
  );
};
