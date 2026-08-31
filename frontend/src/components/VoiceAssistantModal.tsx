import React, { useState, useEffect, useRef, useCallback } from 'react';
import { voiceEngine } from '../services/voiceEngine';
import { api } from '../services/api';
import { User } from '../types';
import {
  X,
  Mic,
  MicOff,
  Sparkles,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Square,
  Send,
  Loader2,
  Trash2,
  MessageSquare,
} from 'lucide-react';

interface VoiceAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSymbol: string;
  selectedMarket?: string;
  user?: User | null;
}

interface Message {
  id: string;
  role: 'user' | 'shachina';
  text: string;
  speechText?: string;
  timestamp: string;
  language?: string;
  isVoice?: boolean;
}

type Lang = 'en' | 'ne' | 'hi';
type AssistantState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export const VoiceAssistantModal: React.FC<VoiceAssistantModalProps> = ({
  isOpen,
  onClose,
  selectedSymbol,
  selectedMarket = 'NEPSE',
  user,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [assistantState, setAssistantState] = useState<AssistantState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [language, setLanguage] = useState<Lang>('en');
  const [micAmplitude, setMicAmplitude] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [speechBars, setSpeechBars] = useState<number[]>([15, 25, 15, 35, 15, 25, 20, 15]);

  // Track specific playing message
  const [activePlayingId, setActivePlayingId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  // Session flags & refs
  const hasGreetedRef = useRef<boolean>(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;

  const userName = user?.full_name || 'Bibek';

  // Helper to append message to state and ref
  const addMessage = useCallback(
    (
      role: 'user' | 'shachina',
      text: string,
      speechText?: string,
      lang?: string,
      isVoice: boolean = false
    ): Message => {
      const msg: Message = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        role,
        text,
        speechText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        language: lang,
        isVoice,
      };
      setMessages((prev) => [...prev, msg]);
      return msg;
    },
    []
  );

  // Time-Aware Personalized Greeting Generator
  const getTimeAwareGreeting = useCallback(
    (name: string, lang: Lang): { text: string; speech: string } => {
      const hour = new Date().getHours();
      let timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night' = 'morning';

      if (hour >= 5 && hour < 12) {
        timeOfDay = 'morning';
      } else if (hour >= 12 && hour < 17) {
        timeOfDay = 'afternoon';
      } else if (hour >= 17 && hour < 22) {
        timeOfDay = 'evening';
      } else {
        timeOfDay = 'night';
      }

      if (lang === 'ne') {
        if (timeOfDay === 'morning') {
          return {
            text: `शुभ प्रभात, ${name}। म Shachina हुँ — तपाईंको personal AI assistant। आज म तपाईंलाई बजार विश्लेषण र ट्रेडिङमा कसरी सहयोग गर्न सक्छु?`,
            speech: `शुभ प्रभात, ${name}। म Shachina हुँ, तपाईंको personal assistant। आज म तपाईंलाई कसरी सहयोग गर्न सक्छु?`,
          };
        } else if (timeOfDay === 'afternoon') {
          return {
            text: `नमस्ते, ${name}। म Shachina हुँ — तपाईंको personal AI assistant। आज म तपाईंलाई बजार विश्लेषण र ट्रेडिङमा कसरी सहयोग गर्न सक्छु?`,
            speech: `नमस्ते, ${name}। म Shachina हुँ, तपाईंको personal assistant। आज म तपाईंलाई कसरी सहयोग गर्न सक्छु?`,
          };
        } else {
          return {
            text: `शुभ सन्ध्या, ${name}। म Shachina हुँ — तपाईंको personal AI assistant। आज म तपाईंलाई बजार विश्लेषण र ट्रेडिङमा कसरी सहयोग गर्न सक्छु?`,
            speech: `शुभ सन्ध्या, ${name}। म Shachina हुँ, तपाईंको personal assistant। आज म तपाईंलाई कसरी सहयोग गर्न सक्छु?`,
          };
        }
      } else if (lang === 'hi') {
        if (timeOfDay === 'morning') {
          return {
            text: `शुभ प्रभात, ${name}। मैं Shachina हूँ — आपकी personal AI trading assistant। आज मैं आपकी क्या मदद कर सकती हूँ?`,
            speech: `शुभ प्रभात, ${name}। मैं Shachina हूँ। आज मैं आपकी क्या मदद कर सकती हूँ?`,
          };
        } else if (timeOfDay === 'afternoon') {
          return {
            text: `नमस्ते, ${name}। मैं Shachina हूँ — आपकी personal AI trading assistant। आज मैं आपकी क्या मदद कर सकती हूँ?`,
            speech: `नमस्ते, ${name}। मैं Shachina हूँ। आज मैं आपकी क्या मदद कर सकती हूँ?`,
          };
        } else {
          return {
            text: `शुभ संध्या, ${name}। मैं Shachina हूँ — आपकी personal AI trading assistant। आज मैं आपकी क्या मदद कर सकती हूँ?`,
            speech: `शुभ संध्या, ${name}। मैं Shachina हूँ। आज मैं आपकी क्या मदद कर सकती हूँ?`,
          };
        }
      } else {
        // English (Default)
        if (timeOfDay === 'morning') {
          return {
            text: `Good morning, ${name}. I am Shachina, your personal assistant. How can I help you today?`,
            speech: `Good morning, ${name}. I am Shachina, your personal assistant. How can I help you today?`,
          };
        } else if (timeOfDay === 'afternoon') {
          return {
            text: `Good afternoon, ${name}. I am Shachina, your personal assistant. How can I help you today?`,
            speech: `Good afternoon, ${name}. I am Shachina, your personal assistant. How can I help you today?`,
          };
        } else if (timeOfDay === 'evening') {
          return {
            text: `Good evening, ${name}. I am Shachina, your personal assistant. How can I help you today?`,
            speech: `Good evening, ${name}. I am Shachina, your personal assistant. How can I help you today?`,
          };
        } else {
          return {
            text: `Good evening, ${name}. I am Shachina, your personal assistant. How can I help you tonight?`,
            speech: `Good evening, ${name}. I am Shachina, your personal assistant. How can I help you tonight?`,
          };
        }
      }
    },
    []
  );

  // Equalizer visualizer animation
  useEffect(() => {
    if (assistantState === 'speaking' || assistantState === 'listening') {
      const animate = () => {
        if (assistantState === 'listening' && micAmplitude > 0) {
          setSpeechBars(
            Array.from({ length: 8 }, (_, i) =>
              Math.max(10, Math.min(100, micAmplitude + Math.sin(Date.now() / 140 + i) * 30))
            )
          );
        } else if (assistantState === 'speaking') {
          setSpeechBars(Array.from({ length: 8 }, () => 15 + Math.random() * 80));
        }
        animRef.current = requestAnimationFrame(animate);
      };
      animRef.current = requestAnimationFrame(animate);
    } else {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      setSpeechBars([15, 30, 15, 45, 15, 30, 20, 25]);
    }
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [assistantState, micAmplitude]);

  // Auto-scroll chat to latest message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, interimTranscript, assistantState]);

  // Initial welcome greeting on open
  useEffect(() => {
    if (!isOpen) {
      voiceEngine.stop();
      voiceEngine.stopListening();
      setAssistantState('idle');
      setActivePlayingId(null);
      return;
    }

    // Deliver time-aware personalized welcome on initial open
    if (!hasGreetedRef.current || messages.length === 0) {
      hasGreetedRef.current = true;
      const greeting = getTimeAwareGreeting(userName, language);
      const greetingMsg = addMessage('shachina', greeting.text, greeting.speech, language);

      if (!isMuted) {
        setTimeout(() => {
          setActivePlayingId(greetingMsg.id);
          setAssistantState('speaking');
          voiceEngine.speak(
            greeting.speech,
            language,
            greetingMsg.id,
            () => {
              setAssistantState('speaking');
              setIsPaused(false);
            },
            () => {
              setAssistantState('idle');
              setActivePlayingId(null);
              setIsPaused(false);
            }
          );
        }, 400);
      }
    }
  }, [isOpen, userName, language, isMuted, addMessage, getTimeAwareGreeting]);

  // Play audio for specific message
  const playSpeech = (msg: Message) => {
    if (isMuted) return;

    if (activePlayingId === msg.id && isPaused) {
      voiceEngine.resume();
      setIsPaused(false);
      setAssistantState('speaking');
      return;
    }

    voiceEngine.stop();
    setActivePlayingId(msg.id);
    setAssistantState('speaking');
    setIsPaused(false);

    voiceEngine.speak(
      msg.speechText || msg.text,
      msg.language || language,
      msg.id,
      () => {
        setAssistantState('speaking');
        setIsPaused(false);
      },
      () => {
        setAssistantState('idle');
        setActivePlayingId(null);
        setIsPaused(false);
      }
    );
  };

  const pauseSpeech = () => {
    voiceEngine.pause();
    setIsPaused(true);
    setAssistantState('idle');
  };

  const stopSpeech = () => {
    voiceEngine.stop();
    setActivePlayingId(null);
    setIsPaused(false);
    setAssistantState('idle');
  };

  // Toggle Mute
  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    voiceEngine.isMuted = next;
    if (next) {
      stopSpeech();
    }
  };

  // Core Send / Multi-Turn Conversation Handler
  const handleSendMessage = async (textToSend: string, isVoiceQuery: boolean = false) => {
    const text = textToSend.trim();
    if (!text || assistantState === 'thinking') return;

    // Immediately stop speech and listening
    stopSpeech();
    voiceEngine.stopListening();
    setQuery('');
    setInterimTranscript('');
    setErrorMessage(null);

    // 1. Immediately post USER chat bubble
    addMessage('user', text, undefined, language, isVoiceQuery);

    // 2. Transition to Thinking state
    setAssistantState('thinking');

    try {
      // Build conversation history for continuous context
      const historyPayload = messagesRef.current.slice(-8).map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text,
      }));

      // 3. Process with AI Backend
      const result = await api.askAssistant(
        text,
        selectedSymbol,
        selectedMarket,
        language,
        historyPayload
      );

      // 4. Post ASSISTANT chat bubble
      const assistantMsg = addMessage(
        'shachina',
        result.response,
        result.speech_text,
        result.language || language
      );

      setAssistantState('idle');

      // 5. Automatically speak response aloud via Text-to-Speech
      if (!isMuted && result.speech_text) {
        setActivePlayingId(assistantMsg.id);
        setAssistantState('speaking');
        voiceEngine.speak(
          result.speech_text,
          result.language || language,
          assistantMsg.id,
          () => {
            setAssistantState('speaking');
            setIsPaused(false);
          },
          () => {
            setAssistantState('idle');
            setActivePlayingId(null);
            setIsPaused(false);
          }
        );
      }
    } catch {
      setAssistantState('error');
      const fallback =
        language === 'ne'
          ? 'Shachina अहिले उपलब्ध हुन सकेन। कृपया आफ्नो इन्टरनेट जाँच गरी पुनः प्रयास गर्नुहोस्।'
          : 'Shachina is temporarily unavailable. Please check your connection and try again.';
      addMessage('shachina', fallback, fallback, language);
      setErrorMessage(fallback);
      setTimeout(() => setAssistantState('idle'), 4000);
    }
  };

  // Toggle Microphone Input with Real-Time Two-Way Interaction
  const handleToggleMic = async () => {
    // If Shachina is speaking or user is listening, interrupt and restart listening
    if (assistantState === 'speaking') {
      stopSpeech();
    }

    if (assistantState === 'listening') {
      voiceEngine.stopListening();
      setAssistantState('idle');
      setMicAmplitude(0);
      setInterimTranscript('');
      return;
    }

    stopSpeech();
    setErrorMessage(null);
    setInterimTranscript('');

    const granted = await voiceEngine.startMicrophoneWithVisualizer((lvl) => setMicAmplitude(lvl));
    if (!granted) {
      setAssistantState('error');
      setErrorMessage('Microphone access is required for voice input. Please allow permissions in your browser.');
      setTimeout(() => setAssistantState('idle'), 4500);
      return;
    }

    setAssistantState('listening');

    voiceEngine.listen(
      language,
      (interim) => {
        // Show interim recognized speech live in active state
        setInterimTranscript(interim);
      },
      (finalText) => {
        // Final text recognized: automatically send as user voice message!
        setInterimTranscript('');
        setAssistantState('idle');
        voiceEngine.stopMicrophoneVisualizer();
        setMicAmplitude(0);

        if (finalText.trim()) {
          handleSendMessage(finalText, true);
        }
      },
      (err) => {
        setAssistantState('error');
        setErrorMessage(typeof err === 'string' ? err : "Sorry, I couldn't hear you. Please try again.");
        voiceEngine.stopMicrophoneVisualizer();
        setMicAmplitude(0);
        setInterimTranscript('');
        setTimeout(() => setAssistantState('idle'), 4000);
      },
      () => {
        setAssistantState('idle');
        voiceEngine.stopMicrophoneVisualizer();
        setMicAmplitude(0);
      }
    );
  };

  // Clear Conversation History
  const handleClearHistory = () => {
    stopSpeech();
    setMessages([]);
    hasGreetedRef.current = false;
    const greeting = getTimeAwareGreeting(userName, language);
    addMessage('shachina', greeting.text, greeting.speech, language);
  };

  if (!isOpen) return null;

  // Quick suggestion chips
  const quickChips = [
    language === 'ne' ? `आजको NEPSE बजार समरी देखाउ` : `Show me today's NEPSE market summary`,
    language === 'ne' ? `Banking sector को अवस्था कस्तो छ?` : `What about banking stocks?`,
    language === 'ne' ? `${selectedSymbol} analyze गर` : `Analyze ${selectedSymbol}`,
    language === 'ne' ? `हाम्रो 1% risk नियम के हो?` : `What about the risk?`,
    language === 'ne' ? `के यो किन्न उपयुक्त छ?` : `Would you buy it?`,
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md font-['Plus_Jakarta_Sans',sans-serif] p-0 sm:p-4">
      <div
        className="bg-[#0b111e] border-t sm:border border-[#1e2e47] sm:rounded-2xl w-full sm:max-w-xl flex flex-col shadow-2xl overflow-hidden transition-all"
        style={{ height: '100dvh', maxHeight: '100dvh' }}
      >
        {/* =========================================================================
            1. HEADER BAR
        ========================================================================= */}
        <div className="shrink-0 flex items-center justify-between px-4 py-3.5 border-b border-[#18263c] bg-[#070c16] sm:rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-400 via-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <span className="text-xl">🎙️</span>
              {assistantState === 'speaking' && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#070c16] animate-ping" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-white text-sm tracking-wide">SHACHINA</h3>
                <span className="text-[9px] bg-cyan-950 text-cyan-400 border border-cyan-800 px-1.5 py-0.5 rounded font-mono font-bold">
                  VOICE AI
                </span>
                <span className="text-[9px] bg-blue-950 text-blue-300 border border-blue-800 px-1.5 py-0.5 rounded font-mono font-bold">
                  {selectedSymbol}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono">
                Owner: <span className="text-cyan-300 font-semibold">{userName}</span> (Personalized)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Language Switcher */}
            <div className="flex bg-[#101828] border border-[#1e2e47] rounded-lg p-0.5 gap-0.5">
              {(['en', 'ne', 'hi'] as Lang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => {
                    setLanguage(l);
                    stopSpeech();
                  }}
                  className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${
                    language === l ? 'bg-cyan-400 text-black shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Mute / Unmute Button */}
            <button
              onClick={handleToggleMute}
              title={isMuted ? 'Unmute voice' : 'Mute voice'}
              className={`p-2 rounded-lg border transition-all ${
                isMuted
                  ? 'bg-rose-950/80 border-rose-700 text-rose-300'
                  : 'bg-[#101828] border-[#1e2e47] text-cyan-400 hover:text-white hover:border-cyan-500/50'
              }`}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {/* Clear Chat History */}
            <button
              onClick={handleClearHistory}
              title="Clear conversation"
              className="p-2 rounded-lg bg-[#101828] border border-[#1e2e47] text-slate-400 hover:text-white hover:border-slate-600 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Close Modal */}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* =========================================================================
            2. TWO-WAY VOICE & STATUS EQUALIZER BANNER
        ========================================================================= */}
        <div className="shrink-0 mx-4 mt-3 bg-[#080d17] border border-[#17263c] rounded-xl px-4 py-2.5 flex items-center justify-between shadow-inner">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold">
              {assistantState === 'listening' ? (
                <span className="text-rose-400 flex items-center gap-1.5 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  Listening to your voice...
                </span>
              ) : assistantState === 'thinking' ? (
                <span className="text-amber-400 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Shachina is thinking...
                </span>
              ) : assistantState === 'speaking' ? (
                <span className="text-emerald-400 flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 animate-bounce" />
                  Shachina is speaking... (Tap mic to interrupt)
                </span>
              ) : assistantState === 'error' ? (
                <span className="text-rose-400">
                  {errorMessage || "Sorry, I couldn't hear you. Please try again."}
                </span>
              ) : (
                <span className="text-slate-400">Tap 🎙️ to talk or type below</span>
              )}
            </span>
          </div>

          {/* Equalizer Frequency Bars */}
          <div className="flex items-end gap-1 h-6">
            {speechBars.map((h, i) => (
              <div
                key={i}
                className={`w-1 rounded-full transition-all duration-75 ${
                  assistantState === 'speaking'
                    ? 'bg-gradient-to-t from-cyan-500 to-emerald-400'
                    : assistantState === 'listening'
                    ? 'bg-gradient-to-t from-rose-600 to-amber-400'
                    : 'bg-slate-700'
                }`}
                style={{ height: `${Math.max(15, h)}%` }}
              />
            ))}
          </div>
        </div>

        {/* =========================================================================
            3. CHAT MESSAGES AREA (ChatGPT-Style Bubbles)
        ========================================================================= */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3.5">
          {messages.map((msg) => {
            const isSelfSpeaking = activePlayingId === msg.id && assistantState === 'speaking';
            const isSelfPaused = activePlayingId === msg.id && isPaused;

            return (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'shachina' && (
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-xs shrink-0 mr-2.5 mt-0.5 shadow-md">
                    ⚡
                  </div>
                )}

                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-lg ${
                    msg.role === 'user'
                      ? 'bg-cyan-500/15 border border-cyan-500/30 text-slate-100 rounded-tr-sm'
                      : 'bg-[#121a2c] border border-[#1b2a42] text-slate-100 rounded-tl-sm'
                  }`}
                >
                  {/* Assistant Message Header */}
                  {msg.role === 'shachina' && (
                    <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-[#1b2a42]/70 text-[10px] text-cyan-400 font-mono font-bold">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-cyan-400" />
                        SHACHINA
                      </span>
                      <span className="text-slate-500 font-normal">{msg.timestamp}</span>
                    </div>
                  )}

                  {/* Message Content */}
                  <div className="flex items-start gap-1.5">
                    {msg.role === 'user' && msg.isVoice && (
                      <span className="text-cyan-400 font-mono text-[10px] shrink-0 mt-0.5">🎤</span>
                    )}
                    <p className="whitespace-pre-line font-sans leading-relaxed selection:bg-cyan-500 selection:text-black">
                      {msg.text}
                    </p>
                  </div>

                  {/* User Timestamp */}
                  {msg.role === 'user' && (
                    <p className="text-[10px] text-slate-500 text-right mt-1 font-mono">{msg.timestamp}</p>
                  )}

                  {/* Shachina Audio Controls (Play / Pause / Resume / Stop) */}
                  {msg.role === 'shachina' && (
                    <div className="mt-2.5 pt-2 border-t border-[#1b2a42]/70 flex items-center gap-2">
                      {isSelfSpeaking ? (
                        <>
                          <button
                            onClick={pauseSpeech}
                            className="flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 font-mono font-bold bg-amber-950/40 border border-amber-800/60 px-2 py-1 rounded-md transition-colors"
                          >
                            <Pause className="w-2.5 h-2.5 fill-current" />
                            Pause
                          </button>
                          <button
                            onClick={stopSpeech}
                            className="flex items-center gap-1 text-[10px] text-rose-400 hover:text-rose-300 font-mono bg-rose-950/40 border border-rose-800/60 px-2 py-1 rounded-md transition-colors"
                          >
                            <Square className="w-2.5 h-2.5 fill-current" />
                            Stop
                          </button>
                          <span className="text-[9px] text-emerald-400 font-mono flex items-center gap-1">
                            <Volume2 className="w-3 h-3 animate-pulse" /> Playing
                          </span>
                        </>
                      ) : isSelfPaused ? (
                        <>
                          <button
                            onClick={() => playSpeech(msg)}
                            className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 font-mono font-bold bg-emerald-950/40 border border-emerald-800/60 px-2 py-1 rounded-md transition-colors"
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                            Resume
                          </button>
                          <button
                            onClick={stopSpeech}
                            className="flex items-center gap-1 text-[10px] text-rose-400 hover:text-rose-300 font-mono bg-rose-950/40 border border-rose-800/60 px-2 py-1 rounded-md transition-colors"
                          >
                            <Square className="w-2.5 h-2.5 fill-current" />
                            Stop
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => playSpeech(msg)}
                          className="flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 font-mono bg-cyan-950/40 border border-cyan-800/60 px-2 py-1 rounded-md transition-colors"
                        >
                          <Volume2 className="w-3 h-3" />
                          Listen Voice
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Live Interim Recognized Speech Bubble */}
          {interimTranscript && (
            <div className="flex justify-end">
              <div className="bg-rose-950/50 border border-rose-500/40 rounded-2xl rounded-tr-sm px-4 py-2.5 text-xs text-rose-200 shadow-md flex items-center gap-2 max-w-[85%] animate-pulse">
                <span>🎤 {interimTranscript}</span>
              </div>
            </div>
          )}

          {/* Thinking Indicator Bubble */}
          {assistantState === 'thinking' && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-xs shrink-0 mr-2.5 mt-0.5 shadow">
                ⚡
              </div>
              <div className="bg-[#121a2c] border border-[#1b2a42] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2 shadow-md">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
                <span className="text-xs text-slate-400 font-mono">Shachina is thinking...</span>
              </div>
            </div>
          )}
        </div>

        {/* =========================================================================
            4. QUICK SUGGESTION CHIPS
        ========================================================================= */}
        <div className="shrink-0 px-4 pb-2">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {quickChips.map((chip) => (
              <button
                key={chip}
                onClick={() => handleSendMessage(chip, false)}
                disabled={assistantState === 'thinking' || assistantState === 'listening'}
                className="bg-[#101726] hover:bg-[#182338] border border-[#1b2b44] hover:border-cyan-500/50 text-slate-300 hover:text-cyan-300 text-[11px] px-3 py-1.5 rounded-lg font-mono whitespace-nowrap shrink-0 disabled:opacity-40 transition-all shadow-sm active:scale-95"
              >
                "{chip}"
              </button>
            ))}
          </div>
        </div>

        {/* =========================================================================
            5. ERROR BANNER (Friendly, Non-Technical)
        ========================================================================= */}
        {errorMessage && (
          <div className="shrink-0 mx-4 mb-2 bg-rose-950/70 border border-rose-600/50 rounded-xl px-3.5 py-2 text-[11px] text-rose-300 font-mono flex items-start justify-between gap-2 shadow-md">
            <span>⚠️ {errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-400 hover:text-white font-bold shrink-0"
            >
              ✕
            </button>
          </div>
        )}

        {/* =========================================================================
            6. CHATGPT-STYLE INPUT BAR
        ========================================================================= */}
        <div className="shrink-0 flex items-center gap-2 px-4 pb-8 sm:pb-4 pt-2 border-t border-[#18263c] bg-[#070c16] sm:rounded-b-2xl">
          {/* Microphone Voice Button */}
          <button
            onClick={handleToggleMic}
            disabled={assistantState === 'thinking'}
            className={`relative p-3.5 rounded-xl border-2 transition-all shrink-0 shadow-lg disabled:opacity-40 active:scale-95 ${
              assistantState === 'listening'
                ? 'bg-rose-600 border-rose-400 text-white scale-105 animate-pulse shadow-rose-500/40'
                : assistantState === 'speaking'
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 hover:bg-emerald-500/30'
                : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25 hover:border-cyan-400 hover:scale-105'
            }`}
            title={
              assistantState === 'listening'
                ? 'Stop listening'
                : assistantState === 'speaking'
                ? 'Interrupt and speak'
                : 'Speak to Shachina'
            }
          >
            {assistantState === 'listening' ? (
              <MicOff className="w-5 h-5" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
            {assistantState === 'listening' && (
              <span className="absolute inset-0 rounded-xl border-2 border-rose-400 animate-ping opacity-60" />
            )}
          </button>

          {/* Text Input */}
          <input
            ref={inputRef}
            type="text"
            placeholder={
              assistantState === 'listening'
                ? 'Listening to your voice...'
                : 'Message Shachina...'
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage(query, false);
              }
            }}
            disabled={assistantState === 'thinking'}
            className="flex-1 bg-[#101726] border border-[#1e2e47] rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono transition-colors disabled:opacity-50"
          />

          {/* Send Button */}
          <button
            onClick={() => handleSendMessage(query, false)}
            disabled={!query.trim() || assistantState === 'thinking'}
            className="p-3.5 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 active:scale-95 text-black rounded-xl font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed shrink-0 shadow-md hover:scale-105"
            title="Send Message"
          >
            {assistantState === 'thinking' ? (
              <Loader2 className="w-4 h-4 animate-spin text-black" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
