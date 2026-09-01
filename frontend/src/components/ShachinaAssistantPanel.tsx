import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Mic, MicOff, Volume2, VolumeX, Send, Loader2, Sparkles, Plus,
  MessageSquare, Search, Trash2, CheckCircle, Activity, Copy, Check,
  Download, Code, RotateCw, Edit3
} from 'lucide-react';
import { voiceEngine } from '../services/voiceEngine';
import { api } from '../services/api';
import { User, Conversation, ConversationMessage, ChartAnnotations, TradeProposal } from '../types';

interface ShachinaAssistantPanelProps {
  selectedSymbol: string;
  selectedMarket?: string;
  user?: User | null;
  onClose?: () => void;
  onAnnotationsReceived?: (annotations: ChartAnnotations) => void;
  onOrderPlaced?: () => void;
  isEmbedded?: boolean;
}

// ─── Code Block Renderer with One-Click Copy ──────────────────────────────────
const CodeBlock: React.FC<{ code: string; language?: string }> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 rounded-xl overflow-hidden border border-[#22304e] bg-[#050812] font-mono text-[11px] shadow-lg">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#0b1222] border-b border-[#1c2944] text-[10px] text-slate-400">
        <span className="flex items-center gap-1.5 text-cyan-400 font-bold uppercase tracking-wider">
          <Code className="w-3.5 h-3.5" /> {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#16233b] hover:bg-cyan-950 text-slate-300 hover:text-cyan-300 transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-cyan-100 font-mono text-[11px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
};

// ─── Markdown Content Parser (Code blocks, tables, bold, lists) ──────────────
const FormattedMessage: React.FC<{ content: string }> = ({ content }) => {
  const parts: React.ReactNode[] = [];
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(renderTextAndTables(content.substring(lastIndex, match.index), `txt_${lastIndex}`));
    }
    const lang = match[1] || 'code';
    const code = match[2];
    parts.push(<CodeBlock key={`code_${match.index}`} language={lang} code={code} />);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(renderTextAndTables(content.substring(lastIndex), `txt_${lastIndex}`));
  }

  return <div className="space-y-1">{parts}</div>;
};

