import React from 'react';
import { DataQualityReport } from '../types';
import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Gauge, Activity } from 'lucide-react';

interface DataHealthPanelProps {
  report: DataQualityReport | null;
}

export const DataHealthPanel: React.FC<DataHealthPanelProps> = ({ report }) => {
  if (!report) {
    return (
      <div className="bg-[#0f1424] border border-[#1c2438] rounded-xl p-4 text-slate-400 text-xs font-mono">
        Awaiting data quality telemetry...
      </div>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-emerald-400 border-emerald-500/40 bg-emerald-950/30';
    if (score >= 75) return 'text-cyan-400 border-cyan-500/40 bg-cyan-950/30';
    if (score >= 50) return 'text-amber-400 border-amber-500/40 bg-amber-950/30';
    return 'text-rose-400 border-rose-500/40 bg-rose-950/30';
  };

  return (
    <div className="bg-[#0f1424] border border-[#1c2438] rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-cyan-400" />
          <h3 className="font-bold text-xs text-white tracking-wide uppercase font-mono">
            Data Quality & Validation Engine
          </h3>
        </div>
        <span
          className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold border ${getScoreColor(
            report.score
          )}`}
        >
          {report.score} / 100 • {report.score >= 80 ? 'VERIFIED' : 'WAIT'}
        </span>
      </div>

      {/* Validation Checks Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
        <div className="bg-[#141b2e] p-2 rounded-lg border border-[#1f2b45] flex items-center justify-between">
          <span className="text-slate-400 text-[10px]">OHLC Math (H≥O,C; L≤O,C)</span>
          {report.invalid_ohlc_count === 0 ? (
            <span className="text-emerald-400 flex items-center gap-1 font-bold text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5" /> PASS
            </span>
          ) : (
            <span className="text-rose-400 flex items-center gap-1 font-bold text-[11px]">
              <XCircle className="w-3.5 h-3.5" /> {report.invalid_ohlc_count} ERR
            </span>
          )}
        </div>

        <div className="bg-[#141b2e] p-2 rounded-lg border border-[#1f2b45] flex items-center justify-between">
          <span className="text-slate-400 text-[10px]">Timestamp Duplicates</span>
          {report.duplicate_candles === 0 ? (
            <span className="text-emerald-400 flex items-center gap-1 font-bold text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5" /> 0 DUP
            </span>
          ) : (
            <span className="text-amber-400 flex items-center gap-1 font-bold text-[11px]">
              <AlertTriangle className="w-3.5 h-3.5" /> {report.duplicate_candles}
            </span>
          )}
        </div>

        <div className="bg-[#141b2e] p-2 rounded-lg border border-[#1f2b45] flex items-center justify-between">
          <span className="text-slate-400 text-[10px]">Total Valid Candles</span>
          <span className="text-cyan-300 font-bold text-[11px]">
            {report.total_candles} BARS
          </span>
        </div>

        <div className="bg-[#141b2e] p-2 rounded-lg border border-[#1f2b45] flex items-center justify-between">
          <span className="text-slate-400 text-[10px]">Zero-Fabrication Mode</span>
          <span className="text-emerald-400 font-bold text-[10px] bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-800">
            ENFORCED
          </span>
        </div>
      </div>

      {/* Validation details / reasons */}
      {report.reasons && report.reasons.length > 0 && (
        <div className="bg-[#121727] p-2.5 rounded-lg border border-[#222c42] space-y-1">
          <div className="text-[10px] text-slate-400 font-mono font-semibold uppercase">
            Data Quality Audit Log:
          </div>
          <ul className="text-[11px] text-slate-300 font-mono space-y-0.5">
            {report.reasons.map((r, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <span className="text-cyan-400">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
