import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send, Mic, MicOff, Volume2, VolumeX, Plus, Paperclip, Image as ImageIcon,
  FileText, Globe, Sparkles, Copy, Check, RotateCw, Trash2, Download,
  Code, Loader2, Search, ArrowUp, X, CheckCircle, Activity, ExternalLink
} from 'lucide-react';
import { voiceEngine } from '../services/voiceEngine';
import { api } from '../services/api';
import {
  User, Conversation, ConversationMessage, ChartAnnotations, TradeProposal
} from '../types';

interface MainChatViewProps {
  user: User | null;
  selectedSymbol: string;
  selectedMarket: string;
  timeframe: string;
  initialMode?: 'chats' | 'search' | 'files' | 'images' | 'deep_research';
  activeProjectId?: string | null;
  onOpenTradingAI?: () => void;
  onAnnotationsReceived?: (annotations: ChartAnnotations) => void;
}

// ─── Code Block Renderer ───────────────────────────────────────────────────────
const CodeBlock: React.FC<{ code: string; language?: string }> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2.5 rounded-xl overflow-hidden border border-[#22304e] bg-[#050812] font-mono text-xs shadow-xl">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#0b1222] border-b border-[#1c2944] text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5 text-cyan-400 font-bold uppercase tracking-wider">
          <Code className="w-3.5 h-3.5" /> {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-[#16233b] hover:bg-cyan-950 text-slate-300 hover:text-cyan-300 transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-cyan-100 font-mono text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
};

// ─── Markdown Content Parser ───────────────────────────────────────────────────
const FormattedContent: React.FC<{ content: string }> = ({ content }) => {
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

  return <div className="space-y-1.5">{parts}</div>;
};

function renderTextAndTables(text: string, keyPrefix: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let tableRows: string[] = [];
  let inTable = false;

  const flushTable = (idx: number) => {
    if (tableRows.length > 0) {
      elements.push(
        <div key={`${keyPrefix}_tbl_${idx}`} className="my-2.5 overflow-x-auto rounded-xl border border-[#1e2a44] bg-[#070b16]">
          <table className="min-w-full text-xs text-left">
            <tbody>
              {tableRows.map((row, rIdx) => {
                const cols = row.split('|').filter((_, cIdx, arr) => cIdx > 0 && cIdx < arr.length - 1);
                const isHeader = rIdx === 0;
                const isSeparator = row.includes('---');
                if (isSeparator) return null;
                return (
                  <tr key={rIdx} className={isHeader ? 'bg-[#0f172a] text-cyan-300 font-bold border-b border-[#1e2a44]' : 'border-b border-[#162035] hover:bg-[#0c1324]'}>
                    {cols.map((col, cIdx) => (
                      <td key={cIdx} className="px-3 py-2">
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
        elements.push(<div key={`${keyPrefix}_sp_${i}`} className="h-1.5" />);
      }
    }
  });

  if (inTable) flushTable(lines.length);
  return <React.Fragment key={keyPrefix}>{elements}</React.Fragment>;
}

function renderInlineFormatting(line: string): React.ReactNode {
  if (line.startsWith('### ')) {
    return <h4 className="text-cyan-300 font-bold text-sm mt-3 mb-1">{line.slice(4)}</h4>;
  }
  if (line.startsWith('## ')) {
    return <h3 className="text-white font-extrabold text-base mt-3 mb-1.5">{line.slice(3)}</h3>;
  }
  if (line.startsWith('# ')) {
    return <h2 className="text-white font-black text-lg mt-4 mb-2">{line.slice(2)}</h2>;
  }
  if (line.startsWith('• ') || line.startsWith('- ')) {
    return (
      <div className="flex items-start gap-2 pl-1">
        <span className="text-cyan-400 mt-1">•</span>
        <span>{renderBoldAndCode(line.slice(2))}</span>
      </div>
    );
  }
  return renderBoldAndCode(line);
}

function renderBoldAndCode(text: string): React.ReactNode {
  const chunks = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return chunks.map((chunk, idx) => {
    if (chunk.startsWith('`') && chunk.endsWith('`') && chunk.length > 2) {
      return (
        <code key={idx} className="bg-[#121c33] text-cyan-300 px-1.5 py-0.5 rounded font-mono text-[11px] border border-[#202f4e]">
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

// ─── Main Chat View Component ─────────────────────────────────────────────────
export const MainChatView: React.FC<MainChatViewProps> = ({
  user,
  selectedSymbol,
  selectedMarket,
  timeframe,
  initialMode = 'chats',
  activeProjectId,
  onOpenTradingAI,
  onAnnotationsReceived,
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [interimText, setInterimText] = useState<string>('');
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [thinkingStatus, setThinkingStatus] = useState<string | null>(null);

  // Multi-modal & Tools Toggles
  const [imageData, setImageData] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<{ name: string; type: string; content: string } | null>(null);
  const [webSearchEnabled, setWebSearchEnabled] = useState<boolean>(initialMode === 'search');
  const [deepResearchEnabled, setDeepResearchEnabled] = useState<boolean>(initialMode === 'deep_research');
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState<boolean>(false);

  // Voice state
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [voiceWave, setVoiceWave] = useState<boolean>(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (initialMode === 'search') setWebSearchEnabled(true);
    if (initialMode === 'deep_research') setDeepResearchEnabled(true);
  }, [initialMode]);

  useEffect(() => {
    voiceEngine.isMuted = !voiceEnabled;
    if (!voiceEnabled) {
      voiceEngine.stop();
      setSpeakingMsgId(null);
      setVoiceWave(false);
    }
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
    (async () => {
      try {
        const full = await api.getConversation(activeConvId);
        setMessages(full.messages || []);
      } catch {}
    })();
  }, [activeConvId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, interimText, isGenerating, thinkingStatus]);

  const handleNewChat = async () => {
    try {
      const newConv = await api.createConversation('New Conversation');
      setConversations((prev) => [newConv, ...prev]);
      setActiveConvId(newConv.id);
      setMessages([]);
      setImageData(null);
      setAttachedFile(null);
    } catch {}
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImageData(reader.result as string);
      setIsPlusMenuOpen(false);
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setAttachedFile({
        name: file.name,
        type: file.name.split('.').pop() || 'txt',
        content: reader.result as string,
      });
      setIsPlusMenuOpen(false);
    };
    reader.readAsText(file);
  };

  const speakMessage = (msg: ConversationMessage) => {
    if (!voiceEnabled) return;
    const text = msg.speech_text || msg.content;
    if (!text) return;
    if (speakingMsgId === msg.id) {
      voiceEngine.stop();
      setSpeakingMsgId(null);
      setVoiceWave(false);
      return;
    }
    voiceEngine.stop();
    setSpeakingMsgId(msg.id);
    setVoiceWave(true);
    voiceEngine.speak(
      text,
      user?.preferences?.language || 'ne',
      msg.id,
      () => { setSpeakingMsgId(msg.id); setVoiceWave(true); },
      () => { setSpeakingMsgId(null); setVoiceWave(false); }
    );
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if ((!text && !imageData && !attachedFile) || isGenerating) return;

    voiceEngine.stop();
    setSpeakingMsgId(null);
    setVoiceWave(false);

    setInputText('');
    setInterimText('');
    setIsGenerating(true);

    const currentImg = imageData;
    const currentDoc = attachedFile;
    setImageData(null);
    setAttachedFile(null);

    // Initial thinking status
    if (webSearchEnabled || deepResearchEnabled) {
      setThinkingStatus('🔎 Searching verified web sources...');
    } else if (currentImg) {
      setThinkingStatus('🖼 Analyzing image & visual features...');
    } else if (currentDoc) {
      setThinkingStatus(`📄 Reading file: ${currentDoc.name}...`);
    } else {
      setThinkingStatus('🧠 Thinking...');
    }

    let convId = activeConvId;
    if (!convId) {
      try {
        const newConv = await api.createConversation(text.slice(0, 30) || 'New Conversation');
        setConversations((prev) => [newConv, ...prev]);
        setActiveConvId(newConv.id);
        convId = newConv.id;
      } catch {}
    }

    const tempUserMsg: ConversationMessage = {
      id: `tmp_${Date.now()}`,
      role: 'user',
      content: text || (currentImg ? '🖼 [Uploaded Image for Analysis]' : '📄 [Uploaded Document for Analysis]'),
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const historyPayload = messages.slice(-8).map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      }));

      const res = await api.askAssistant({
        message: text || 'Please analyze the attached content in detail.',
        symbol: selectedSymbol,
        market: selectedMarket,
        timeframe: timeframe,
        language: user?.preferences?.language || 'ne',
        analysis_mode: user?.preferences?.analysis_mode || 'pro',
        conversation_id: convId || undefined,
        history: historyPayload,
        image_data: currentImg || undefined,
        file_data: currentDoc || undefined,
        web_search: webSearchEnabled,
        deep_research: deepResearchEnabled,
        project_id: activeProjectId || undefined,
        enable_memory: true,
      });

      const asstId = `asst_${Date.now()}`;
      const asstMsg: ConversationMessage = {
        id: asstId,
        role: 'shachina',
        content: res.response,
        speech_text: res.speech_text,
        annotations: res.chart_annotations,
        trade_proposal: res.trade_proposal,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, asstMsg]);

      if (res.chart_annotations && onAnnotationsReceived) {
        onAnnotationsReceived(res.chart_annotations);
      }

      if (voiceEnabled && res.speech_text) {
        setSpeakingMsgId(asstId);
        setVoiceWave(true);
        voiceEngine.speak(
          res.speech_text,
          user?.preferences?.language || 'ne',
          asstId,
          () => { setSpeakingMsgId(asstId); setVoiceWave(true); },
          () => { setSpeakingMsgId(null); setVoiceWave(false); }
        );
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'shachina',
          content: `⚠️ ${err.message || 'Connection lost. Please try again.'}`,
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsGenerating(false);
      setThinkingStatus(null);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      voiceEngine.stop();
      setIsListening(false);
      return;
    }
    voiceEngine.stop();
    setIsListening(true);
    voiceEngine.listen(
      user?.preferences?.language || 'ne',
      (preview) => setInterimText(preview),
      (finalText) => {
        setIsListening(false);
        setInterimText('');
        handleSendMessage(finalText);
      },
      () => {
        setIsListening(false);
        setInterimText('');
      },
      () => setIsListening(false)
    );
  };

  return (
    <div className="h-full w-full flex flex-col bg-[#070b16] text-slate-100 relative font-['Plus_Jakarta_Sans',sans-serif]">
      {/* ── Top Floating Header Bar ───────────────────────────────────────── */}
      <div className="px-6 py-3 border-b border-[#141d33] bg-[#050812]/90 backdrop-blur-md flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-black text-sm text-cyan-300 font-mono tracking-tight">SHACHINA</span>
            <span className="text-[10px] bg-cyan-950 text-cyan-400 border border-cyan-800/80 px-2 py-0.5 rounded-full font-bold font-mono">
              AI ASSISTANT
            </span>
          </div>
          {/* Shared Context Badge */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 bg-[#0d1424] px-2.5 py-1 rounded-lg border border-[#1e2a44]">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>Active Market:</span>
            <strong className="text-white font-mono">{selectedSymbol}</strong>
            <span className="text-[10px] text-slate-500 font-mono">({timeframe})</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Voice Toggle */}
          <button
            onClick={() => setVoiceEnabled((v) => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border font-mono font-bold text-xs transition-all ${
              voiceEnabled
                ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.25)]'
                : 'bg-[#0d1424] border-slate-700/50 text-slate-500'
            }`}
          >
            {voiceEnabled ? (
              <>
                <span className="flex items-end gap-[2px] h-3.5">
                  {[5, 9, 6, 4].map((h, i) => (
                    <span
                      key={i}
                      className={`w-[2.5px] rounded-full transition-all ${voiceWave ? 'bg-purple-400 animate-bounce' : 'bg-cyan-400'}`}
                      style={{ height: `${voiceWave ? [4, 10, 6, 3][i] : h}px`, animationDelay: `${i * 80}ms` }}
                    />
                  ))}
                </span>
                <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>VOICE ON</span>
              </>
            ) : (
              <>
                <VolumeX className="w-3.5 h-3.5" />
                <span>VOICE OFF</span>
              </>
            )}
          </button>

          {/* Quick Switch to Trading Terminal */}
          {onOpenTradingAI && (
            <button
              onClick={onOpenTradingAI}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-500 hover:from-cyan-300 hover:to-emerald-400 text-black font-extrabold text-xs tracking-wide shadow-lg transition-all"
            >
              <span>🧠</span>
              <span>Open Trading AI</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Messages Scroll Container ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 md:px-12 lg:px-24 py-6 space-y-6">
        {/* Empty State / Welcome Hero */}
        {messages.length === 0 && (
          <div className="h-full min-h-[60vh] flex flex-col items-center justify-center text-center gap-6 max-w-2xl mx-auto select-none">
            <div className="relative">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-cyan-500/20 via-blue-500/20 to-purple-500/20 border border-cyan-400/30 flex items-center justify-center shadow-[0_0_30px_rgba(34,211,238,0.2)] animate-pulse">
                <Sparkles className="w-8 h-8 text-cyan-300" />
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                How can I help you today?
              </h2>
              <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
                I can help with coding, mathematics, science, writing, translation, research, or institutional market analysis.
              </p>
            </div>

            {/* Quick Prompt Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl text-left">
              {[
                { title: '📊 Market Analysis', desc: `Evaluate ${selectedSymbol} structure & setup`, query: `Evaluate ${selectedSymbol} trade setup on ${timeframe}` },
                { title: '💻 Write Code', desc: 'Create a Python async client script', query: 'Write a clean Python async HTTP scraper with error handling' },
                { title: '🔬 Explain Concepts', desc: 'Quantum superposition in simple terms', query: 'Explain quantum superposition and entanglement in simple language' },
                { title: '🌐 Live Web Search', desc: 'Latest NEPSE & financial news', query: 'What are the latest NEPSE market and global macro news today?' },
              ].map((card, i) => (
                <button
                  key={i}
                  onClick={() => handleSendMessage(card.query)}
                  className="p-3.5 rounded-2xl bg-[#0d1424]/80 hover:bg-[#121c33] border border-[#1e2a44] hover:border-cyan-500/40 transition-all text-left group shadow-lg"
                >
                  <div className="font-bold text-xs text-white group-hover:text-cyan-300 transition-colors">
                    {card.title}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                    {card.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message Stream */}
        {messages.map((m, idx) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} max-w-3xl mx-auto`}
          >
            <div
              className={`rounded-3xl p-4 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'max-w-[85%] bg-cyan-500/15 border border-cyan-500/30 text-cyan-50 rounded-br-md shadow-md'
                  : 'w-full bg-[#0d1424]/90 border border-[#1e2a44] text-slate-200 rounded-bl-md shadow-xl'
              }`}
            >
              {m.role === 'shachina' && (
                <div className="flex items-center justify-between mb-3 border-b border-[#1c2842] pb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-cyan-950 border border-cyan-400/60 flex items-center justify-center">
                      <Sparkles className="w-3 h-3 text-cyan-300" />
                    </div>
                    <span className="text-xs font-black text-cyan-400 font-mono tracking-wider">
                      SHACHINA
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(m.content);
                      setCopiedMsgId(m.id);
                      setTimeout(() => setCopiedMsgId(null), 2000);
                    }}
                    className="p-1 rounded hover:bg-[#16233b] text-slate-400 hover:text-cyan-300 transition-colors"
                    title="Copy message"
                  >
                    {copiedMsgId === m.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}

              <FormattedContent content={m.content} />

              {/* Trade Proposal Card */}
              {m.role === 'shachina' && m.trade_proposal && m.trade_proposal.entry_price && (
                <div className="mt-3.5 p-3.5 rounded-2xl bg-[#080f1f] border border-[#1e2a44] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-300 font-mono">
                      📋 {m.trade_proposal.symbol} TRADE SETUP
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full font-black text-xs font-mono ${
                        m.trade_proposal.direction === 'BUY'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-700'
                          : 'bg-rose-950 text-rose-400 border border-rose-700'
                      }`}
                    >
                      {m.trade_proposal.direction === 'BUY' ? 'LONG 🟢' : 'SHORT 🔴'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs text-slate-300 font-mono pt-1">
                    <div>
                      <span className="text-slate-500 text-[10px] block">ENTRY:</span>
                      <strong className="text-white">NPR {m.trade_proposal.entry_zone || m.trade_proposal.entry_price.toFixed(2)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">STOP LOSS:</span>
                      <strong className="text-rose-400">NPR {m.trade_proposal.stop_loss.toFixed(2)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">TARGET 1:</span>
                      <strong className="text-emerald-400">NPR {m.trade_proposal.target_1.toFixed(2)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">TARGET 2:</span>
                      <strong className="text-teal-300">NPR {(m.trade_proposal.target_2 || m.trade_proposal.target_1 * 1.05).toFixed(2)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">R/R RATIO:</span>
                      <strong className="text-cyan-300">{m.trade_proposal.risk_reward || '1:2.0'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">QUALITY:</span>
                      <strong className="text-amber-400">{m.trade_proposal.setup_quality || '7.5 / 10'}</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Message Footer / TTS Button */}
              {m.role === 'shachina' && (
                <div className="mt-3 pt-2 border-t border-[#18233a] flex items-center justify-between">
                  <button
                    onClick={() => speakMessage(m)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold font-mono transition-all ${
                      speakingMsgId === m.id
                        ? 'bg-purple-500/20 border border-purple-400/50 text-purple-300 animate-pulse'
                        : voiceEnabled
                        ? 'bg-cyan-950/40 border border-cyan-800/30 text-cyan-500 hover:text-cyan-300 hover:border-cyan-500/50'
                        : 'bg-slate-900/40 border border-slate-700/20 text-slate-600 opacity-40 cursor-not-allowed'
                    }`}
                  >
                    {speakingMsgId === m.id ? (
                      <>
                        <span className="flex items-end gap-[2px] h-3">
                          {[6, 10, 7].map((h, i) => (
                            <span
                              key={i}
                              className="w-[2px] bg-purple-400 rounded-full animate-bounce"
                              style={{ height: `${h}px`, animationDelay: `${i * 80}ms` }}
                            />
                          ))}
                        </span>
                        <span>Speaking... (Click to stop)</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>🔊 सुन्नुहोस्</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
            <span className="text-[10px] text-slate-500 font-mono mt-1 px-2">
              {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}

        {/* Interim Speech Preview */}
        {interimText && (
          <div className="flex flex-col items-end max-w-3xl mx-auto">
            <div className="rounded-3xl p-3.5 bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-sm font-mono animate-pulse">
              🎙️ "{interimText}"
            </div>
          </div>
        )}

        {/* Thinking Status Banner */}
        {thinkingStatus && isGenerating && (
          <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-[#0b1222] border border-cyan-500/30 text-cyan-300 text-xs font-mono max-w-3xl mx-auto animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
            <span>{thinkingStatus}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Bottom Input Section ──────────────────────────────────────────── */}
      <div className="p-4 md:px-12 lg:px-24 bg-[#050810]/95 border-t border-[#141d33] shrink-0">
        <div className="max-w-3xl mx-auto space-y-2">
          {/* Active Attachments / Search Indicators */}
          <div className="flex items-center gap-2 flex-wrap">
            {imageData && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 text-xs font-mono">
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Image attached</span>
                <button onClick={() => setImageData(null)} className="hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            {attachedFile && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 text-xs font-mono">
                <FileText className="w-3.5 h-3.5" />
                <span className="truncate max-w-[150px]">{attachedFile.name}</span>
                <button onClick={() => setAttachedFile(null)} className="hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            {webSearchEnabled && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-950 text-blue-400 border border-blue-700 text-[10px] font-mono">
                <Globe className="w-3 h-3" />
                <span>Web Search ON</span>
                <button onClick={() => setWebSearchEnabled(false)} className="hover:text-white ml-0.5">
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            )}
            {deepResearchEnabled && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-700 text-[10px] font-mono">
                <Sparkles className="w-3 h-3" />
                <span>Deep Research ON</span>
                <button onClick={() => setDeepResearchEnabled(false)} className="hover:text-white ml-0.5">
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            )}
          </div>

          {/* Input Box */}
          <div className="flex items-end gap-2 bg-[#0d1424] border border-[#1e2a44] focus-within:border-cyan-400 rounded-2xl p-2 transition-all shadow-xl">
            {/* Hidden File / Image Inputs */}
            <input
              type="file"
              ref={imageInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <input
              type="file"
              ref={fileInputRef}
              accept=".pdf,.docx,.txt,.csv,.xlsx,.json"
              className="hidden"
              onChange={handleFileUpload}
            />

            {/* Plus (+) Button for Tools */}
            <div className="relative">
              <button
                onClick={() => setIsPlusMenuOpen(!isPlusMenuOpen)}
                className="p-2 rounded-xl text-slate-400 hover:text-cyan-300 hover:bg-[#16233b] transition-colors"
                title="Add tools / files / search"
              >
                <Plus className="w-5 h-5" />
              </button>

              {/* Plus Popover Menu */}
              {isPlusMenuOpen && (
                <div className="absolute bottom-12 left-0 w-56 rounded-2xl bg-[#080d1a] border border-[#202f4e] p-2 shadow-2xl z-50 font-mono text-xs space-y-1">
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-300 hover:text-cyan-300 hover:bg-[#121c33] transition-colors text-left"
                  >
                    <ImageIcon className="w-4 h-4 text-cyan-400" />
                    <span>Upload Image / Chart</span>
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-300 hover:text-cyan-300 hover:bg-[#121c33] transition-colors text-left"
                  >
                    <FileText className="w-4 h-4 text-cyan-400" />
                    <span>Upload File (PDF/CSV/TXT)</span>
                  </button>
                  <button
                    onClick={() => {
                      setWebSearchEnabled(!webSearchEnabled);
                      setIsPlusMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-300 hover:text-cyan-300 hover:bg-[#121c33] transition-colors text-left"
                  >
                    <Globe className="w-4 h-4 text-blue-400" />
                    <span>{webSearchEnabled ? 'Disable Web Search' : 'Enable Web Search'}</span>
                  </button>
                  <button
                    onClick={() => {
                      setDeepResearchEnabled(!deepResearchEnabled);
                      setIsPlusMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-300 hover:text-purple-300 hover:bg-[#121c33] transition-colors text-left"
                  >
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span>{deepResearchEnabled ? 'Disable Deep Research' : 'Enable Deep Research'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Message Textarea */}
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder={isListening ? '🎙️ Listening in Nepali/Hindi/English...' : 'Message SHACHINA... (Ask anything or type trade question)'}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none resize-none max-h-32 py-2 px-1 font-sans"
            />

            {/* Microphone Button */}
            <button
              onClick={toggleListening}
              className={`p-2 rounded-xl transition-all ${
                isListening
                  ? 'bg-rose-600 text-white animate-pulse'
                  : 'text-slate-400 hover:text-cyan-300 hover:bg-[#16233b]'
              }`}
              title="Voice input"
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {/* Send Button */}
            <button
              onClick={() => handleSendMessage()}
              disabled={(!inputText.trim() && !imageData && !attachedFile) || isGenerating}
              className="p-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:opacity-30 text-black transition-all"
              title="Send message"
            >
              <ArrowUp className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 px-2 font-mono">
            <span>SHACHINA can make mistakes. Verify critical trade parameters.</span>
            <span>Zero-Fabrication Policy</span>
          </div>
        </div>
      </div>
    </div>
  );
};
