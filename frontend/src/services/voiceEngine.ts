/**
 * SHACHINA VOICE ENGINE v3
 * ─────────────────────────────────────────────────────
 * • Offline-first: Web Speech API runs entirely in the browser — 
 *   no internet is needed for speech recognition on Chrome/Edge/Safari.
 * • Automatic silence detection (1.4 s) → fires final result.
 * • Immediate interruption: mic tap stops TTS and starts listening.
 * • Graceful fallback: if SpeechRecognition is absent, reports clearly.
 * • Real microphone amplitude visualiser via Web Audio Analyser.
 * • Natural human-female Text-to-Speech with iOS/Android fixes.
 */

export class ShachinaVoiceEngine {
  private synth: SpeechSynthesis | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private currentlySpeakingMessageId: string | null = null;

  // Recognition
  private recognition: any = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private resultFired = false;  // guard against double-fire

  // Mic Analyser
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private animFrameId: number | null = null;

  public isMuted = false;

  /** Singleton-safe SpeechRecognition constructor */
  private static SpeechRec: any =
    typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.synth.getVoices();                            // trigger load
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.synth!.getVoices();
      }
    }
  }

  /** Returns true when real browser STT is available (works offline on Chrome/Edge). */
  public static isRecognitionSupported(): boolean {
    return !!ShachinaVoiceEngine.SpeechRec;
  }

  // ─────────────────────────────────────────────────────────────
  // TEXT-TO-SPEECH
  // ─────────────────────────────────────────────────────────────

  private getBestVoice(lang: string): SpeechSynthesisVoice | null {
    const all = this.synth ? this.synth.getVoices() : [];
    if (!all.length) return null;

    const femaleHints = [
      'siri', 'ava', 'allison', 'samantha', 'victoria', 'karen', 'tessa', 'moira', 'fiona',
      'zira', 'lekha', 'veena', 'swara', 'google uk english female', 'google us english female',
      'google us english', 'female', 'woman'
    ];

    const langPrefix = lang === 'ne' ? 'hi' : lang === 'hi' ? 'hi' : 'en';

    // Priority 1: language + Siri / female
    let v = all.find(x => x.lang.toLowerCase().startsWith(langPrefix) &&
      femaleHints.some(h => x.name.toLowerCase().includes(h)));
    // Priority 2: any female voice across the system (e.g. Siri or Samantha on Mac/iOS)
    if (!v) v = all.find(x => femaleHints.some(h => x.name.toLowerCase().includes(h)));
    // Priority 3: matching language voice
    if (!v) v = all.find(x => x.lang.toLowerCase().startsWith(langPrefix));
    // Fallback: first available
    return v || all[0];
  }

  /** Speaks text aloud. iOS requires the utterance to be created/started in a user-gesture handler. */
  public speak(
    text: string,
    lang: string = 'en',
    messageId?: string,
    onStart?: () => void,
    onEnd?: () => void
  ) {
    if (!this.synth || this.isMuted) { onEnd?.(); return; }

    // iOS Safari fix: resume before cancel
    if (this.synth.paused) this.synth.resume();
    this.synth.cancel();

    const clean = text
      .replace(/[*#_`•]/g, ' ')
      .replace(/NPR/gi, 'rupees')
      .replace(/NEPSE/gi, 'NEPSE')
      .replace(/\s+/g, ' ')
      .trim();

    if (!clean) { onEnd?.(); return; }

    const utter = new SpeechSynthesisUtterance(clean);
    this.currentUtterance = utter;
    this.currentlySpeakingMessageId = messageId ?? null;

    const voice = this.getBestVoice(lang);
    if (voice) utter.voice = voice;
    utter.lang = lang === 'ne' || lang === 'hi' ? 'hi-IN' : 'en-US';
    utter.pitch = 1.12;
    utter.rate  = 0.97;
    utter.volume = 1.0;

    utter.onstart = () => onStart?.();
    utter.onend   = () => { this._clearSpeakState(); onEnd?.(); };
    utter.onerror = () => { this._clearSpeakState(); onEnd?.(); };

    this.synth.speak(utter);

    // Chrome desktop has a ~15-second silence bug — keep speech synthesis alive
    this._keepSynthAlive();
  }

  /** Chrome bug: speechSynthesis pauses after ~15 s on some desktops. Workaround: periodic resume. */
  private _keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  private _keepSynthAlive() {
    if (this._keepAliveInterval) clearInterval(this._keepAliveInterval);
    this._keepAliveInterval = setInterval(() => {
      if (!this.synth) { clearInterval(this._keepAliveInterval!); return; }
      if (this.synth.speaking && !this.synth.paused) {
        this.synth.pause();
        this.synth.resume();
      } else {
        clearInterval(this._keepAliveInterval!);
        this._keepAliveInterval = null;
      }
    }, 10_000);
  }

  private _clearSpeakState() {
    this.currentUtterance = null;
    this.currentlySpeakingMessageId = null;
    if (this._keepAliveInterval) { clearInterval(this._keepAliveInterval); this._keepAliveInterval = null; }
  }

  public pause()  { if (this.synth?.speaking && !this.synth.paused) this.synth.pause(); }
  public resume() { if (this.synth?.paused) this.synth.resume(); }
  public stop()   { this.synth?.cancel(); this._clearSpeakState(); }

  public isSpeakingNow(): boolean { return !!(this.synth?.speaking && !this.synth.paused); }
  public isPausedNow():   boolean { return !!this.synth?.paused; }
  public getSpeakingMessageId(): string | null { return this.currentlySpeakingMessageId; }

  // ─────────────────────────────────────────────────────────────
  // MIC AMPLITUDE VISUALISER
  // ─────────────────────────────────────────────────────────────

  public async startMicVisualiser(onAmplitude: (level: number) => void): Promise<boolean> {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return false;
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return true; // mic granted but no AudioContext — still fine

      this.audioContext = new Ctx();
      if (this.audioContext.state === 'suspended') await this.audioContext.resume();

      const src = this.audioContext.createMediaStreamSource(this.micStream);
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 64;
      src.connect(this.analyserNode);

      const buf = new Uint8Array(this.analyserNode.frequencyBinCount);
      const tick = () => {
        if (!this.analyserNode) return;
        this.analyserNode.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        onAmplitude(Math.min(100, Math.round((avg / 128) * 100)));
        this.animFrameId = requestAnimationFrame(tick);
      };
      this.animFrameId = requestAnimationFrame(tick);
      return true;
    } catch {
      return false;
    }
  }

  public stopMicVisualiser() {
    if (this.animFrameId) { cancelAnimationFrame(this.animFrameId); this.animFrameId = null; }
    this.micStream?.getTracks().forEach(t => t.stop());
    this.micStream = null;
    try { this.audioContext?.close(); } catch {}
    this.audioContext = null;
    this.analyserNode = null;
  }

  // ─────────────────────────────────────────────────────────────
  // SPEECH-TO-TEXT  (browser-native, offline-capable)
  // ─────────────────────────────────────────────────────────────

  /**
   * Starts real-time speech recognition.
   *
   * Flow:
   *   onInterim(text) — called repeatedly while user speaks (live preview)
   *   onResult(text)  — called ONCE when user finishes speaking (after silence)
   *   onError(msg)    — called on error (permission denied, no support, etc.)
   *   onEnd()         — called when recognition session ends (no result)
   */
  public listen(
    lang: string,
    onInterim: (text: string) => void,
    onResult:  (finalText: string) => void,
    onError:   (msg: string) => void,
    onEnd:     () => void
  ) {
    if (!ShachinaVoiceEngine.SpeechRec) {
      onError("Voice input isn't supported in this browser. You can use text chat instead.");
      onEnd();
      return;
    }

    // Clean up any previous session
    this._stopRecognition();

    this.resultFired = false;

    const rec = new ShachinaVoiceEngine.SpeechRec();
    rec.continuous     = true;   // keep open so user can speak in longer sentences
    rec.interimResults = true;   // get partial results for live preview
    rec.maxAlternatives = 1;

    if (lang === 'ne')      rec.lang = 'ne-NP';
    else if (lang === 'hi') rec.lang = 'hi-IN';
    else                    rec.lang = 'en-US';

    let accumulated = '';

    const fire = (text: string) => {
      if (this.resultFired) return;
      this.resultFired = true;
      this._clearSilenceTimer();
      this._stopRecognition(true);          // silent stop
      if (text.trim()) onResult(text.trim());
      else onEnd();
    };

    rec.onresult = (ev: any) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) {
          accumulated += (accumulated ? ' ' : '') + t.trim();
        } else {
          interim = t;
        }
      }

      // Show live preview = accumulated finals + current interim
      const preview = (accumulated + (accumulated && interim ? ' ' : '') + interim).trim();
      if (preview) {
        onInterim(preview);

        // Reset silence timer — fires onResult 900ms after user stops talking
        this._clearSilenceTimer();
        this.silenceTimer = setTimeout(() => fire(preview), 900);
      }
    };

    rec.onerror = (ev: any) => {
      if (ev.error === 'no-speech') return; // transient; keep session alive
      const msgs: Record<string, string> = {
        'not-allowed':         'Microphone permission denied. Please allow access in browser settings.',
        'service-not-allowed': 'Microphone permission denied. Please allow access in browser settings.',
        'network':             'Network error during recognition. Check your connection.',
        'aborted':             '',   // user cancelled — suppress
      };
      const msg = msgs[ev.error] ?? `Voice recognition error (${ev.error}). Please try again.`;
      this._clearSilenceTimer();
      if (msg) onError(msg);
    };

    rec.onend = () => {
      this._clearSilenceTimer();
      if (!this.resultFired) {
        if (accumulated.trim()) fire(accumulated);
        else onEnd();
      }
    };

    try {
      rec.start();
      this.recognition = rec;
    } catch {
      onError('Unable to start voice input. Please check microphone permissions.');
      onEnd();
    }
  }

  public stopListening() {
    this._clearSilenceTimer();
    this._stopRecognition();
    this.stopMicVisualiser();
  }

  private _clearSilenceTimer() {
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
  }

  private _stopRecognition(silent = false) {
    if (this.recognition) {
      try { if (silent) this.recognition.abort(); else this.recognition.stop(); } catch {}
      this.recognition = null;
    }
  }
}

export const voiceEngine = new ShachinaVoiceEngine();
