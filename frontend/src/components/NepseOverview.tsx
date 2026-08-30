import React from 'react';
import { TrendingUp, BarChart3, PieChart, Layers } from 'lucide-react';

interface NepseOverviewProps {
  nepseData: any;
}

export const NepseOverview: React.FC<NepseOverviewProps> = ({ nepseData }) => {
  if (!nepseData) return null;

  return (
    <div className="w-80 flex flex-col h-full bg-[#0c101c] border-l border-[#1c2438] shrink-0 p-3 space-y-3 overflow-y-auto select-none">
      {/* NEPSE Index Main Card */}
      <div className="bg-gradient-to-br from-[#121829] to-[#0f1424] border border-[#1e293b] rounded-xl p-3.5 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none"></div>

        <div className="flex items-center justify-between text-xs text-slate-400 font-mono mb-1">
          <span className="flex items-center gap-1.5 text-cyan-400 font-bold">
            🇳🇵 NEPSE BENCHMARK
          </span>
          <span className="text-[10px] bg-[#1a233a] px-1.5 py-0.5 rounded text-slate-300">
            NPR
          </span>
        </div>

        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-xl font-extrabold text-white font-mono tracking-tight">
            {nepseData.nepse_index?.toLocaleString()}
          </span>
          <span className="text-xs font-mono font-bold text-emerald-400 flex items-center">
            +{nepseData.nepse_index_change} (+{nepseData.nepse_index_percent}%)
          </span>
        </div>

        <div className="mt-3 pt-2.5 border-t border-[#1f293d] grid grid-cols-2 gap-2 text-[11px] font-mono">
          <div>
            <span className="text-slate-500 block text-[9px] uppercase">Daily Turnover</span>
            <span className="text-slate-200 font-semibold">
              NPR {(nepseData.total_turnover_npr / 10000000).toFixed(2)} Cr
            </span>
          </div>
          <div>
            <span className="text-slate-500 block text-[9px] uppercase">Total Transactions</span>
            <span className="text-slate-200 font-semibold">
              {nepseData.total_trades?.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Sector Performance Breakdown */}
      <div className="bg-[#0f1424] border border-[#1c2438] rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-slate-200 text-xs font-mono font-bold">
            <PieChart className="w-3.5 h-3.5 text-cyan-400" />
            <span>NEPSE SECTOR GAUGES</span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">12 Sectors</span>
        </div>

        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {nepseData.sectors?.map((sec: any) => {
            const isPos = sec.index_change_percent >= 0;
            return (
              <div
                key={sec.name}
                className="bg-[#141b2e] p-2 rounded-lg border border-[#1f2b45] flex items-center justify-between text-xs font-mono"
              >
                <div>
                  <span className="text-slate-200 font-semibold block text-[11px]">
                    {sec.name}
                  </span>
                  <span className="text-[9px] text-slate-400">
                    {sec.symbols_count} listed scrips
                  </span>
                </div>
                <span
                  className={`text-[11px] font-bold ${
                    isPos ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {isPos ? '+' : ''}
                  {sec.index_change_percent}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Institutional Strategy & Risk Overview Card */}
      <div className="bg-[#0f1424] border border-[#1c2438] rounded-xl p-3 space-y-2 text-xs font-mono">
        <div className="flex items-center gap-1.5 text-amber-400 font-bold">
          <BarChart3 className="w-3.5 h-3.5" />
          <span>BIBEK RISK MODEL</span>
        </div>
        <div className="text-[11px] text-slate-300 space-y-1 bg-[#121829] p-2.5 rounded-lg border border-[#1e293b]">
          <div className="flex justify-between">
            <span className="text-slate-400">Account Size:</span>
            <span className="text-white font-bold">NPR 1,000,000</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Max Risk per Trade:</span>
            <span className="text-amber-300 font-bold">1.0% (NPR 10,000)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Max Daily Drawdown:</span>
            <span className="text-rose-400 font-bold">3.0% (NPR 30,000)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Min Risk/Reward:</span>
            <span className="text-cyan-400 font-bold">1 : 2.0</span>
          </div>
        </div>
      </div>
    </div>
  );
};
