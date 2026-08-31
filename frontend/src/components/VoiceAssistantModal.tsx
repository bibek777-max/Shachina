import React, { useState, useEffect, useRef, useCallback } from 'react';
import { voiceEngine } from '../services/voiceEngine';
import { api } from '../services/api';
import { X, Mic, MicOff, Sparkles, Volume2, VolumeX, Square, Send, Loader2 } from 'lucide-react';

interface VoiceAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSymbol: string;
  selectedMarket?: string;
}

interface Message {
  id: string;
  role: 'user' | 'shachina';
  text: string;
  speechText?: string;
  timestamp: string;
  language?: string;
}

type Lang = 'ne' | 'en' | 'hi';

export const VoiceAssistantModal: React.FC<VoiceAssistantModalProps> = ({
  isOpen, onClose, selectedSymbol, selectedMarket = 'NEPSE',
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState('');
  const [interimText, setInterimText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [language, setLanguage] = useState<Lang>('ne');
  const [micAmplitude, setMicAmplitude] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [speechBars, setSpeechBars] = useState<number[]>([20, 20, 20, 20, 20, 20, 20, 20]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | null>(null);

  const addMessage = useCallback((role: 'user' | 'shachina', text: string, speechText?: string, lang?: string): Message => {
    const msg: Message = {
      id: Date.now().toString(),
      role,
      text,
      speechText,
      timestamp: new Date().toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' }),
      language: lang,
    };
    setMessages((prev) => [...prev, msg]);
    return msg;
  }, []);

  // Animate waveform bars
  useEffect(() => {
    if (isSpeaking || isListening) {
      const animate = () => {
        if (isListening && micAmplitude > 0) {
          setSpeechBars(Array.from({ length: 8 }, (_, i) =>
            Math.max(10, Math.min(100, micAmplitude + Math.sin(Date.now() / 180 + i) * 25))
          ));
        } else if (isSpeaking) {
          setSpeechBars(Array.from({ length: 8 }, () => 15 + Math.random() * 80));
        }
        animRef.current = requestAnimationFrame(animate);
      };
      animRef.current = requestAnimationFrame(animate);
    } else {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      setSpeechBars([15, 30, 15, 45, 15, 30, 20, 25]);
    }
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [isSpeaking, isListening, micAmplitude]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, interimText]);

  // Greeting on open
  useEffect(() => {
    if (!isOpen) {
      voiceEngine.stop();
      voiceEngine.stopListening();
      setIsListening(false); setIsSpeaking(false); setInterimText('');
      return;
    }
    setMessages([]);
    const greetings: Record<Lang, { text: string; speech: string }> = {
      ne: {
        text: `नमस्ते! म Shachina हुँ — तपाईंको AI trading assistant। माइक्रोफोन थिचेर बोल्नुहोस् वा टाइप गर्नुहोस्।`,
        speech: `नमस्ते! म Shachina हुँ। माइक्रोफोन थिचेर बोल्नुहोस्।`,
      },
      en: {
        text: `Hello! I am Shachina, your AI personal trading assistant. Press the microphone to speak, or type below.`,
        speech: `Hello! I am Shachina. Press the microphone to speak to me.`,
      },
      hi: {
        text: `नमस्ते! मैं Shachina हूँ — आपकी AI trading assistant। माइक्रोफोन दबाएँ और बोलें।`,
        speech: `नमस्ते! मैं Shachina हूँ। माइक्रोफोन दबाएँ।`,
      },
    };
    const g = greetings[language];
    addMessage('shachina', g.text, g.speech, language);
    if (!isMuted) {
      setTimeout(() => {
        voiceEngine.speak(g.speech, language, () => setIsSpeaking(true), () => setIsSpeaking(false));
      }, 400);
    }
  }, [isOpen, language]);

  const speakText = (text: string, lang: string = language) => {
    if (isMuted) return;
    voiceEngine.stop();
    voiceEngine.speak(text, lang, () => setIsSpeaking(true), () => setIsSpeaking(false));
  };

  const stopSpeaking = () => { voiceEngine.stop(); setIsSpeaking(false); };

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    voiceEngine.isMuted = next;
    if (next) { voiceEngine.stop(); setIsSpeaking(false); }
  };

  const handleSend = async (textOverride?: string) => {
    const text = (textOverride || query).trim();
    if (!text || isProcessing) return;
    addMessage('user', text, undefined, language);
    setQuery('');
    setInterimText('');
    setIsProcessing(true);
    stopSpeaking();
    try {
      const result = await api.askAssistant(text, selectedSymbol, selectedMarket, language);
      addMessage('shachina', result.response, result.speech_text, result.language);
      if (!isMuted) speakText(result.speech_text || result.response, result.language || language);
    } catch {
      const fallback = language === 'ne'
        ? `माफ गर्नुहोस्, अहिले जवाफ दिन सकिएन। नेटवर्क जाँच गर्नुहोस्।`
        : `Sorry, I couldn't process that right now. Please check your connection.`;
      addMessage('shachina', fallback, fallback, language);
      if (!isMuted) speakText(fallback, language);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleMic = async () => {
    if (isListening) {
      voiceEngine.stopListening();
      setIsListening(false); setMicAmplitude(0); setInterimText('');
      return;
    }
    setMicError(null);
    stopSpeaking();
    const granted = await voiceEngine.startMicrophoneWithVisualizer((level) => setMicAmplitude(level));
    if (!granted) {
      setMicError('Microphone access denied. Please allow microphone in your browser settings.');
      return;
    }
    setIsListening(true);
    voiceEngine.listen(
      language,
      (interim) => setInterimText(interim),
      (final) => {
        setInterimText(''); setIsListening(false);
        voiceEngine.stopMicrophoneVisualizer(); setMicAmplitude(0);
        handleSend(final);
      },
      (err) => {
        setMicError(typeof err === 'string' ? err : 'Voice recognition error. Type instead.');
        setIsListening(false); voiceEngine.stopMicrophoneVisualizer(); setMicAmplitude(0);
      },
      () => { setIsListening(false); voiceEngine.stopMicrophoneVisualizer(); setMicAmplitude(0); }
    );
  };

  if (!isOpen) return null;

  const quickCmds = [
    language === 'ne' ? 'आज NEPSE scan गर।' : language === 'hi' ? 'NEPSE scan करो।' : 'Scan NEPSE today.',
    language === 'ne' ? `${selectedSymbol} analyze गर।` : language === 'hi' ? `${selectedSymbol} analyze करो।` : `Analyze ${selectedSymbol}`,
    language === 'ne' ? 'Setup किन WAIT छ?' : language === 'hi' ? 'Setup WAIT में क्यों?' : 'Why is setup WAIT?',
    language === 'ne' ? 'Bitcoin बजार हेर।' : language === 'hi' ? 'Bitcoin market दिखाओ।' : 'Check Bitcoin.',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="bg-[#0d1320] border-t sm:border border-[#1e2d44] sm:rounded-2xl w-full sm:max-w-lg flex flex-col shadow-2xl"
        style={{ height: '100dvh', maxHeight: '100dvh' }}>

        {/* HEADER */}
        <div className="shrink-0 flex items-center justify-between px-4 pt-10 sm:pt-4 pb-3 border-b border-[#1c2e48] bg-[#090e1a] sm:rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-400 via-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <span className="text-xl">🎙️</span>
              {isSpeaking && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#090e1a] animate-ping" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-white text-sm">SHACHINA</h3>
                <span className="text-[9px] bg-cyan-950 text-cyan-400 border border-cyan-800 px-1.5 py-0.5 rounded font-mono font-bold">VOICE AI</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold border ${isSpeaking ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : isListening ? 'bg-rose-950 text-rose-400 border-rose-800' : isProcessing ? 'bg-amber-950 text-amber-400 border-amber-800' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                  {isSpeaking ? '🔊 SPEAKING' : isListening ? '🔴 LISTENING' : isProcessing ? '⏳ THINKING' : 'READY'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono">
                Wake: <span className="text-cyan-300 font-bold">"HEY SHACHINA"</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-[#12192c] border border-[#1e2d44] rounded-lg p-0.5 gap-0.5">
              {(['ne', 'en', 'hi'] as Lang[]).map((l) => (
                <button key={l} onClick={() => setLanguage(l)}
                  className={`text-[10px] font-mono font-bold px-2 py-1 rounded transition-colors ${language === l ? 'bg-cyan-400 text-black' : 'text-slate-400 hover:text-white'}`}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <button onClick={handleToggleMute} className={`p-2 rounded-lg border transition-colors ${isMuted ? 'bg-rose-950 border-rose-700 text-rose-300' : 'bg-[#12192c] border-[#1e2d44] text-cyan-400 hover:text-white'}`}>
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* WAVEFORM VISUALIZER */}
        <div className="shrink-0 mx-4 mt-3 bg-[#080d18] border border-[#1a2840] rounded-xl px-4 py-2.5 flex items-center justify-between">
          <span className="text-xs font-mono font-semibold">
            {isListening ? <span className="text-rose-400">🔴 Listening to your voice...</span>
              : isSpeaking ? <span className="text-emerald-400">🔊 Shachina speaking...</span>
              : isProcessing ? <span className="text-amber-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Thinking...</span>
              : <span className="text-slate-500">Press mic or type to talk</span>}
          </span>
          <div className="flex items-end gap-0.5 h-7">
            {speechBars.map((h, i) => (
              <div key={i} className={`w-1.5 rounded-full transition-all duration-75 ${isSpeaking ? 'bg-cyan-400' : isListening ? 'bg-rose-500' : 'bg-slate-700'}`}
                style={{ height: `${Math.max(12, h)}%` }} />
            ))}
          </div>
        </div>

        {/* CHAT MESSAGES */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'shachina' && (
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-xs shrink-0 mr-2 mt-0.5 shadow">⚡</div>
              )}
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${msg.role === 'user' ? 'bg-cyan-500/20 border border-cyan-500/40 text-white rounded-tr-sm' : 'bg-[#141b2e] border border-[#1e2b42] text-slate-100 rounded-tl-sm'}`}>
                {msg.role === 'shachina' && (
                  <div className="flex items-center gap-1.5 mb-1.5 text-[10px] text-cyan-400 font-mono font-bold">
                    <Sparkles className="w-3 h-3" />SHACHINA
                    <span className="ml-auto text-slate-600 font-normal">{msg.timestamp}</span>
                  </div>
                )}
                <p className="whitespace-pre-line font-sans">{msg.text}</p>
                {msg.role === 'user' && <p className="text-[10px] text-slate-500 text-right mt-1">{msg.timestamp}</p>}
                {msg.role === 'shachina' && msg.speechText && (
                  <button onClick={() => isSpeaking ? stopSpeaking() : speakText(msg.speechText!, msg.language)}
                    className="mt-2 flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 font-mono">
                    {isSpeaking ? <Square className="w-2.5 h-2.5 fill-current" /> : <Volume2 className="w-2.5 h-2.5" />}
                    {isSpeaking ? 'Stop' : '▶ Replay'}
                  </button>
                )}
              </div>
            </div>
          ))}

          {interimText && (
            <div className="flex justify-end">
              <div className="bg-rose-950/60 border border-rose-600/40 rounded-2xl rounded-tr-sm px-3.5 py-2 text-xs text-rose-200 max-w-[85%] italic">
                🎤 {interimText}
              </div>
            </div>
          )}

          {isProcessing && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-xs shrink-0 mr-2 mt-0.5">⚡</div>
              <div className="bg-[#141b2e] border border-[#1e2b42] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                <div className="flex gap-1">
                  {[0,1,2].map((i) => <div key={i} className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}
                </div>
                <span className="text-xs text-slate-400 font-mono">Shachina thinking...</span>
              </div>
            </div>
          )}
        </div>

        {/* QUICK COMMANDS */}
        <div className="shrink-0 px-4 pb-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {quickCmds.map((cmd) => (
              <button key={cmd} onClick={() => handleSend(cmd)} disabled={isProcessing || isListening}
                className="bg-[#121829] hover:bg-[#1a2438] border border-[#1e2d44] hover:border-cyan-500/40 text-slate-300 text-[10px] px-2.5 py-1.5 rounded-lg font-mono whitespace-nowrap shrink-0 disabled:opacity-40 transition-all">
                "{cmd}"
              </button>
            ))}
          </div>
        </div>

        {/* ERROR BANNER */}
        {micError && (
          <div className="shrink-0 mx-4 mb-2 bg-rose-950/60 border border-rose-600/40 rounded-xl px-3 py-2 text-[11px] text-rose-300 font-mono flex items-start gap-2">
            <span className="flex-1">⚠️ {micError}</span>
            <button onClick={() => setMicError(null)} className="text-rose-400 hover:text-white font-bold shrink-0">✕</button>
          </div>
        )}

        {/* INPUT BAR */}
        <div className="shrink-0 flex items-center gap-2 px-4 pb-8 sm:pb-4 pt-2 border-t border-[#1c2e48] bg-[#090e1a] sm:rounded-b-2xl">
          <button onClick={handleToggleMic} disabled={isProcessing}
            className={`relative p-3.5 rounded-xl border-2 transition-all shrink-0 shadow-lg disabled:opacity-40 active:scale-95 ${isListening ? 'bg-rose-600 border-rose-400 text-white scale-110' : 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/30 hover:scale-105'}`}
            title={isListening ? 'Stop listening' : 'Tap to speak'}>
            {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            {isListening && <span className="absolute inset-0 rounded-xl border-2 border-rose-400 animate-ping opacity-50" />}
          </button>

          <input type="text" placeholder={isListening ? 'Listening...' : 'Type or tap mic to speak...'}
            value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            disabled={isListening}
            className="flex-1 bg-[#121829] border border-[#1e2d44] rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono transition-colors disabled:opacity-50" />

          <button onClick={() => handleSend()} disabled={(!query.trim() && !isListening) || isProcessing}
            className="p-3.5 bg-cyan-400 hover:bg-cyan-300 active:scale-95 text-black rounded-xl font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed shrink-0 shadow-md hover:scale-105">
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
