import React from 'react';
import {
  MessageSquare, FolderKanban, Globe, FileText, Image as ImageIcon,
  Sparkles, Brain, Cpu, Settings, Plus, Layers, Database
} from 'lucide-react';
import { User } from '../types';

export type NavSection = 'chats' | 'projects' | 'search' | 'files' | 'images' | 'deep_research' | 'trading_ai' | 'memory' | 'settings';

interface NavigationSidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  onNewChat: () => void;
  user: User | null;
  onOpenSettings: () => void;
}

export const NavigationSidebar: React.FC<NavigationSidebarProps> = ({
  activeSection,
  onSelectSection,
  onNewChat,
  user,
  onOpenSettings,
}) => {
  const navItems = [
    { id: 'chats' as NavSection, label: 'Chats', icon: MessageSquare },
    { id: 'projects' as NavSection, label: 'Projects', icon: FolderKanban },
    { id: 'search' as NavSection, label: 'Search', icon: Globe },
    { id: 'files' as NavSection, label: 'Files', icon: FileText },
    { id: 'images' as NavSection, label: 'Images', icon: ImageIcon },
    { id: 'deep_research' as NavSection, label: 'Deep Research', icon: Sparkles },
    { id: 'trading_ai' as NavSection, label: '🧠 Trading AI', icon: Cpu, isHighlight: true },
    { id: 'memory' as NavSection, label: 'Memory', icon: Database },
  ];

  return (
    <aside className="w-60 h-full bg-[#050812] border-r border-[#151e33] flex flex-col p-3 text-slate-200 select-none font-['Plus_Jakarta_Sans',sans-serif] shrink-0">
      {/* ── Brand Header ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-2 py-3 border-b border-[#141d33] mb-3">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-400 to-blue-600 flex items-center justify-center font-black text-black font-mono text-base shadow-[0_0_15px_rgba(34,211,238,0.4)]">
          S
        </div>
        <div>
          <h1 className="font-extrabold text-sm text-white tracking-wide font-mono">SHACHINA</h1>
          <span className="text-[10px] text-cyan-400 font-mono font-bold block -mt-0.5">TRADING & GENERAL AI</span>
        </div>
      </div>

      {/* ── + New Chat Button ────────────────────────────────────────────────── */}
      <button
        onClick={onNewChat}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-extrabold text-xs tracking-wide shadow-lg transition-all mb-4 font-mono"
      >
        <Plus className="w-4 h-4" />
        <span>New Chat</span>
      </button>

      {/* ── Nav Links ───────────────────────────────────────────────────────── */}
      <nav className="flex-1 space-y-1 overflow-y-auto font-mono text-xs">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectSection(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-left ${
                item.isHighlight
                  ? isActive
                    ? 'bg-gradient-to-r from-cyan-500/25 to-emerald-500/25 border border-cyan-400 text-cyan-300 font-black shadow-[0_0_12px_rgba(34,211,238,0.2)]'
                    : 'bg-[#0d1424] hover:bg-[#131f38] border border-cyan-800/40 text-cyan-400 font-extrabold'
                  : isActive
                  ? 'bg-[#121c33] text-cyan-300 font-bold border border-[#1e2a44]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#0c1222]'
              }`}
            >
              <Icon className={`w-4 h-4 ${item.isHighlight ? 'text-cyan-300' : isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
              <span className="flex-1 truncate">{item.label}</span>
              {item.isHighlight && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Footer Settings ─────────────────────────────────────────────────── */}
      <div className="pt-3 border-t border-[#141d33] mt-2 space-y-1">
        <button
          onClick={onOpenSettings}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-left text-xs font-mono ${
            activeSection === 'settings'
              ? 'bg-[#121c33] text-cyan-300 font-bold'
              : 'text-slate-400 hover:text-slate-200 hover:bg-[#0c1222]'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </button>

        {user && (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#090e1c] border border-[#18233c] text-xs">
            <div className="w-6 h-6 rounded-full bg-cyan-950 border border-cyan-500/50 flex items-center justify-center font-bold text-cyan-300 font-mono text-[10px]">
              {user.username?.[0]?.toUpperCase() || 'B'}
            </div>
            <div className="flex-1 truncate">
              <div className="text-white font-bold truncate text-[11px]">{user.full_name || user.username}</div>
              <div className="text-[9px] text-slate-500 truncate font-mono">{user.email}</div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
