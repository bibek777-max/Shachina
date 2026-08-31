/**
 * SHACHINA TRADE ALERT BANNER
 * ─────────────────────────────────────────────────────
 * Floating alert card that appears on BUY / SELL signals.
 * Auto-dismisses after 10 seconds. User can mute/unmute alerts.
 */

import React, { useEffect, useState } from 'react';
import { TradeSignal } from '../services/tradeAlertEngine';

interface TradeAlertBannerProps {
  alerts: TradeSignal[];
  isMuted: boolean;
  onMuteToggle: () => void;
  onDismiss: (symbol: string) => void;
}

export const TradeAlertBanner: React.FC<TradeAlertBannerProps> = ({
  alerts,
  isMuted,
  onMuteToggle,
  onDismiss,
}) => {
  if (alerts.length === 0) return null;

  return (
    <div className="fixed top-16 right-3 z-50 flex flex-col gap-2 max-w-xs w-full pointer-events-none">
      {/* Mute/Unmute button */}
      <div className="flex justify-end pointer-events-auto">
        <button
          onClick={onMuteToggle}
          title={isMuted ? 'Unmute trade alerts' : 'Mute trade alerts'}
          className="flex items-center gap-1.5 bg-[#0f1623]/90 border border-[#1e2d45] backdrop-blur text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg font-mono transition"
        >
          {isMuted ? '🔇' : '🔊'} {isMuted ? 'Muted' : 'Alerts On'}
        </button>
      </div>

      {alerts.slice(0, 3).map((signal) => (
        <AlertCard
          key={`${signal.symbol}-${signal.signal}`}
          signal={signal}
          onDismiss={() => onDismiss(signal.symbol)}
        />
      ))}
    </div>
  );
};

const AlertCard: React.FC<{ signal: TradeSignal; onDismiss: () => void }> = ({
  signal,
  onDismiss,
}) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    const t = setTimeout(() => setVisible(true), 50);
    // Auto dismiss after 10 s
    const d = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 400);
    }, 10_000);
    return () => { clearTimeout(t); clearTimeout(d); };
  }, []);

  const isBuy  = signal.signal === 'BUY';
  const colors = isBuy
    ? {
        border: 'border-emerald-500/60',
        bg    : 'bg-emerald-950/90',
        badge : 'bg-emerald-500 text-black',
        bar   : 'bg-emerald-400',
        text  : 'text-emerald-300',
        glow  : 'shadow-emerald-500/30',
      }
    : {
        border: 'border-rose-500/60',
        bg    : 'bg-rose-950/90',
        badge : 'bg-rose-500 text-white',
        bar   : 'bg-rose-400',
        text  : 'text-rose-300',
        glow  : 'shadow-rose-500/30',
      };

  return (
    <div
      className={`pointer-events-auto rounded-xl border backdrop-blur-md shadow-xl transition-all duration-400
        ${colors.border} ${colors.bg} ${colors.glow}
        ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-16'}`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-black tracking-widest px-2 py-0.5 rounded-full ${colors.badge}`}>
            {isBuy ? '▲ BUY' : '▼ SELL'}
          </span>
          <span className="font-mono font-bold text-white text-sm">{signal.symbol}</span>
        </div>
        <button
          onClick={() => { setVisible(false); setTimeout(onDismiss, 300); }}
          className="text-slate-500 hover:text-slate-300 text-sm leading-none px-1"
        >✕</button>
      </div>

      {/* Price + Confidence */}
      <div className="px-3 pb-1 flex items-center justify-between">
        <span className="font-mono text-white text-base font-bold">
          NPR {signal.price.toLocaleString()}
        </span>
        <div className="flex items-center gap-1">
          <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${colors.bar} transition-all duration-700`}
              style={{ width: `${signal.confidence}%` }}
            />
          </div>
          <span className={`text-[10px] font-mono font-bold ${colors.text}`}>
            {signal.confidence}%
          </span>
        </div>
      </div>

      {/* Reason */}
      <p className="px-3 pb-2.5 text-[11px] text-slate-400 leading-snug font-mono">
        {signal.reason}
      </p>

      {/* Auto-dismiss bar */}
      <div className={`h-0.5 rounded-b-xl ${colors.bar} animate-[shrink_10s_linear_forwards]`} />
    </div>
  );
};
