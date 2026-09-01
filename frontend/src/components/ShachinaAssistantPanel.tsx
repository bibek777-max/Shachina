import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Send,
  Loader2,
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  Plus,
  MessageSquare,
  Search,
  Trash2,
  Edit2,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Shield,
  CheckCircle,
} from 'lucide-react';
import { voiceEngine } from '../services/voiceEngine';
import { api } from '../services/api';
import {
  User,
  Conversation,
  ConversationMessage,
  ChartAnnotations,
  TradeProposal,
} from '../types';

interface ShachinaAssistantPanelProps {
  selectedSymbol: string;
  selectedMarket?: string;
  user?: User | null;
  onClose?: () => void;
  onAnnotationsReceived?: (annotations: ChartAnnotations) => void;
  onOrderPlaced?: () => void;
  isEmbedded?: boolean;
}

export const ShachinaAssistantPanel: React.FC<ShachinaAssistantPanelProps> = ({
  selectedSymbol,
  selectedMarket = 'NEPSE',
  user,
  onClose,
  onAnnotationsReceived,
  onOrderPlaced,
  isEmbedded = false,
}) => {
  // Conversation List & Active State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Mode & Language
  const [lang, setLang] = useState<'en' | 'ne' | 'hi'>('en');
  const [analysisMode, setAnalysisMode] = useState<'beginner' | 'pro'>('pro');
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Input & Generation State
  const [inputText, setInputText] = useState<string>('');
  const [interimText, setInterimText] = useState<string>('');
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [executingOrder, setExecutingOrder] = useState<boolean>(false);
  const [executionNotice, setExecutionNotice] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Load conversations on mount
  const loadConversations = useCallback(async () => {
    try {
      const convs = await api.getConversations();
      setConversations(convs);
      if (convs.length > 0 && !activeConvId) {
        setActiveConvId(convs[0].id);
        const full = await api.getConversation(convs[0].id);
        setMessages(full.messages || []);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  }, [activeConvId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Load active conversation messages when activeConvId changes
  useEffect(() => {
    if (!activeConvId) return;
    const fetchActive = async () => {
      try {
        const full = await api.getConversation(activeConvId);
        setMessages(full.messages || []);
      } catch (err) {
        console.error('Failed to fetch conversation messages:', err);
      }
    };
    fetchActive();
  }, [activeConvId]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, interimText, isGenerating]);

  // New Chat
  const handleNewChat = async () => {
    try {
      const newConv = await api.createConversation('New Conversation');
      setConversations((prev) => [newConv, ...prev]);
      setActiveConvId(newConv.id);
      setMessages([]);
      setIsDrawerOpen(false);
    } catch (err) {
      console.error('Failed to create new conversation:', err);
    }
  };

  // Delete Conversation
  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConvId === id) {
        setActiveConvId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  // Submit Message
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isGenerating) return;

    setInputText('');
    setInterimText('');
    setIsGenerating(true);

    let convId = activeConvId;
    if (!convId) {
      try {
        const newConv = await api.createConversation(text.slice(0, 30));
        setConversations((prev) => [newConv, ...prev]);
        setActiveConvId(newConv.id);
        convId = newConv.id;
      } catch (err) {
        console.error('Failed to create conv:', err);
      }
    }

    const tempUserMsg: ConversationMessage = {
      id: `tmp_${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const historyPayload = messages.slice(-8).map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      }));

      const res = await api.askAssistant({
        message: text,
        symbol: selectedSymbol,
        market: selectedMarket,
        language: lang,
        analysis_mode: analysisMode,
        conversation_id: convId || undefined,
        history: historyPayload,
      });

      const asstMsg: ConversationMessage = {
        id: `asst_${Date.now()}`,
        role: 'shachina',
        content: res.response,
        speech_text: res.speech_text,
        annotations: res.chart_annotations,
        trade_proposal: res.trade_proposal,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, asstMsg]);

      // If Shachina generated chart annotations, trigger chart update
      if (res.chart_annotations && onAnnotationsReceived) {
        onAnnotationsReceived(res.chart_annotations);
      }

      // Voice response
      if (!isMuted && res.speech_text) {
        voiceEngine.speak(res.speech_text, lang);
      }
    } catch (err: any) {
      const errMsg: ConversationMessage = {
        id: `err_${Date.now()}`,
        role: 'shachina',
        content: `⚠️ Error: ${err.message || 'Connection lost. Please try again.'}`,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsGenerating(false);
    }
  };

  // Voice Recognition Trigger
  const toggleListening = () => {
    if (isListening) {
      voiceEngine.stop();
      setIsListening(false);
    } else {
      voiceEngine.stop(); // stop any audio speaking
      setIsListening(true);
      voiceEngine.listen(
        lang,
        (preview) => setInterimText(preview),
        (finalText) => {
          setIsListening(false);
          setInterimText('');
          handleSendMessage(finalText);
        },
        (error) => {
          setIsListening(false);
          setInterimText('');
        },
        () => setIsListening(false)
      );
    }
  };

  // Execute Trade from Proposal Card
  const handleExecuteTradeProposal = async (proposal: TradeProposal) => {
    setExecutingOrder(true);
    setExecutionNotice(null);
    try {
      const res = await api.placeOrder({
        symbol: proposal.symbol,
        market: proposal.market,
        order_type: proposal.direction,
        quantity: proposal.quantity || proposal.suggested_shares || 10,
        price: proposal.entry_price,
        stop_loss: proposal.stop_loss,
        target: proposal.target_1,
        confirmed: true,
      });

      setExecutionNotice(`✓ ${res.message}`);
      if (onOrderPlaced) onOrderPlaced();

      if (!isMuted) {
        voiceEngine.speak(
          `Order confirmed. ${proposal.direction} ${proposal.quantity || 10} shares of ${proposal.symbol} executed.`,
          lang
        );
      }
      setTimeout(() => setExecutionNotice(null), 5000);
    } catch (err: any) {
      setExecutionNotice(`⚠️ Rejection: ${err.message}`);
      setTimeout(() => setExecutionNotice(null), 5000);
    } finally {
      setExecutingOrder(false);
    }
  };

  // Filter conversations
  const filteredConvs = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-full w-full flex flex-col bg-[#0b101e] border-l border-[#1c2438] text-slate-100 relative overflow-hidden font-['Plus_Jakarta_Sans',sans-serif]">
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <div className="p-2.5 bg-[#070b16] border-b border-[#1c2438] flex items-center justify-between gap-2 text-xs font-mono">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-300 transition-colors"
            title="Conversation History"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1">
            <span className="font-extrabold text-cyan-300">SHACHINA AI</span>
            <span className="text-[10px] bg-cyan-950 text-cyan-400 border border-cyan-800 px-1 py-0.2 rounded font-bold">
              v3.0
            </span>
          </div>
        </div>

        {/* Mode & Audio Controls */}
        <div className="flex items-center gap-1.5">
          {/* Beginner vs Pro Switch */}
          <div className="flex bg-[#050811] rounded-lg p-0.5 border border-[#1e293b] text-[10px] font-bold">
            <button
              onClick={() => setAnalysisMode('beginner')}
              className={`px-1.5 py-0.5 rounded transition-all ${
                analysisMode === 'beginner'
                  ? 'bg-amber-500 text-black font-extrabold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Beginner
            </button>
            <button
              onClick={() => setAnalysisMode('pro')}
              className={`px-1.5 py-0.5 rounded transition-all ${
                analysisMode === 'pro'
                  ? 'bg-cyan-400 text-black font-extrabold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Pro
            </button>
          </div>

          {/* Lang */}
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as any)}
            className="bg-[#141b2e] border border-[#202b46] rounded text-[10px] px-1 py-0.5 text-slate-300 focus:outline-none"
          >
            <option value="en">EN</option>
            <option value="ne">नेपा</option>
            <option value="hi">हिंदी</option>
          </select>

          {/* Mute */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          {onClose && (
            <button onClick={onClose} className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Conversation History Drawer ────────────────────────────────────── */}
      {isDrawerOpen && (
        <div className="absolute inset-y-0 left-0 w-64 bg-[#080d1a] border-r border-[#1c2438] z-30 flex flex-col p-3 shadow-2xl space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between border-b border-[#1c2438] pb-2">
            <span className="font-extrabold text-cyan-300">Chats</span>
            <button
              onClick={handleNewChat}
              className="flex items-center gap-1 px-2 py-1 rounded bg-cyan-400 hover:bg-cyan-300 text-black font-extrabold text-[10px]"
            >
              <Plus className="w-3 h-3" /> New
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#111728] border border-[#1e293b] rounded-lg pl-7 pr-2 py-1 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto space-y-1">
            {filteredConvs.map((c) => (
              <div
                key={c.id}
                onClick={() => {
                  setActiveConvId(c.id);
                  setIsDrawerOpen(false);
                }}
                className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                  activeConvId === c.id
                    ? 'bg-[#141d33] border border-cyan-500/40 text-cyan-300'
                    : 'hover:bg-[#10172a] text-slate-300'
                }`}
              >
                <div className="truncate pr-2">
                  <p className="font-semibold truncate text-[11px]">{c.title}</p>
                  <p className="text-[9px] text-slate-500 truncate">{c.last_preview}</p>
                </div>
                <button
                  onClick={(e) => handleDeleteConversation(c.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 transition-opacity"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={() => setIsDrawerOpen(false)}
            className="w-full py-1.5 rounded bg-slate-800 text-slate-400 hover:text-white text-[10px]"
          >
            Close History
          </button>
        </div>
      )}

      {/* ── Messages Stream ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 space-y-3 text-slate-400">
            <div className="w-12 h-12 rounded-full bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-2xl">
              ✨
            </div>
            <div>
              <h4 className="font-extrabold text-white text-sm">Shachina Assistant</h4>
              <p className="text-xs text-slate-400 max-w-xs mt-1">
                Ask about science, coding, math, general questions, or say{' '}
                <strong className="text-cyan-300">"Market herna"</strong> for real-time NEPSE setup analysis.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-1.5 w-full max-w-xs text-left text-[11px] font-mono">
              <button
                onClick={() => handleSendMessage('Market kasto cha?')}
                className="p-2 rounded-lg bg-[#10172a] hover:bg-[#141d33] border border-[#1e293b] text-slate-300 text-left transition-colors"
              >
                📊 "Market kasto cha?"
              </button>
              <button
                onClick={() => handleSendMessage(`Analyze ${selectedSymbol} setup.`)}
                className="p-2 rounded-lg bg-[#10172a] hover:bg-[#141d33] border border-[#1e293b] text-slate-300 text-left transition-colors"
              >
                📈 "Analyze {selectedSymbol} chart setup."
              </button>
              <button
                onClick={() => handleSendMessage('What is data analysis?')}
                className="p-2 rounded-lg bg-[#10172a] hover:bg-[#141d33] border border-[#1e293b] text-slate-300 text-left transition-colors"
              >
                🧠 "What is data analysis?"
              </button>
            </div>
          </div>
        )}

        {messages.map((m) => {
          const isUser = m.role === 'user';
          return (
            <div key={m.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
              <div
                className={`max-w-[90%] rounded-2xl p-3 text-xs leading-relaxed ${
                  isUser
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-black font-semibold rounded-br-none shadow-md'
                    : 'bg-[#10172a] border border-[#1c2438] text-slate-200 rounded-bl-none shadow-xl'
                }`}
              >
                <div className="whitespace-pre-wrap">{m.content}</div>

                {/* ── Trade Proposal Card ────────────────────────────────────── */}
                {m.trade_proposal && (
                  <div className="mt-3 p-3 rounded-xl bg-[#090d18] border border-cyan-500/40 space-y-2 font-mono text-[11px]">
                    <div className="flex items-center justify-between border-b border-[#1c2438] pb-1.5">
                      <span className="font-extrabold text-cyan-300 flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5" />
                        TRADE PROPOSAL: {m.trade_proposal.symbol}
                      </span>
                      <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 px-1.5 py-0.2 rounded font-bold text-[9px]">
                        {m.trade_proposal.direction}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 text-[10px] text-slate-300">
                      <div>Entry: <strong className="text-white">NPR {m.trade_proposal.entry_price.toFixed(2)}</strong></div>
                      <div>Stop Loss: <strong className="text-rose-400">NPR {m.trade_proposal.stop_loss.toFixed(2)}</strong></div>
                      <div>Target 1: <strong className="text-emerald-400">NPR {m.trade_proposal.target_1.toFixed(2)}</strong></div>
                      <div>R:R Ratio: <strong className="text-cyan-300">{m.trade_proposal.risk_reward || '1:2.0'}</strong></div>
                    </div>

                    {/* Order Action Button */}
                    <button
                      onClick={() => handleExecuteTradeProposal(m.trade_proposal!)}
                      disabled={executingOrder}
                      className="w-full mt-2 py-2 rounded-lg bg-gradient-to-r from-cyan-400 to-emerald-500 hover:from-cyan-300 hover:to-emerald-400 disabled:opacity-50 text-black font-extrabold text-[11px] tracking-wider shadow-lg flex items-center justify-center gap-1.5 transition-all"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      {executingOrder ? 'EXECUTING ORDER...' : 'CONFIRM & EXECUTE TRADE'}
                    </button>
                  </div>
                )}
              </div>

              <span className="text-[9px] text-slate-500 font-mono mt-0.5 px-1">
                {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          );
        })}

        {/* Interim Speech Preview */}
        {interimText && (
          <div className="flex flex-col items-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-none p-2.5 bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs font-mono animate-pulse">
              🎙️ "{interimText}"
            </div>
          </div>
        )}

        {/* Generation Loader */}
        {isGenerating && (
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 p-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Shachina is analyzing...</span>
          </div>
        )}

        {/* Execution Notice */}
        {executionNotice && (
          <div className="p-2.5 rounded-xl bg-cyan-950/90 border border-cyan-400 text-cyan-300 text-xs font-mono font-bold animate-bounce">
            {executionNotice}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input Bar ──────────────────────────────────────────────────────── */}
      <div className="p-2.5 bg-[#070b16] border-t border-[#1c2438]">
        <div className="flex items-center gap-2 bg-[#10172a] border border-[#1e293b] rounded-xl px-3 py-1.5 focus-within:border-cyan-400 transition-colors">
          <input
            type="text"
            placeholder={isListening ? 'Listening to your voice...' : 'Ask Shachina anything...'}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
          />

          {/* Mic Button */}
          <button
            onClick={toggleListening}
            className={`p-1.5 rounded-lg transition-all ${
              isListening
                ? 'bg-rose-600 text-white animate-pulse'
                : 'hover:bg-slate-800 text-slate-400 hover:text-cyan-300'
            }`}
            title="Voice input"
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Send Button */}
          <button
            onClick={() => handleSendMessage()}
            disabled={!inputText.trim() || isGenerating}
            className="p-1.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 disabled:opacity-30 text-black transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
