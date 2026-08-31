/**
 * SHACHINA — ChatGPT-style Voice + Text Conversation Modal
 *
 * Full two-way natural voice conversation:
 * 1. User taps mic → real STT starts (browser-native, offline capable)
 * 2. Live interim transcript shown in the input area
 * 3. After ~1.4 s silence → fires automatically (no button press needed)
 * 4. User message posted as chat bubble immediately
 * 5. "Thinking..." shown, API called with full conversation history
 * 6. Shachina response posted as chat bubble
 * 7. TTS speaks the response automatically
 * 8. Tap mic ANYTIME to interrupt Shachina and start listening
 * 9. Text input always available (hybrid voice + text)
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Mic, MicOff, Volume2, VolumeX,
  Play, Pause, Square, Send, Loader2, Trash2, Sparkles,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getGreeting(name: string, lang: Lang): { text: string; speech: string } {
  const h = new Date().getHours();
  const period =
    h >= 5  && h < 12 ? 'morning'   :
    h >= 12 && h < 17 ? 'afternoon' :
    h >= 17 && h < 22 ? 'evening'   : 'night';

  if (lang === 'ne') {
    const salutation =
      period === 'morning' ? 'शुभ प्रभात' :
      period === 'afternoon' ? 'शुभ दिन' :
      period === 'evening' || period === 'night' ? 'शुभ सन्ध्या' : 'नमस्ते';
    const t = `${salutation}, ${name}। म Shachina हुँ — तपाईंको AI trading assistant। आज म तपाईंलाई कसरी सहयोग गर्न सक्छु?`;
    return { text: t, speech: t };
  }
  if (lang === 'hi') {
    const salutation = period === 'morning' ? 'शुभ प्रभात' : period === 'afternoon' ? 'नमस्ते' : 'शुभ संध्या';
    const t = `${salutation}, ${name}। मैं Shachina हूँ — आपकी AI trading assistant। आज मैं आपकी क्या मदद कर सकती हूँ?`;
    return { text: t, speech: t };
  }
  const salutation = period === 'morning' ? 'Good morning' : period === 'afternoon' ? 'Good afternoon' : period === 'evening' ? 'Good evening' : 'Good evening';
  const t = `${salutation}, ${name}. I am Shachina, your personal AI assistant. How can I help you today?`;
  return { text: t, speech: t };
}

// ─── Component ────────────────────────────────────────────────────────────────

export const VoiceAssistantModal: React.FC<Props> = ({
  isOpen, onClose, selectedSymbol, selectedMarket = 'NEPSE', user,
}) => {
  const name = user?.full_name || 'Bibek';

  const [messages, setMessages]         = useState<ChatMessage[]>([]);
  const [query,    setQuery]            = useState('');
  const [interim,  setInterim]          = useState('');
  const [state,    setState]            = useState<State>('idle');
  const [lang,     setLang]             = useState<Lang>('en');
  const [muted,    setMuted]            = useState(false);
  const [amplitude, setAmplitude]       = useState(0);
  const [errMsg,   setErrMsg]           = useState<string | null>(null);
  const [playingId, setPlayingId]       = useState<string | null>(null);
  const [pausedId,  setPausedId]        = useState<string | null>(null);
  const [bars,     setBars]             = useState([15,30,15,45,15,30,20,25]);

  const hasGreeted   = useRef(false);
  const messagesRef  = useRef<ChatMessage[]>([]);
  const scrollRef    = useRef<HTMLDivElement>(null);
  const animRef      = useRef<number | null>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const stateRef     = useRef<State>('idle');

  // Keep refs in sync
  messagesRef.current = messages;
  stateRef.current    = state;

  // ── Speech-recognition available? ────────────────────────────────────────
  const sttSupported = ShachinaVoiceEngine.isRecognitionSupported();

  // ── Helper: append chat bubble ───────────────────────────────────────────
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

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, interim, state]);

  // ── Equalizer bars animation ─────────────────────────────────────────────
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

  // ── On open: deliver greeting ────────────────────────────────────────────
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
          () => { setState('idle'); setPlayingId(null); setPausedId(null); }
        );
      }, 500);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ── TTS helpers ───────────────────────────────────────────────────────────
  const playMsg = (msg: ChatMessage) => {
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
  };

  const pauseSpeech = () => {
    voiceEngine.pause();
    setPausedId(playingId);
    setState('idle');
  };

  const stopSpeech = useCallback(() => {
    voiceEngine.stop();
    setPlayingId(null);
    setPausedId(null);
    setState('idle');
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    voiceEngine.isMuted = next;
    if (next) stopSpeech();
  };

  // ── Core send handler ─────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string, isVoice = false) => {
    const t = text.trim();
    if (!t || stateRef.current === 'thinking') return;

    stopSpeech();
    voiceEngine.stopListening();
    setQuery('');
    setInterim('');
    setErrMsg(null);
    setState('idle');

    // 1. User bubble
    append('user', t, undefined, lang, isVoice);

    // 2. Thinking
    setState('thinking');

    try {
      const history = messagesRef.current.slice(-10).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text,
      }));

      const res = await api.askAssistant(t, selectedSymbol, selectedMarket, lang, history);

      // 3. Shachina bubble
      const msg = append('shachina', res.response, res.speech_text, res.language || lang);
      setState('idle');

      // 4. Auto-speak
      if (!muted && res.speech_text) {
        setPlayingId(msg.id);
        setState('speaking');
        voiceEngine.speak(
          res.speech_text, res.language || lang, msg.id,
          () => setState('speaking'),
          () => { setState('idle'); setPlayingId(null); setPausedId(null); }
        );
      }
    } catch {
      setState('error');
      const errText = lang === 'ne'
        ? 'Shachina अहिले उपलब्ध भएन। कृपया पुनः प्रयास गर्नुहोस्।'
        : 'Shachina is temporarily unavailable. Please try again.';
      append('shachina', errText, errText, lang);
      setErrMsg(errText);
      setTimeout(() => { setState('idle'); setErrMsg(null); }, 5000);
    }
  }, [lang, muted, selectedSymbol, selectedMarket, append, stopSpeech]);

  // ── Microphone button ─────────────────────────────────────────────────────
  const handleMic = async () => {
    // Interrupt Shachina speaking → listen immediately
    if (state === 'speaking') stopSpeech();

    // Toggle off if already listening
    if (state === 'listening') {
      voiceEngine.stopListening();
      setAmplitude(0);
      setInterim('');
      setState('idle');
      return;
    }

    if (!sttSupported) {
      setErrMsg("Voice input isn't supported in this browser. You can use text chat instead.");
      return;
    }

    stopSpeech();
    setErrMsg(null);
    setInterim('');

    // Request mic + start visualiser
    const granted = await voiceEngine.startMicVisualiser(setAmplitude);
    if (!granted) {
      setErrMsg('Microphone access denied. Please allow it in your browser settings and try again.');
      return;
    }

    setState('listening');

    voiceEngine.listen(
      lang,
      // onInterim — live preview
      (text) => setInterim(text),
      // onResult — auto-submit after silence
      (finalText) => {
        setInterim('');
        setAmplitude(0);
        voiceEngine.stopMicVisualiser();
        setState('idle');
        if (finalText.trim()) sendMessage(finalText, true);
      },
      // onError
      (msg) => {
        setErrMsg(msg);
        setInterim('');
        setAmplitude(0);
        voiceEngine.stopMicVisualiser();
        setState('error');
        setTimeout(() => { setState('idle'); setErrMsg(null); }, 5000);
      },
      // onEnd (no speech detected)
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
    stopSpeech();
    voiceEngine.stopListening();
    setMessages([]);
    setInterim('');
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

  // Quick suggestion chips
  const chips =
    lang === 'ne' ? [
      'आजको NEPSE बजार सारांश',
      'Banking sector कस्तो छ?',
      `${selectedSymbol} analyze गर`,
      '1% risk नियम के हो?',
      'के किन्ने?',
    ] : lang === 'hi' ? [
      'आज का NEPSE बाजार',
      'Banking sector कैसा है?',
      `${selectedSymbol} analyze करो`,
      'Risk limit क्या है?',
      'क्या खरीदूँ?',
    ] : [
      "Today's NEPSE market summary",
      'What about banking stocks?',
      `Analyze ${selectedSymbol}`,
      'What is my risk limit?',
      'Would you buy it?',
    ];

  // Status label
  const statusLabel =
    state === 'listening' ? (interim || 'Listening...') :
    state === 'thinking'  ? 'Shachina is thinking...' :
    state === 'speaking'  ? 'Shachina is speaking...' :
    state === 'error'     ? (errMsg || 'Error. Try again.') :
    sttSupported          ? 'Tap 🎙️ to speak or type below' :
                            'Voice not supported — type your message below';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-md p-0 sm:p-4">
      <div
        className="bg-[#090e1a] border-t sm:border border-[#1a2a40] sm:rounded-2xl w-full sm:max-w-xl flex flex-col shadow-2xl overflow-hidden"
        style={{ height: '100dvh', maxHeight: '100dvh' }}
      >

        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-[#162030] bg-[#060b14] sm:rounded-t-2xl">
          <div className="flex items-center gap-3">
            {/* Avatar with speaking pulse */}
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-indigo-600 flex items-center justify-center shadow-lg shrink-0">
              <span className="text-xl">🎙️</span>
              {state === 'speaking' && (
                <span className="absolute inset-0 rounded-xl bg-emerald-400/20 animate-ping border border-emerald-400/40" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-extrabold text-white text-sm tracking-widest">SHACHINA</span>
                <span className="text-[9px] bg-cyan-950 text-cyan-400 border border-cyan-800/60 px-1.5 py-0.5 rounded font-mono">VOICE AI</span>
                <span className="text-[9px] bg-blue-950 text-blue-300 border border-blue-800/60 px-1.5 py-0.5 rounded font-mono">{selectedSymbol}</span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                Owner: <span className="text-cyan-300 font-semibold">{name}</span>
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

            {/* Mute */}
            <button onClick={toggleMute}
              className={`p-2 rounded-lg border transition-all ${
                muted
                  ? 'bg-rose-950/80 border-rose-700/60 text-rose-300'
                  : 'bg-[#0f1a27] border-[#1a2a40] text-cyan-400 hover:text-white'
              }`}
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Clear */}
            <button onClick={clearChat}
              className="p-2 rounded-lg bg-[#0f1a27] border border-[#1a2a40] text-slate-400 hover:text-white transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Close */}
            <button onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-800/80 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── STATUS BAR ─────────────────────────────────────────────────── */}
        <div className="shrink-0 mx-4 mt-3 bg-[#070c17] border border-[#162030] rounded-xl px-4 py-2 flex items-center justify-between">
          <span className={`text-[11px] font-mono truncate max-w-[70%] ${
            state === 'listening' ? 'text-rose-400 animate-pulse' :
            state === 'thinking'  ? 'text-amber-400' :
            state === 'speaking'  ? 'text-emerald-400' :
            state === 'error'     ? 'text-rose-400' :
            'text-slate-400'
          }`}>
            {state === 'thinking' && <Loader2 className="inline w-3 h-3 mr-1 animate-spin" />}
            {statusLabel}
          </span>

          {/* Equalizer bars */}
          <div className="flex items-end gap-[2px] h-5 shrink-0">
            {bars.map((h, i) => (
              <div key={i} className={`w-[3px] rounded-full transition-all duration-75 ${
                state === 'speaking'  ? 'bg-gradient-to-t from-cyan-500 to-emerald-400' :
                state === 'listening' ? 'bg-gradient-to-t from-rose-500 to-amber-300' :
                'bg-slate-700'
              }`} style={{ height: `${Math.max(15, h)}%` }} />
            ))}
          </div>
        </div>

        {/* ── CHAT AREA ──────────────────────────────────────────────────── */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">

          {messages.map(msg => {
            const isPlaying = playingId === msg.id && state === 'speaking';
            const isPaused_ = pausedId  === msg.id;

            return (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>

                {/* Shachina avatar */}
                {msg.role === 'shachina' && (
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-indigo-600 flex items-center justify-center text-xs shrink-0 mr-2 mt-0.5 shadow">⚡</div>
                )}

                <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-lg ${
                  msg.role === 'user'
                    ? 'bg-cyan-500/15 border border-cyan-500/25 text-slate-100 rounded-tr-sm'
                    : 'bg-[#101828] border border-[#1a2a3c] text-slate-100 rounded-tl-sm'
                }`}>

                  {/* Shachina header */}
                  {msg.role === 'shachina' && (
                    <div className="flex items-center justify-between mb-1.5 pb-1.5 border-b border-[#1a2a3c]/70 text-[10px]">
                      <span className="text-cyan-400 font-mono font-bold flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />SHACHINA
                      </span>
                      <span className="text-slate-500">{msg.time}</span>
                    </div>
                  )}

                  {/* Text */}
                  <div className="flex items-start gap-1">
                    {msg.role === 'user' && msg.isVoice && (
                      <span className="text-cyan-400 font-mono text-[10px] shrink-0 mt-0.5">🎤</span>
                    )}
                    <p className="whitespace-pre-line">{msg.text}</p>
                  </div>

                  {/* User timestamp */}
                  {msg.role === 'user' && (
                    <p className="text-[10px] text-slate-500 text-right mt-1 font-mono">{msg.time}</p>
                  )}

                  {/* Shachina audio controls */}
                  {msg.role === 'shachina' && (
                    <div className="mt-2 pt-2 border-t border-[#1a2a3c]/60 flex items-center gap-1.5 flex-wrap">
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
                          <span className="text-[9px] text-emerald-400 font-mono flex items-center gap-1 animate-pulse">
                            <Volume2 className="w-3 h-3" />Speaking…
                          </span>
                        </>
                      ) : isPaused_ ? (
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
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Live interim transcript bubble */}
          {interim && (
            <div className="flex justify-end">
              <div className="bg-rose-950/50 border border-rose-500/35 rounded-2xl rounded-tr-sm px-4 py-2 text-xs text-rose-200 flex items-center gap-1.5 max-w-[85%] italic">
                <span className="text-rose-400 shrink-0">🎤</span>
                <span>{interim}</span>
              </div>
            </div>
          )}

          {/* Thinking dots */}
          {state === 'thinking' && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-indigo-600 flex items-center justify-center text-xs shrink-0 mr-2 mt-0.5 shadow">⚡</div>
              <div className="bg-[#101828] border border-[#1a2a3c] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2 shadow-md">
                {[0,1,2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
                <span className="text-[11px] text-slate-400 font-mono">Thinking…</span>
              </div>
            </div>
          )}
        </div>

        {/* ── QUICK CHIPS ────────────────────────────────────────────────── */}
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

        {/* ── ERROR BANNER ───────────────────────────────────────────────── */}
        {errMsg && (
          <div className="shrink-0 mx-4 mb-2 bg-rose-950/70 border border-rose-700/50 rounded-xl px-3 py-2 text-[11px] text-rose-300 font-mono flex items-start justify-between gap-2 shadow">
            <span>⚠️ {errMsg}</span>
            <button onClick={() => setErrMsg(null)} className="text-rose-400 hover:text-white shrink-0">✕</button>
          </div>
        )}

        {/* ── INPUT BAR ──────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center gap-2 px-4 pt-2 pb-8 sm:pb-4 border-t border-[#162030] bg-[#060b14] sm:rounded-b-2xl">

          {/* Mic button */}
          <button
            onClick={handleMic}
            disabled={state === 'thinking'}
            className={`relative p-3.5 rounded-xl border-2 transition-all shrink-0 shadow-lg disabled:opacity-40 active:scale-95 touch-manipulation ${
              state === 'listening'
                ? 'bg-rose-600 border-rose-400 text-white scale-105'
                : state === 'speaking'
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 hover:bg-emerald-500/30'
                : 'bg-cyan-500/15 border-cyan-500/35 text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-400 hover:scale-105'
            } ${!sttSupported ? 'opacity-40 cursor-not-allowed' : ''}`}
            title={
              !sttSupported         ? "Voice not supported in this browser" :
              state === 'listening' ? 'Stop listening' :
              state === 'speaking'  ? 'Interrupt Shachina and speak' :
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
            value={interim && state === 'listening' ? interim : query}
            onChange={e => {
              if (state !== 'listening') setQuery(e.target.value);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(query);
              }
            }}
            placeholder={
              state === 'listening' ? 'Listening to your voice…' :
              state === 'thinking'  ? 'Waiting for Shachina…' :
              !sttSupported         ? 'Type your message here…' :
              'Message Shachina…'
            }
            disabled={state === 'thinking'}
            className="flex-1 bg-[#0f1825] border border-[#1a2a3c] rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/60 font-mono transition-colors disabled:opacity-50 min-w-0"
          />

          {/* Send button */}
          <button
            onClick={() => sendMessage(query)}
            disabled={!query.trim() || state === 'thinking'}
            className="p-3.5 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-black rounded-xl font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed shrink-0 shadow-md active:scale-95 touch-manipulation hover:scale-105"
            title="Send message"
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
