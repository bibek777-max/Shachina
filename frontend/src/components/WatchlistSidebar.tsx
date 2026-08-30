import React, { useState } from 'react';
import { MarketType, SymbolInfo } from '../types';
import { Search, TrendingUp, TrendingDown, Layers, ChevronRight } from 'lucide-react';

interface WatchlistSidebarProps {
  activeMarket: MarketType;
  onSelectMarket: (m: MarketType) => void;
  symbols: SymbolInfo[];
  selectedSymbol: string;
  onSelectSymbol: (sym: string) => void;
}

export const WatchlistSidebar: React.FC<WatchlistSidebarProps> = ({
  activeMarket,
  onSelectMarket,
  symbols,
  selectedSymbol,
  onSelectSymbol,
}) => {
  const [search, setSearch] = useState('');
  const [selectedSector, setSelectedSector] = useState('ALL');

  const sectors = ['ALL', ...Array.from(new Set(symbols.map((s) => s.sector).filter(Boolean) as string[]))];

  const filteredSymbols = symbols.filter((s) => {
    const matchesSearch = s.symbol.toLowerCase().includes(search.toLowerCase()) || s.name.toLowerCase().includes(search.toLowerCase());
    const matchesSector = selectedSector === 'ALL' || s.sector === selectedSector;
    return matchesSearch && matchesSector;
  });

  return (
    <aside className="w-80 flex flex-col h-full bg-[#0c101c] border-r border-[#1c2438] shrink-0 select-none">
      {/* Market Selector Tabs */}
      <div className="p-3 border-b border-[#1c2438] bg-[#090d16]">
        <div className="grid grid-cols-3 gap-1 p-1 bg-[#121829] rounded-lg border border-[#1e293b]">
          {(['NEPSE', 'CRYPTO', 'US_STOCKS'] as MarketType[]).map((m) => (
            <button
              key={m}
              onClick={() => onSelectMarket(m)}
              className={`py-1.5 px-2 rounded-md text-[11px] font-mono font-bold tracking-tight transition-all ${
                activeMarket === m
                  ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              {m === 'NEPSE' ? '🇳🇵 NEPSE' : m === 'CRYPTO' ? '🪙 CRYPTO' : '🇺🇸 US STOCKS'}
            </button>
          ))}
        </div>
      </div>

      {/* Search and Sector Filter */}
      <div className="p-3 border-b border-[#1c2438] space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder={`Search ${activeMarket} instruments...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#121829] border border-[#1e293b] rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/70 font-mono"
          />
        </div>

        {/* Sector Filter Chips */}
        {sectors.length > 2 && (
          <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar text-[10px]">
            {sectors.map((sec) => (
              <button
                key={sec}
                onClick={() => setSelectedSector(sec)}
                className={`px-2 py-0.5 rounded-full whitespace-nowrap transition-colors font-mono ${
                  selectedSector === sec
                    ? 'bg-cyan-950 text-cyan-300 border border-cyan-700/60 font-semibold'
                    : 'bg-[#151c2d] text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                {sec}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Watchlist Instrument List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#172033]/60">
        {filteredSymbols.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs font-mono">
            No instruments found matching filter.
          </div>
        ) : (
          filteredSymbols.map((item) => {
            const isSelected = item.symbol === selectedSymbol;
            return (
              <div
                key={item.symbol}
                onClick={() => onSelectSymbol(item.symbol)}
                className={`p-3 cursor-pointer transition-all flex items-center justify-between group ${
                  isSelected
                    ? 'bg-cyan-950/40 border-l-2 border-cyan-400 shadow-inner'
                    : 'hover:bg-[#121829]'
                }`}
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`font-mono font-bold text-xs tracking-wide ${
                        isSelected ? 'text-cyan-300' : 'text-slate-100 group-hover:text-cyan-300'
                      }`}
                    >
                      {item.symbol}
                    </span>
                    <span className="text-[9px] text-slate-400 bg-[#162035] px-1 rounded font-mono">
                      {item.currency}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate max-w-[160px]">
                    {item.name}
                  </p>
                  {item.sector && (
                    <span className="text-[9px] text-slate-500 block truncate">
                      {item.sector}
                    </span>
                  )}
                </div>

                <div className="text-right shrink-0 flex items-center gap-2">
                  <ChevronRight
                    className={`w-3.5 h-3.5 transition-transform ${
                      isSelected ? 'text-cyan-400 translate-x-0.5' : 'text-slate-600 group-hover:text-slate-400'
                    }`}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
