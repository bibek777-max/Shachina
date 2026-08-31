/**
 * SHACHINA — Complete AI Personal Assistant Chat Modal
 *
 * Features:
 * - ChatGPT-style markdown rendering (bold, lists, code blocks, tables)
 * - Copy response button on every Shachina message
 * - Regenerate last response
 * - Stop generation button
 * - Voice: speak → interim preview → auto-submit after silence → TTS reply
 * - Text: type + Enter / Send button
 * - Continuous multi-turn conversation context
 * - Language switching (EN / NE / HI)
 * - Mute toggle, clear chat
 * - Mobile-first safe areas
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Mic, MicOff, Volume2, VolumeX,
  Play, Pause, Square, Send, Loader2,
  Trash2, Sparkles, Copy, Check, RefreshCw,
} from 'lucide-react';
import { voiceEngine, ShachinaVoiceEngine } from '../services/voiceEngine';
import { api } from '../services/api';
import { User } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedSymbol: string;
  selectedMarket?: string;
  user?: User | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'shachina';
  text: string;
  speechText?: string;
  lang?: string;
  isVoice?: boolean;
  time: string;
}

type State = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';
type Lang  = 'en' | 'ne' | 'hi';

// ─── Markdown renderer ────────────────────────────────────────────────────────
// Simple, dependency-free markdown rendering without external libraries.

function renderMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const lines = text.split('\n');
  let i = 0;
  let keyCounter = 0;
  const k = () => `md-${keyCounter++}`;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block ```
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push(
        <div key={k()} className="relative my-2 rounded-xl overflow-hidden border border-[#1e3050] bg-[#050e1a]">
          {lang && (
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#0a1728] border-b border-[#1e3050]">
              <span className="text-[10px] font-mono text-cyan-400">{lang}</span>
              <CopyButton text={codeLines.join('\n')} mini />
            </div>
          )}
          <pre className="text-[11px] text-slate-200 font-mono p-3 overflow-x-auto leading-relaxed whitespace-pre">
            <code>{codeLines.join('\n')}</code>
          </pre>
        </div>
      );
      i++;
      continue;
    }

    // Table |...|
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const tableRows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().slice(1, -1).split('|').map(c => c.trim());
        if (!cells.every(c => /^[-:]+$/.test(c))) {
          tableRows.push(cells);
        }
        i++;
      }
      if (tableRows.length > 0) {
        nodes.push(
          <div key={k()} className="my-2 overflow-x-auto rounded-lg border border-[#1e3050]">
            <table className="w-full text-[11px] font-mono">
              {tableRows.map((row, ri) => (
                <tr key={ri} className={ri === 0 ? 'bg-[#0a1728] text-cyan-300' : ri % 2 === 0 ? 'bg-[#080f1c]' : 'bg-[#060b16]'}>
                  {row.map((cell, ci) => (
                    ri === 0
                      ? <th key={ci} className="px-3 py-1.5 text-left font-bold border-b border-[#1e3050]">{cell}</th>
                      : <td key={ci} className="px-3 py-1.5 text-slate-300">{inlineMarkdown(cell)}</td>
                  ))}
                </tr>
              ))}
            </table>
          </div>
        );
      }
      continue;
    }

    // Heading #
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      const cls = level === 1 ? 'text-sm font-extrabold text-cyan-300 mb-1' :
                  level === 2 ? 'text-xs font-bold text-cyan-400 mb-1' :
                                'text-xs font-semibold text-slate-200 mb-0.5';
      nodes.push(<p key={k()} className={cls}>{inlineMarkdown(headingText)}</p>);
      i++;
      continue;
    }

    // Bullet list - / * / •
    if (/^\s*[-*•]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*•]\s/, '').trim());
        i++;
      }
      nodes.push(
        <ul key={k()} className="my-1.5 space-y-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2 text-xs">
              <span className="text-cyan-400 mt-0.5 shrink-0">•</span>
              <span className="text-slate-200 leading-relaxed">{inlineMarkdown(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (/^\s*\d+\.\s/.test(line)) {
      const items: string[] = [];
      let num = 1;
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s/, '').trim());
        i++;
        num++;
      }
      nodes.push(
        <ol key={k()} className="my-1.5 space-y-1 list-none">
          {items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2 text-xs">
              <span className="text-cyan-400 font-mono shrink-0 mt-0.5">{idx + 1}.</span>
              <span className="text-slate-200 leading-relaxed">{inlineMarkdown(item)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      nodes.push(<div key={k()} className="h-1.5" />);
      i++;
      continue;
    }

    // Normal paragraph
    nodes.push(
      <p key={k()} className="text-xs text-slate-200 leading-relaxed">
        {inlineMarkdown(line)}
      </p>
    );
    i++;
  }

  return nodes;
}

/** Inline markdown: **bold**, *italic*, `code`, links */
function inlineMarkdown(text: string): React.ReactNode {
  // Split on inline code, bold, italic patterns
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="text-slate-100 font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-[#0a1a2e] border border-[#1e3050] text-cyan-300 px-1 py-0.5 rounded text-[10px] font-mono">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={i} className="text-slate-300 italic">{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text, mini = false }: { text: string; mini?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <button
      onClick={copy}
      title="Copy"
      className={`flex items-center gap-1 font-mono transition-colors ${
        mini
          ? 'text-[9px] text-slate-400 hover:text-cyan-300 px-1 py-0.5'
          : 'text-[10px] text-slate-500 hover:text-cyan-300 bg-[#0a1422] border border-[#1e3050] hover:border-cyan-600/40 px-2 py-1 rounded-md'
      }`}
    >
      {copied
        ? <><Check className="w-2.5 h-2.5 text-emerald-400" />{!mini && 'Copied'}</>
        : <><Copy className="w-2.5 h-2.5" />{!mini && 'Copy'}</>
      }
    </button>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid()    { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function nowTime(){ return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }

function getGreeting(name: string, lang: Lang): { text: string; speech: string } {
  const h = new Date().getHours();
  const period =
    h >= 5  && h < 12 ? 'morning'   :
    h >= 12 && h < 17 ? 'afternoon' :
    h >= 17 && h < 22 ? 'evening'   : 'night';

  const salutations: Record<Lang, Record<string, string>> = {
    en: { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', night: 'Good evening' },
    ne: { morning: 'शुभ प्रभात', afternoon: 'शुभ दिन', evening: 'शुभ सन्ध्या', night: 'शुभ सन्ध्या' },
    hi: { morning: 'शुभ प्रभात', afternoon: 'नमस्ते', evening: 'शुभ संध्या', night: 'शुभ संध्या' },
  };
  const sal = salutations[lang][period];

  const texts: Record<Lang, string> = {
    en: `${sal}, ${name}. I'm Shachina — your complete AI assistant. I can help with markets, math, code, writing, or anything else. What would you like to know?`,
    ne: `${sal}, ${name}। म Shachina हुँ — तपाईंको complete AI assistant। बजार, code, writing, वा जे पनि सोध्नुहोस्।`,
    hi: `${sal}, ${name}। मैं Shachina हूँ — आपकी complete AI assistant। बाज़ार, code, writing, या कुछ भी पूछें।`,
  };

  return { text: texts[lang], speech: texts[lang] };
}

// ─── Component ────────────────────────────────────────────────────────────────

export const VoiceAssistantModal: React.FC<Props> = ({
  isOpen, onClose, selectedSymbol, selectedMarket = 'NEPSE', user,
}) => {
  const name = user?.full_name || 'Bibek';

  const [messages,   setMessages]  = useState<ChatMessage[]>([]);
  const [query,      setQuery]     = useState('');
  const [interim,    setInterim]   = useState('');
  const [state,      setState]     = useState<State>('idle');
  const [lang,       setLang]      = useState<Lang>('en');
  const [muted,      setMuted]     = useState(false);
  const [amplitude,  setAmplitude] = useState(0);
  const [errMsg,     setErrMsg]    = useState<string | null>(null);
  const [playingId,  setPlayingId] = useState<string | null>(null);
  const [pausedId,   setPausedId]  = useState<string | null>(null);
  const [bars,       setBars]      = useState([15,30,15,45,15,30,20,25]);

  const hasGreeted  = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const scrollRef   = useRef<HTMLDivElement>(null);
  const animRef     = useRef<number | null>(null);
  const inputRef    = useRef<HTMLInputElement>(null);
  const stateRef    = useRef<State>('idle');
  const abortRef    = useRef<boolean>(false);

  messagesRef.current = messages;
  stateRef.current    = state;

  const sttSupported = ShachinaVoiceEngine.isRecognitionSupported();

  // ── Append message ───────────────────────────────────────────────────────
  const append = useCallback((
    role: 'user' | 'shachina',
    text: string,
    speechText?: string,
    l?: string,
    isVoice = false,
  ): ChatMessage => {
    const msg: ChatMessage = { id: uid(), role, text, speechText, lang: l, isVoice, time: nowTime() };
    setMessages(prev => [...prev, msg]);
    return msg;
  }, []);

  // ── Scroll to bottom ─────────────────────────────────────────────────────
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, interim, state]);

  // ── Equalizer animation ──────────────────────────────────────────────────
  useEffect(() => {
    const animate = () => {
      if (stateRef.current === 'speaking') {
        setBars(Array.from({ length: 8 }, () => 10 + Math.random() * 85));
      } else if (stateRef.current === 'listening' && amplitude > 0) {
        setBars(Array.from({ length: 8 }, (_, i) =>
          Math.max(10, Math.min(100, amplitude + Math.sin(Date.now() / 140 + i) * 28))
        ));
      } else {
        setBars([15, 30, 15, 45, 15, 30, 20, 25]);
      }
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [amplitude]);

  // ── TTS helpers ───────────────────────────────────────────────────────────
  const stopSpeech = useCallback(() => {
    voiceEngine.stop();
    setPlayingId(null);
    setPausedId(null);
    setState('idle');
  }, []);

  const playMsg = useCallback((msg: ChatMessage) => {
    if (muted) return;
    if (playingId === msg.id && pausedId === msg.id) {
      voiceEngine.resume();
      setPausedId(null);
      setState('speaking');
      return;
    }
    voiceEngine.stop();
    setPlayingId(msg.id);
    setPausedId(null);
    setState('speaking');
    voiceEngine.speak(msg.speechText || msg.text, msg.lang || lang, msg.id,
      () => setState('speaking'),
      () => { setState('idle'); setPlayingId(null); setPausedId(null); }
    );
  }, [muted, playingId, pausedId, lang]);

  const pauseSpeech = () => {
    voiceEngine.pause();
    setPausedId(playingId);
    setState('idle');
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    voiceEngine.isMuted = next;
    if (next) stopSpeech();
  };

  // ── Open greeting ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      voiceEngine.stop();
      voiceEngine.stopListening();
      setState('idle');
      setPlayingId(null);
      setPausedId(null);
      return;
    }
    if (hasGreeted.current && messages.length > 0) return;
    hasGreeted.current = true;

    const g = getGreeting(name, lang);
    const msg = append('shachina', g.text, g.speech, lang);

    if (!muted) {
      setTimeout(() => {
        setPlayingId(msg.id);
        setState('speaking');
        voiceEngine.speak(g.speech, lang, msg.id,
          () => setState('speaking'),
          () => { setState('idle'); setPlayingId(null); }
        );
      }, 600);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const [isSlowNetwork, setIsSlowNetwork] = useState(false);
  const slowTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ── Core send ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string, isVoice = false) => {
    const t = text.trim();
    if (!t || stateRef.current === 'thinking') return;

    abortRef.current = false;
    stopSpeech();
    voiceEngine.stopListening();
    setQuery('');
    setInterim('');
    setErrMsg(null);
    setIsSlowNetwork(false);

    append('user', t, undefined, lang, isVoice);
    setState('thinking');

    // Start slow connection timer (triggers message if >3.5s on mobile networks)
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    slowTimerRef.current = setTimeout(() => {
      if (stateRef.current === 'thinking') {
        setIsSlowNetwork(true);
      }
    }, 3500);

    try {
      const history = messagesRef.current.slice(-12).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text,
      }));

      const res = await api.askAssistant(t, selectedSymbol, selectedMarket, lang, history);

      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      setIsSlowNetwork(false);

      if (abortRef.current) return;

      const msg = append('shachina', res.response, res.speech_text, res.language || lang);
      setState('idle');

      if (!muted && res.speech_text) {
        setPlayingId(msg.id);
        setState('speaking');
        voiceEngine.speak(
          res.speech_text, res.language || lang, msg.id,
          () => setState('speaking'),
          () => { setState('idle'); setPlayingId(null); setPausedId(null); }
        );
      }
    } catch (err: any) {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      setIsSlowNetwork(false);
      if (abortRef.current) return;

      setState('error');
      const isNetError = !navigator.onLine || err?.message?.toLowerCase().includes('connection') || err?.message?.toLowerCase().includes('network') || err?.message?.toLowerCase().includes('fetch');
      const errText = isNetError
        ? (lang === 'ne' ? 'इन्टरनेट कनेक्सन कमजोर भयो। कृपया पुनः प्रयास गर्नुहोस्।' : 'Connection lost. Please try again.')
        : (lang === 'ne' ? 'Shachina अहिले उपलब्ध भएन। कृपया पुनः प्रयास गर्नुहोस्।' :
           lang === 'hi' ? 'Shachina अभी उपलब्ध नहीं है। कृपया पुनः प्रयास करें।' :
           "Connection lost. Please try again.");

      append('shachina', errText, errText, lang);
      setErrMsg(errText);
      setTimeout(() => { setState('idle'); setErrMsg(null); }, 6000);
    }
  }, [lang, muted, selectedSymbol, selectedMarket, append, stopSpeech]);

  // ── Regenerate last response ──────────────────────────────────────────────
  const regenerate = () => {
    const msgs = messagesRef.current;
    // Find last user message
    const lastUser = [...msgs].reverse().find(m => m.role === 'user');
    if (!lastUser || stateRef.current === 'thinking') return;
    // Remove last Shachina response if any
    const lastShachina = [...msgs].reverse().find(m => m.role === 'shachina');
    if (lastShachina) {
      setMessages(prev => prev.filter(m => m.id !== lastShachina.id));
    }
    sendMessage(lastUser.text, lastUser.isVoice);
  };

  // ── Stop thinking / abort ─────────────────────────────────────────────────
  const stopThinking = () => {
    abortRef.current = true;
    setState('idle');
  };

  // ── Microphone ────────────────────────────────────────────────────────────
  const handleMic = async () => {
    if (state === 'speaking') stopSpeech();

    if (state === 'listening') {
      voiceEngine.stopListening();
      setAmplitude(0);
      setInterim('');
      setState('idle');
      return;
    }

    if (!sttSupported) {
      setErrMsg("Voice input isn't supported in this browser. Please type your message.");
      return;
    }

    stopSpeech();
    setErrMsg(null);
    setInterim('');

    const granted = await voiceEngine.startMicVisualiser(setAmplitude);
    if (!granted) {
      setErrMsg('Microphone access denied. Allow it in browser settings and try again.');
      return;
    }

    setState('listening');

    voiceEngine.listen(
      lang,
      (text) => setInterim(text),
      (finalText) => {
        setInterim('');
        setAmplitude(0);
        voiceEngine.stopMicVisualiser();
        setState('idle');
        if (finalText.trim()) sendMessage(finalText, true);
      },
      (msg) => {
        const friendlyMsg = "I couldn't understand your voice. Please try again or type your message.";
        setErrMsg(friendlyMsg);
        setInterim('');
        setAmplitude(0);
        voiceEngine.stopMicVisualiser();
        setState('error');
        setTimeout(() => { setState('idle'); setErrMsg(null); }, 6000);
      },
      () => {
        setInterim('');
        setAmplitude(0);
        voiceEngine.stopMicVisualiser();
        setState('idle');
      }
    );
  };

  // ── Clear chat ────────────────────────────────────────────────────────────
  const clearChat = () => {
    abortRef.current = true;
    stopSpeech();
    voiceEngine.stopListening();
    setMessages([]);
    setInterim('');
    setErrMsg(null);
    hasGreeted.current = false;
    const g = getGreeting(name, lang);
    const msg = append('shachina', g.text, g.speech, lang);
    if (!muted) {
      setTimeout(() => {
        setPlayingId(msg.id);
        setState('speaking');
        voiceEngine.speak(g.speech, lang, msg.id,
          () => setState('speaking'),
          () => { setState('idle'); setPlayingId(null); }
        );
      }, 300);
    }
  };

  if (!isOpen) return null;

  // Status label
  const statusLabel =
    state === 'listening' ? (interim ? `"${interim.slice(0, 60)}${interim.length > 60 ? '…' : ''}"` : 'Listening…') :
    state === 'thinking'  ? (isSlowNetwork ? 'Connection is slow. Please wait while Shachina responds...' : 'Shachina is thinking…') :
    state === 'speaking'  ? 'Shachina is speaking… (tap mic to interrupt)' :
    state === 'error'     ? (errMsg || 'Something went wrong.') :
    sttSupported          ? 'Tap 🎙️ to speak, or type below' :
                            'Type your message below';

  // Quick suggestion chips
  const chips: string[] =
    lang === 'ne'
      ? ["आजको NEPSE बजार", "Banking sector कस्तो छ?", `${selectedSymbol} analyze गर`, "1% risk नियम के हो?", "Python code लेख calculator को लागि"]
      : lang === 'hi'
      ? ["आज का NEPSE बाज़ार", "Banking sector?", `${selectedSymbol} analyze करो`, "Risk limit क्या है?", "Python calculator code लिखो"]
      : ["Today's NEPSE market", "What about banking stocks?", `Analyze ${selectedSymbol}`, "Explain quantum computing simply", "Write Python code for a calculator"];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-md p-0 sm:p-4">
      <div
        className="bg-[#090e1a] border-t sm:border border-[#1a2a40] sm:rounded-2xl w-full sm:max-w-2xl flex flex-col shadow-2xl overflow-hidden"
        style={{ height: '100dvh', maxHeight: '100dvh' }}
      >

        {/* ── HEADER ──────────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#162030] bg-[#060b14] sm:rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-indigo-600 flex items-center justify-center shadow-lg shrink-0">
              <span className="text-xl">🎙️</span>
              {state === 'speaking' && (
                <span className="absolute inset-0 rounded-xl bg-emerald-400/20 animate-ping border border-emerald-400/40" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-extrabold text-white text-sm tracking-widest">SHACHINA</span>
                <span className="text-[9px] bg-cyan-950 text-cyan-400 border border-cyan-800/60 px-1.5 py-0.5 rounded font-mono">AI ASSISTANT</span>
                <span className="text-[9px] bg-emerald-950 text-emerald-400 border border-emerald-800/60 px-1.5 py-0.5 rounded font-mono">
                  {settings.GEMINI_API_KEY ? 'Gemini' : settings.OPENAI_API_KEY ? 'GPT-4o' : 'Built-in'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                {name} &middot; {selectedSymbol} &middot; {selectedMarket}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Language switcher */}
            <div className="flex bg-[#0f1a27] border border-[#1a2a40] rounded-lg p-0.5 gap-0.5">
              {(['en','ne','hi'] as Lang[]).map(l => (
                <button key={l} onClick={() => { setLang(l); stopSpeech(); }}
                  className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${
                    lang === l ? 'bg-cyan-400 text-black' : 'text-slate-400 hover:text-white'
                  }`}
                >{l.toUpperCase()}</button>
              ))}
            </div>
            <button onClick={toggleMute}
              className={`p-2 rounded-lg border transition-all ${
                muted ? 'bg-rose-950/80 border-rose-700/60 text-rose-300'
                      : 'bg-[#0f1a27] border-[#1a2a40] text-cyan-400 hover:text-white'
              }`}
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button onClick={clearChat}
              className="p-2 rounded-lg bg-[#0f1a27] border border-[#1a2a40] text-slate-400 hover:text-white transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-800/80 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── STATUS BAR ──────────────────────────────────────────────────── */}
        <div className="shrink-0 mx-4 mt-3 bg-[#070c17] border border-[#162030] rounded-xl px-4 py-2 flex items-center justify-between gap-2">
          <span className={`text-[11px] font-mono truncate ${
            state === 'listening' ? 'text-rose-400 animate-pulse' :
            state === 'thinking'  ? 'text-amber-400' :
            state === 'speaking'  ? 'text-emerald-400' :
            state === 'error'     ? 'text-rose-400' :
            'text-slate-400'
          }`}>
            {state === 'thinking' && <Loader2 className="inline w-3 h-3 mr-1.5 animate-spin" />}
            {statusLabel}
          </span>
          <div className="flex items-end gap-[2px] h-5 shrink-0">
            {bars.map((h, i) => (
              <div key={i}
                className={`w-[3px] rounded-full transition-all duration-75 ${
                  state === 'speaking'  ? 'bg-gradient-to-t from-cyan-500 to-emerald-400' :
                  state === 'listening' ? 'bg-gradient-to-t from-rose-500 to-amber-300' :
                  'bg-slate-700'
                }`}
                style={{ height: `${Math.max(15, h)}%` }}
              />
            ))}
          </div>
        </div>

        {/* ── CHAT AREA ────────────────────────────────────────────────────── */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

          {messages.map((msg, idx) => {
            const isPlaying  = playingId === msg.id && state === 'speaking';
            const isMsgPaused = pausedId === msg.id;
            const isLastShachina = msg.role === 'shachina' &&
              messages.slice(idx + 1).every(m => m.role !== 'shachina');

            return (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>

                {msg.role === 'shachina' && (
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-indigo-600 flex items-center justify-center text-xs shrink-0 mr-2 mt-0.5 shadow">⚡</div>
                )}

                <div className={`max-w-[90%] rounded-2xl overflow-hidden shadow-lg ${
                  msg.role === 'user'
                    ? 'bg-cyan-500/12 border border-cyan-500/25 rounded-tr-sm'
                    : 'bg-[#0e1828] border border-[#1a2a3c] rounded-tl-sm'
                }`}>
                  {/* Shachina header */}
                  {msg.role === 'shachina' && (
                    <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-[#1a2a3c]/70">
                      <span className="text-[10px] text-cyan-400 font-mono font-bold flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3" />SHACHINA
                      </span>
                      <span className="text-[9px] text-slate-500 font-mono">{msg.time}</span>
                    </div>
                  )}

                  {/* Message content */}
                  <div className={`${msg.role === 'shachina' ? 'px-4 py-3' : 'px-4 py-3'}`}>
                    {msg.role === 'user' ? (
                      <div className="flex items-start gap-1.5">
                        {msg.isVoice && <span className="text-cyan-400 text-[10px] shrink-0 mt-0.5">🎤</span>}
                        <p className="text-xs text-slate-100 leading-relaxed">{msg.text}</p>
                      </div>
                    ) : (
                      <div className="space-y-1">{renderMarkdown(msg.text)}</div>
                    )}
                    {msg.role === 'user' && (
                      <p className="text-[10px] text-slate-500 text-right mt-1 font-mono">{msg.time}</p>
                    )}
                  </div>

                  {/* Shachina controls */}
                  {msg.role === 'shachina' && (
                    <div className="px-4 pb-3 pt-1 flex items-center gap-1.5 flex-wrap border-t border-[#1a2a3c]/50">
                      {/* TTS controls */}
                      {isPlaying ? (
                        <>
                          <button onClick={pauseSpeech}
                            className="flex items-center gap-1 text-[10px] text-amber-400 font-mono bg-amber-950/40 border border-amber-800/50 px-2 py-1 rounded-md hover:bg-amber-950/60 transition-colors">
                            <Pause className="w-2.5 h-2.5 fill-current" />Pause
                          </button>
                          <button onClick={stopSpeech}
                            className="flex items-center gap-1 text-[10px] text-rose-400 font-mono bg-rose-950/40 border border-rose-800/50 px-2 py-1 rounded-md hover:bg-rose-950/60 transition-colors">
                            <Square className="w-2.5 h-2.5 fill-current" />Stop
                          </button>
                          <span className="text-[9px] text-emerald-400 flex items-center gap-1 animate-pulse">
                            <Volume2 className="w-3 h-3" />Speaking…
                          </span>
                        </>
                      ) : isMsgPaused ? (
                        <>
                          <button onClick={() => playMsg(msg)}
                            className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono bg-emerald-950/40 border border-emerald-800/50 px-2 py-1 rounded-md hover:bg-emerald-950/60 transition-colors">
                            <Play className="w-2.5 h-2.5 fill-current" />Resume
                          </button>
                          <button onClick={stopSpeech}
                            className="flex items-center gap-1 text-[10px] text-rose-400 font-mono bg-rose-950/40 border border-rose-800/50 px-2 py-1 rounded-md hover:bg-rose-950/60 transition-colors">
                            <Square className="w-2.5 h-2.5 fill-current" />Stop
                          </button>
                        </>
                      ) : (
                        <button onClick={() => playMsg(msg)} disabled={muted}
                          className="flex items-center gap-1 text-[10px] text-cyan-400 font-mono bg-cyan-950/40 border border-cyan-800/50 px-2 py-1 rounded-md hover:bg-cyan-950/60 disabled:opacity-40 transition-colors">
                          <Volume2 className="w-3 h-3" />Listen
                        </button>
                      )}

                      {/* Copy */}
                      <CopyButton text={msg.text} />

                      {/* Regenerate — only on last Shachina message */}
                      {isLastShachina && (
                        <button onClick={regenerate} disabled={state === 'thinking'}
                          className="flex items-center gap-1 text-[10px] text-slate-400 font-mono bg-[#0a1422] border border-[#1e3050] hover:border-cyan-600/40 hover:text-cyan-300 px-2 py-1 rounded-md disabled:opacity-40 transition-colors">
                          <RefreshCw className="w-2.5 h-2.5" />Regenerate
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Live voice preview */}
          {interim && (
            <div className="flex justify-end">
              <div className="bg-rose-950/40 border border-rose-500/30 rounded-2xl rounded-tr-sm px-4 py-2.5 text-xs text-rose-200 italic max-w-[85%] flex items-center gap-1.5">
                <span className="text-rose-400 shrink-0">🎤</span>
                <span>{interim}</span>
              </div>
            </div>
          )}

          {/* Thinking indicator */}
          {state === 'thinking' && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-indigo-600 flex items-center justify-center text-xs shrink-0 mr-2 mt-0.5 shadow">⚡</div>
              <div className="bg-[#0e1828] border border-[#1a2a3c] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2.5 shadow-md">
                {[0,1,2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
                <span className="text-[11px] text-slate-400 font-mono">Thinking…</span>
                <button onClick={stopThinking}
                  className="ml-2 text-[10px] text-slate-500 hover:text-rose-400 font-mono border border-[#1a2a3c] hover:border-rose-600/40 px-1.5 py-0.5 rounded transition-colors">
                  Stop
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── QUICK CHIPS ──────────────────────────────────────────────────── */}
        <div className="shrink-0 px-4 pb-2">
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {chips.map(chip => (
              <button key={chip}
                onClick={() => sendMessage(chip)}
                disabled={state === 'thinking' || state === 'listening'}
                className="bg-[#0f1825] hover:bg-[#162438] border border-[#1a2a3c] hover:border-cyan-500/40 text-slate-300 hover:text-cyan-300 text-[11px] px-3 py-1.5 rounded-lg font-mono whitespace-nowrap shrink-0 disabled:opacity-40 transition-all active:scale-95"
              >"{chip}"</button>
            ))}
          </div>
        </div>

        {/* ── ERROR BANNER ─────────────────────────────────────────────────── */}
        {errMsg && state !== 'listening' && (
          <div className="shrink-0 mx-4 mb-2 bg-rose-950/70 border border-rose-700/50 rounded-xl px-3 py-2 text-[11px] text-rose-300 font-mono flex items-start justify-between gap-2 shadow">
            <span>⚠️ {errMsg}</span>
            <button onClick={() => setErrMsg(null)} className="text-rose-400 hover:text-white shrink-0 font-bold">✕</button>
          </div>
        )}

        {/* ── INPUT BAR ────────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center gap-2 px-4 pt-2 pb-8 sm:pb-4 border-t border-[#162030] bg-[#060b14] sm:rounded-b-2xl">

          {/* Mic */}
          <button
            onClick={handleMic}
            disabled={state === 'thinking'}
            className={`relative p-3.5 rounded-xl border-2 transition-all shrink-0 shadow-lg disabled:opacity-40 active:scale-95 touch-manipulation ${
              state === 'listening'
                ? 'bg-rose-600 border-rose-400 text-white scale-105'
                : state === 'speaking'
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 hover:bg-emerald-500/30'
                : !sttSupported
                ? 'bg-slate-800 border-slate-600 text-slate-600 cursor-not-allowed'
                : 'bg-cyan-500/15 border-cyan-500/35 text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-400 hover:scale-105'
            }`}
            title={
              !sttSupported        ? 'Voice not supported in this browser' :
              state === 'listening'? 'Stop listening' :
              state === 'speaking' ? 'Interrupt Shachina and speak' :
              'Speak to Shachina'
            }
          >
            {state === 'listening' ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            {state === 'listening' && (
              <span className="absolute inset-0 rounded-xl border-2 border-rose-400 animate-ping opacity-60" />
            )}
          </button>

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            value={state === 'listening' ? interim : query}
            onChange={e => { if (state !== 'listening') setQuery(e.target.value); }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(query);
              }
            }}
            placeholder={
              state === 'listening' ? 'Listening to your voice…' :
              state === 'thinking'  ? 'Processing your request…' :
              'Message Shachina…'
            }
            disabled={state === 'thinking'}
            className="flex-1 bg-[#0f1825] border border-[#1a2a3c] rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/60 font-mono transition-colors disabled:opacity-50 min-w-0"
          />

          {/* Send */}
          <button
            onClick={() => sendMessage(query)}
            disabled={!query.trim() || state === 'thinking'}
            className="p-3.5 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-black rounded-xl font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed shrink-0 shadow-md active:scale-95 touch-manipulation hover:scale-105"
            title="Send"
          >
            {state === 'thinking'
              ? <Loader2 className="w-4 h-4 animate-spin text-black" />
              : <Send className="w-4 h-4" />
            }
          </button>
        </div>
      </div>
    </div>
  );
};

// Accessing settings (for AI badge display) — graceful fallback
const settings = {
  GEMINI_API_KEY: false,
  OPENAI_API_KEY: false,
};