function renderTextAndTables(text: string, keyPrefix: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let tableRows: string[] = [];
  let inTable = false;

  const flushTable = (idx: number) => {
    if (tableRows.length > 0) {
      elements.push(
        <div key={`${keyPrefix}_tbl_${idx}`} className="my-2 overflow-x-auto rounded-lg border border-[#1e2a44] bg-[#070b16]">
          <table className="min-w-full text-[10px] text-left">
            <tbody>
              {tableRows.map((row, rIdx) => {
                const cols = row.split('|').filter((_, cIdx, arr) => cIdx > 0 && cIdx < arr.length - 1);
                const isHeader = rIdx === 0;
                const isSeparator = row.includes('---');
                if (isSeparator) return null;
                return (
                  <tr key={rIdx} className={isHeader ? 'bg-[#0f172a] text-cyan-300 font-bold border-b border-[#1e2a44]' : 'border-b border-[#162035] hover:bg-[#0c1324]'}>
                    {cols.map((col, cIdx) => (
                      <td key={cIdx} className="px-2.5 py-1.5">
                        {renderInlineFormatting(col.trim())}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
    }
  };

  lines.forEach((line, i) => {
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      inTable = true;
      tableRows.push(line.trim());
    } else {
      if (inTable) {
        flushTable(i);
        inTable = false;
      }
      if (line.trim().length > 0) {
        elements.push(
          <div key={`${keyPrefix}_l_${i}`} className="leading-relaxed">
            {renderInlineFormatting(line)}
          </div>
        );
      } else {
        elements.push(<div key={`${keyPrefix}_sp_${i}`} className="h-1" />);
      }
    }
  });

  if (inTable) flushTable(lines.length);
  return <React.Fragment key={keyPrefix}>{elements}</React.Fragment>;
}

function renderInlineFormatting(line: string): React.ReactNode {
  if (line.startsWith('### ')) {
    return <h4 className="text-cyan-300 font-bold text-xs mt-2 mb-1">{line.slice(4)}</h4>;
  }
  if (line.startsWith('## ')) {
    return <h3 className="text-white font-extrabold text-xs mt-2 mb-1">{line.slice(3)}</h3>;
  }
  if (line.startsWith('• ') || line.startsWith('- ')) {
    return (
      <span className="flex items-start gap-1.5">
        <span className="text-cyan-400 mt-0.5">•</span>
        <span>{renderBoldAndCode(line.slice(2))}</span>
      </span>
    );
  }
  return renderBoldAndCode(line);
}

function renderBoldAndCode(text: string): React.ReactNode {
  const chunks = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return chunks.map((chunk, idx) => {
    if (chunk.startsWith('`') && chunk.endsWith('`') && chunk.length > 2) {
      return (
        <code key={idx} className="bg-[#121c33] text-cyan-300 px-1 py-0.2 rounded font-mono text-[10px] border border-[#202f4e]">
          {chunk.slice(1, -1)}
        </code>
      );
    }
    if (chunk.startsWith('**') && chunk.endsWith('**') && chunk.length > 4) {
      return (
        <strong key={idx} className="font-bold text-white">
          {chunk.slice(2, -2)}
        </strong>
      );
    }
    return <span key={idx}>{chunk}</span>;
  });
}

// ─── Main Assistant Panel Component ──────────────────────────────────────────
export const ShachinaAssistantPanel: React.FC<ShachinaAssistantPanelProps> = ({
  selectedSymbol, selectedMarket = 'NEPSE', user, onClose, onAnnotationsReceived, onOrderPlaced, isEmbedded = false,
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [lang, setLang] = useState<'ne' | 'en' | 'hi'>('ne');
  const [analysisMode, setAnalysisMode] = useState<'beginner' | 'pro'>('pro');
  const [activeCategory, setActiveCategory] = useState<'all' | 'ai' | 'code' | 'trading'>('all');

  // Voice state
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [voiceWave, setVoiceWave] = useState<boolean>(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  const [currentDecision, setCurrentDecision] = useState<'BUY' | 'SELL' | 'WAIT' | 'NO_TRADE'>('WAIT');
  const [currentRegime, setCurrentRegime] = useState<string>('RANGING');
  const [activeProposal, setActiveProposal] = useState<TradeProposal | null>(null);
  const [inputText, setInputText] = useState<string>('');
  const [interimText, setInterimText] = useState<string>('');
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [executingOrder, setExecutingOrder] = useState<boolean>(false);
  const [executionNotice, setExecutionNotice] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    voiceEngine.isMuted = !voiceEnabled;
    if (!voiceEnabled) { voiceEngine.stop(); setSpeakingMsgId(null); setVoiceWave(false); }
  }, [voiceEnabled]);

  const loadConversations = useCallback(async () => {
    try {
      const convs = await api.getConversations();
      setConversations(convs);
      if (convs.length > 0 && !activeConvId) {
        setActiveConvId(convs[0].id);
        const full = await api.getConversation(convs[0].id);
        setMessages(full.messages || []);
      }
    } catch {}
  }, [activeConvId]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (!activeConvId) return;
    (async () => { try { const full = await api.getConversation(activeConvId); setMessages(full.messages || []); } catch {} })();
  }, [activeConvId]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, interimText, isGenerating]);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.askAssistant({
          message: `Quick technical market structure scan on ${selectedSymbol}`,
          symbol: selectedSymbol,
          market: selectedMarket,
          language: lang,
          analysis_mode: analysisMode,
          web_search: false,
          deep_research: false,
          is_trading_only: true,
        });
        if (res.chart_annotations && onAnnotationsReceived) onAnnotationsReceived(res.chart_annotations);
        if (res.trade_proposal) {
          setActiveProposal(res.trade_proposal);
          const dec = res.trade_proposal.decision || (res.trade_proposal.direction === 'BUY' ? 'BUY' : 'WAIT');
          setCurrentDecision(dec === 'YES' || dec === 'BUY' ? 'BUY' : dec === 'NO' ? 'NO_TRADE' : 'WAIT');
        } else { setCurrentDecision('WAIT'); }
      } catch {}
    })();
  }, [selectedSymbol, selectedMarket]);

  const handleNewChat = async () => {
    try {
      const newConv = await api.createConversation(`Trading Analysis ${selectedSymbol}`);
      setConversations((prev) => [newConv, ...prev]);
      setActiveConvId(newConv.id); setMessages([]); setIsDrawerOpen(false);
    } catch {}
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConvId === id) { setActiveConvId(null); setMessages([]); }
    } catch {}
  };

  const exportConversation = () => {
    if (messages.length === 0) return;
    const txt = messages.map(m => `[${m.role.toUpperCase()}] ${m.created_at}\n${m.content}\n\n`).join('-------------------\n\n');
    const blob = new Blob([txt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shachina_trading_chat_${selectedSymbol}_${Date.now()}.txt`;
    a.click();
  };

  const copyMessageContent = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const speakMessage = (msg: ConversationMessage) => {
    if (!voiceEnabled) return;
    const text = msg.speech_text || msg.content;
    if (!text) return;
    if (speakingMsgId === msg.id) { voiceEngine.stop(); setSpeakingMsgId(null); setVoiceWave(false); return; }
    voiceEngine.stop();
    setSpeakingMsgId(msg.id); setVoiceWave(true);
    voiceEngine.speak(text, lang, msg.id,
      () => { setSpeakingMsgId(msg.id); setVoiceWave(true); },
      () => { setSpeakingMsgId(null); setVoiceWave(false); }
    );
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isGenerating) return;
    voiceEngine.stop();
    setSpeakingMsgId(null);
    setVoiceWave(false);

    setInputText(''); setInterimText(''); setIsGenerating(true);
    let convId = activeConvId;
    if (!convId) {
      try {
        const newConv = await api.createConversation(`${selectedSymbol}: ${text.slice(0, 24)}`);
        setConversations((prev) => [newConv, ...prev]);
        setActiveConvId(newConv.id); convId = newConv.id;
      } catch {}
    }
    const tempUserMsg: ConversationMessage = { id: `tmp_${Date.now()}`, role: 'user', content: text, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, tempUserMsg]);
    try {
      const historyPayload = messages.slice(-8).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));
      const res = await api.askAssistant({
        message: text,
        symbol: selectedSymbol,
        market: selectedMarket,
        language: lang,
        analysis_mode: analysisMode,
        conversation_id: convId || undefined,
        history: historyPayload,
        web_search: false,
        deep_research: false,
        is_trading_only: true,
      });
      const asstId = `asst_${Date.now()}`;
      const asstMsg: ConversationMessage = { id: asstId, role: 'shachina', content: res.response, speech_text: res.speech_text, annotations: res.chart_annotations, trade_proposal: res.trade_proposal, created_at: new Date().toISOString() };
      setMessages((prev) => [...prev, asstMsg]);
      if (res.trade_proposal) {
        setActiveProposal(res.trade_proposal);
        const dec = res.trade_proposal.decision;
        setCurrentDecision(dec === 'YES' || dec === 'BUY' ? 'BUY' : dec === 'NO' ? 'NO_TRADE' : 'WAIT');
      }
      if (res.chart_annotations && onAnnotationsReceived) onAnnotationsReceived(res.chart_annotations);
      if (voiceEnabled && res.speech_text) {
        setSpeakingMsgId(asstId); setVoiceWave(true);
        voiceEngine.speak(res.speech_text, lang, asstId,
          () => { setSpeakingMsgId(asstId); setVoiceWave(true); },
          () => { setSpeakingMsgId(null); setVoiceWave(false); }
        );
      }
    } catch (err: any) {
      setMessages((prev) => [...prev, { id: `err_${Date.now()}`, role: 'shachina', content: `⚠️ ${err.message || 'Connection lost.'}`, created_at: new Date().toISOString() }]);
    } finally { setIsGenerating(false); }
  };

  // Regenerate last response
  const handleRegenerateLast = () => {
    if (isGenerating) return;
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      handleSendMessage(lastUserMsg.content);
    }
  };

  const toggleListening = () => {
    if (isListening) { voiceEngine.stop(); setIsListening(false); return; }
    voiceEngine.stop(); setIsListening(true);
    voiceEngine.listen(lang,
      (preview) => setInterimText(preview),
      (finalText) => { setIsListening(false); setInterimText(''); handleSendMessage(finalText); },
      () => { setIsListening(false); setInterimText(''); },
      () => setIsListening(false)
    );
  };

  const handleExecuteTradeProposal = async (proposal: TradeProposal) => {
    setExecutingOrder(true); setExecutionNotice(null);
    try {
      const res = await api.placeOrder({ symbol: proposal.symbol, market: proposal.market, order_type: proposal.direction, quantity: proposal.quantity || proposal.suggested_shares || 10, price: proposal.entry_price, stop_loss: proposal.stop_loss, target: proposal.target_1, confirmed: true });
      setExecutionNotice(`✓ ${res.message}`);
      if (onOrderPlaced) onOrderPlaced();
      if (voiceEnabled) voiceEngine.speak(`Order confirmed. ${proposal.direction} ${proposal.quantity || 10} shares of ${proposal.symbol} executed.`, lang);
      setTimeout(() => setExecutionNotice(null), 5000);
    } catch (err: any) {
      setExecutionNotice(`⚠️ ${err.message}`);
      setTimeout(() => setExecutionNotice(null), 5000);
    } finally { setExecutingOrder(false); }
  };

  const filteredConvs = conversations.filter((c) => c.title.toLowerCase().includes(searchQuery.toLowerCase()));

  // Categorized Prompt Suggestions (Strictly Quantitative Trading Focus)
  const promptPills = {
    all: [
      `Analyze ${selectedSymbol} market structure`,
      `Is ${selectedSymbol} a BUY, SELL, or WAIT?`,
      `Where are ${selectedSymbol} order blocks & liquidity?`,
      `What is the stop loss and target for ${selectedSymbol}?`,
    ],
    ai: [
      `Identify ${selectedSymbol} trend & swing points (HH/HL/LH/LL)`,
      `Check BOS and CHoCH on ${selectedSymbol}`,
      `Show premium vs discount dealing range for ${selectedSymbol}`,
      `Analyze volume & momentum on ${selectedSymbol}`,
    ],
    code: [
      `Give exact Entry, SL, and TP targets for ${selectedSymbol}`,
      `Where is the invalidation level for ${selectedSymbol}?`,
      `What is the Risk/Reward ratio for ${selectedSymbol}?`,
      `Find key support and resistance zones for ${selectedSymbol}`,
    ],
    trading: [
      `Find Bullish / Bearish Order Blocks on ${selectedSymbol}`,
      `Identify Fair Value Gaps (FVG) on ${selectedSymbol}`,
      `Where is Buy-Side & Sell-Side Liquidity for ${selectedSymbol}?`,
      `Evaluate ${selectedSymbol} setup quality score`,
    ]
  };

  return (
    <div className="h-full w-full flex flex-col bg-[#080d18] border-l border-[#1a2337] text-slate-100 relative overflow-hidden font-['Plus_Jakarta_Sans',sans-serif] select-none">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="p-3 bg-[#050810] border-b border-[#161f33] space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => setIsDrawerOpen(!isDrawerOpen)} className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-300 transition-colors" title="Chat History">
              <MessageSquare className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-sm text-cyan-300 font-mono tracking-tight">TRADING AI</span>
              <span className="text-[9px] bg-cyan-950 text-cyan-400 border border-cyan-800 px-1.5 rounded font-bold font-mono">{selectedSymbol}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[10px]">
            <div className="flex bg-[#090d18] rounded-lg p-0.5 border border-[#1e293b]">
              <button onClick={() => setAnalysisMode('beginner')} className={`px-1.5 py-0.5 rounded font-bold transition-all ${analysisMode === 'beginner' ? 'bg-amber-500 text-black' : 'text-slate-400'}`}>Beginner</button>
              <button onClick={() => setAnalysisMode('pro')} className={`px-1.5 py-0.5 rounded font-bold transition-all ${analysisMode === 'pro' ? 'bg-cyan-400 text-black' : 'text-slate-400'}`}>Pro</button>
            </div>
            <select value={lang} onChange={(e) => setLang(e.target.value as any)} className="bg-[#141b2e] border border-[#202b46] rounded text-[10px] px-1 py-0.5 text-slate-300 focus:outline-none">
              <option value="ne">नेपाली+हिन्दी</option>
              <option value="en">English</option>
              <option value="hi">हिंदी</option>
            </select>
            {onClose && <button onClick={onClose} className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>}
          </div>
        </div>

        {/* VOICE TOGGLE — Siri-style glowing button */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setVoiceEnabled((v) => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border font-mono font-bold text-[11px] transition-all duration-300 ${voiceEnabled
              ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border-cyan-400/60 text-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.3)]'
              : 'bg-[#0d1424] border-slate-700/50 text-slate-500'}`}
          >
            {voiceEnabled ? (
              <>
                <span className="flex items-end gap-[2px] h-4">
                  {[5,9,6,4].map((h, i) => (
                    <span key={i} className={`w-[3px] rounded-full transition-all ${voiceWave ? 'bg-purple-400 animate-bounce' : 'bg-cyan-400'}`}
                      style={{ height: `${voiceWave ? [4,10,6,3][i] : h}px`, animationDelay: `${i*80}ms` }} />
                  ))}
                </span>
                <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>VOICE ON</span>
                <span className="text-[9px] text-cyan-500/60 font-normal">(Siri ♀)</span>
              </>
            ) : (
              <><VolumeX className="w-3.5 h-3.5" /><span>VOICE OFF — Click to Enable</span></>
            )}
          </button>
          {voiceWave && voiceEnabled && (
            <span className="text-[10px] text-purple-400 font-mono animate-pulse flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping inline-block" /> बोल्दैछ...
            </span>
          )}
        </div>

        {/* Decision + Regime Badges */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className={`flex items-center justify-center gap-2 p-2 rounded-xl border font-mono font-black text-xs tracking-wider shadow-lg ${currentDecision === 'BUY' ? 'bg-emerald-950/80 border-emerald-500 text-emerald-400' : currentDecision === 'SELL' ? 'bg-rose-950/80 border-rose-500 text-rose-400' : currentDecision === 'WAIT' ? 'bg-amber-950/80 border-amber-500 text-amber-400' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
            <span className="text-sm">{currentDecision === 'BUY' ? '🟢' : currentDecision === 'SELL' ? '🔴' : currentDecision === 'WAIT' ? '🟡' : '⚪'}</span>
            <span>{currentDecision === 'BUY' ? 'BUY / LONG' : currentDecision === 'SELL' ? 'SELL / SHORT' : currentDecision === 'WAIT' ? 'WAIT' : 'NO TRADE'}</span>
          </div>
          <div className="flex items-center justify-center gap-1.5 p-2 rounded-xl bg-[#0d1424] border border-[#1e2a44] font-mono text-[11px]">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">REGIME:</span>
            <span className="font-extrabold text-cyan-300">{currentRegime}</span>
          </div>
        </div>
      </div>

      {/* ── Chat History Drawer ────────────────────────────────────────────── */}
      {isDrawerOpen && (
        <div className="absolute inset-y-0 left-0 w-64 bg-[#050810] border-r border-[#161f33] z-30 flex flex-col p-3 shadow-2xl space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between border-b border-[#161f33] pb-2">
            <span className="font-extrabold text-cyan-300">Saved Chats</span>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button onClick={exportConversation} className="p-1 rounded bg-[#16233b] hover:bg-cyan-950 text-slate-300 hover:text-cyan-300" title="Export Conversation">
                  <Download className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={handleNewChat} className="flex items-center gap-1 px-2 py-1 rounded bg-cyan-400 hover:bg-cyan-300 text-black font-extrabold text-[10px]">
                <Plus className="w-3 h-3" /> New
              </button>
            </div>
          </div>
          <div className="relative">
            <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="text" placeholder="Search chats..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-[#0d1424] border border-[#1e2a44] rounded-lg pl-7 pr-2 py-1 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400" />
          </div>
          <div className="flex-1 overflow-y-auto space-y-1">
            {filteredConvs.map((c) => (
              <div key={c.id} onClick={async () => { setActiveConvId(c.id); setIsDrawerOpen(false); try { const full = await api.getConversation(c.id); setMessages(full.messages || []); } catch {} }}
                className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer group transition-colors ${activeConvId === c.id ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' : 'hover:bg-[#0d1424] text-slate-400'}`}>
                <span className="truncate flex-1 pr-2">{c.title}</span>
                <button onClick={(e) => handleDeleteConversation(c.id, e)} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-rose-900 text-rose-500 transition-all"><Trash2 className="w-2.5 h-2.5" /></button>
              </div>
            ))}
            {filteredConvs.length === 0 && <div className="text-center text-slate-600 pt-4">No chats yet</div>}
          </div>
          <button onClick={() => setIsDrawerOpen(false)} className="text-slate-500 hover:text-white text-[10px] text-center">Close ✕</button>
        </div>
      )}

      {/* ── Messages Area ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs font-mono">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
            <Sparkles className="w-8 h-8 text-cyan-900" />
            <p className="text-center text-[11px] leading-relaxed max-w-[220px]">
              Shachina तयार छ — Coding, Mathematics, Science, Translation, वा Trading सोध्नुहोस्।
            </p>

            {/* Prompt Categories */}
            <div className="flex items-center gap-1 bg-[#0a0f1d] p-1 rounded-lg border border-[#1a263f] text-[9px]">
              {(['all', 'trading', 'code', 'ai'] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-2 py-0.5 rounded uppercase font-bold transition-all ${
                    activeCategory === cat ? 'bg-cyan-400 text-black' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {cat === 'all' ? 'Popular' : cat}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-1.5 w-full max-w-[240px]">
              {promptPills[activeCategory].map((q) => (
                <button key={q} onClick={() => handleSendMessage(q)} className="text-[10px] px-2.5 py-1.5 rounded-lg bg-[#0d1424] border border-[#1e2a44] text-slate-400 hover:border-cyan-500/40 hover:text-cyan-300 transition-colors text-left truncate">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, idx) => (
          <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[92%] rounded-2xl p-3 text-[11px] leading-relaxed ${m.role === 'user' ? 'rounded-br-none bg-cyan-500/15 border border-cyan-500/30 text-cyan-100 group' : 'rounded-bl-none bg-[#0d1424] border border-[#1e2a44] text-slate-200 shadow-md'}`}>
              {m.role === 'shachina' && (
                <div className="flex items-center justify-between mb-2 border-b border-[#1c2842] pb-1">
                  <span className="text-[9px] font-black text-cyan-400 tracking-widest flex items-center gap-1">
                    ✦ SHACHINA AI
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => copyMessageContent(m.id, m.content)}
                      className="p-1 rounded hover:bg-[#16233b] text-slate-400 hover:text-cyan-300 transition-colors"
                      title="Copy response"
                    >
                      {copiedMsgId === m.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              )}

              {/* User message edit shortcut */}
              {m.role === 'user' && (
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[9px] text-cyan-500/70 uppercase font-bold">You</span>
                  <button
                    onClick={() => setInputText(m.content)}
                    className="opacity-60 hover:opacity-100 text-cyan-400 p-0.5 rounded transition-all"
                    title="Edit and resend"
                  >
                    <Edit3 className="w-2.5 h-2.5" />
                  </button>
                </div>
              )}

              {/* Formatted Message Content */}
              <FormattedMessage content={m.content} />

              {/* Per-message Speak button & Actions */}
              {m.role === 'shachina' && (
                <div className="mt-2.5 pt-1.5 border-t border-[#18233a] flex items-center justify-between gap-2">
                  <button onClick={() => speakMessage(m)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[9px] font-bold transition-all ${
                      speakingMsgId === m.id ? 'bg-purple-500/20 border border-purple-400/50 text-purple-300 animate-pulse'
                      : voiceEnabled ? 'bg-cyan-950/50 border border-cyan-800/30 text-cyan-600 hover:text-cyan-300 hover:border-cyan-500/50'
                      : 'bg-slate-900/40 border border-slate-700/20 text-slate-600 opacity-40 cursor-not-allowed'}`}>
                    {speakingMsgId === m.id ? (
                      <><span className="flex items-end gap-[2px] h-3">{[6,10,7].map((h,i)=><span key={i} className="w-[2px] bg-purple-400 rounded-full animate-bounce" style={{height:`${h}px`,animationDelay:`${i*80}ms`}} />)}</span><span>बोल्दैछ... (Stop)</span></>
                    ) : (
                      <><Volume2 className="w-3 h-3" /><span>🔊 सुन्नुहोस्</span></>
                    )}
                  </button>

                  {/* Regenerate if this is the last assistant message */}
                  {idx === messages.length - 1 && (
                    <button
                      onClick={handleRegenerateLast}
                      disabled={isGenerating}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#141d2e] hover:bg-cyan-950 text-slate-400 hover:text-cyan-300 text-[9px] font-mono transition-colors"
                      title="Regenerate response"
                    >
                      <RotateCw className={`w-2.5 h-2.5 ${isGenerating ? 'animate-spin' : ''}`} />
                      <span>Regenerate</span>
                    </button>
                  )}
                </div>
              )}

              {/* Trade Card */}
              {m.role === 'shachina' && m.trade_proposal && m.trade_proposal.entry_price && (
                <div className="mt-2.5 p-2.5 rounded-xl bg-[#080f1f] border border-[#1e2a44] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-300">📋 {m.trade_proposal.symbol} SETUP</span>
                    <span className={`px-2 py-0.5 rounded font-black text-[10px] ${m.trade_proposal.direction === 'BUY' ? 'bg-emerald-950 text-emerald-400 border border-emerald-700' : 'bg-rose-950 text-rose-400 border border-rose-700'}`}>
                      {m.trade_proposal.direction === 'BUY' ? 'LONG' : 'SHORT'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-300">
                    <div><span className="text-slate-500 block">ENTRY:</span><strong className="text-white font-mono">NPR {m.trade_proposal.entry_zone || m.trade_proposal.entry_price.toFixed(2)}</strong></div>
                    <div><span className="text-slate-500 block">STOP LOSS:</span><strong className="text-rose-400 font-mono">NPR {m.trade_proposal.stop_loss.toFixed(2)}</strong></div>
                    <div><span className="text-slate-500 block">TARGET 1:</span><strong className="text-emerald-400 font-mono">NPR {m.trade_proposal.target_1.toFixed(2)}</strong></div>
                    <div><span className="text-slate-500 block">TARGET 2:</span><strong className="text-teal-300 font-mono">NPR {(m.trade_proposal.target_2 || m.trade_proposal.target_1 * 1.05).toFixed(2)}</strong></div>
                    <div><span className="text-slate-500 block">R/R:</span><strong className="text-cyan-300 font-mono">{m.trade_proposal.risk_reward || '1:2.0'}</strong></div>
                    <div><span className="text-slate-500 block">QUALITY:</span><strong className="text-amber-400 font-mono">{m.trade_proposal.setup_quality || '6.5/10'}</strong></div>
                  </div>
                  <button onClick={() => handleExecuteTradeProposal(m.trade_proposal!)} disabled={executingOrder} className="w-full mt-2 py-2 rounded-lg bg-gradient-to-r from-cyan-400 to-emerald-500 hover:from-cyan-300 hover:to-emerald-400 disabled:opacity-50 text-black font-extrabold text-[11px] tracking-wider shadow-lg flex items-center justify-center gap-1.5 transition-all font-mono">
                    <CheckCircle className="w-3.5 h-3.5" />
                    {executingOrder ? 'EXECUTING...' : 'CONFIRM & EXECUTE TRADE'}
                  </button>
                </div>
              )}
            </div>
            <span className="text-[9px] text-slate-500 font-mono mt-0.5 px-1">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        ))}
        {interimText && (
          <div className="flex flex-col items-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-none p-2.5 bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs font-mono animate-pulse">🎙️ "{interimText}"</div>
          </div>
        )}
        {isGenerating && (
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 p-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Shachina reasoning & analyzing...</span>
          </div>
        )}
        {executionNotice && <div className="p-2.5 rounded-xl bg-cyan-950/90 border border-cyan-400 text-cyan-300 text-xs font-mono font-bold">{executionNotice}</div>}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input Bar ──────────────────────────────────────────────────────── */}
      <div className="p-2.5 bg-[#050810] border-t border-[#161f33]">
        {/* Quick shortcut chips */}
        <div className="flex gap-1.5 mb-2 overflow-x-auto pb-0.5 scrollbar-none">
          {['कति profit?', 'P&L report', 'NABIL setup?', 'Market overview', 'Write Python code'].map((q) => (
            <button key={q} onClick={() => handleSendMessage(q)} className="flex-shrink-0 text-[9px] px-2 py-1 rounded-lg bg-[#0d1424] border border-[#1e2a44] text-slate-400 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors font-mono whitespace-nowrap">{q}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 bg-[#0d1424] border border-[#1e2a44] rounded-xl px-3 py-2 focus-within:border-cyan-400 transition-colors">
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder={isListening ? '🎙️ सुनिरहेको छ...' : 'Ask coding, science, P&L, or trade setup...'}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none font-mono resize-none max-h-24 overflow-y-auto"
          />
          <button onClick={() => setVoiceEnabled((v) => !v)} className={`p-1.5 rounded-lg transition-all ${voiceEnabled ? 'text-cyan-400 hover:bg-cyan-950' : 'text-slate-600 hover:bg-slate-800'}`} title="Toggle Voice">
            {voiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>
          <button onClick={toggleListening} className={`p-1.5 rounded-lg transition-all ${isListening ? 'bg-rose-600 text-white animate-pulse' : 'hover:bg-slate-800 text-slate-400 hover:text-cyan-300'}`}>
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <button onClick={() => handleSendMessage()} disabled={!inputText.trim() || isGenerating} className="p-1.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 disabled:opacity-30 text-black transition-all">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
