/**
 * SHACHINA VOICE ENGINE
 * Natural, Calm, Human-like Female Voice Synthesis, Live Microphone Audio Capture & Web Audio Waveform.
 */

export class ShachinaVoiceEngine {
  private synth: SpeechSynthesis | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private selectedVoice: SpeechSynthesisVoice | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private recognition: any = null;
  public isMuted: boolean = false;

  // Web Audio Context for Live Mic Amplitude
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private animFrameId: number | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.loadVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.loadVoices();
      }
    }
  }

  private loadVoices() {
    if (!this.synth) return;
    this.voices = this.synth.getVoices();
    this.selectBestFemaleVoice();
  }

  /**
   * Selects the highest quality natural human female voice.
   */
  public selectBestFemaleVoice(preferredLang: string = 'ne'): SpeechSynthesisVoice | null {
    if (!this.voices || this.voices.length === 0) return null;

    const femaleKeywords = [
      'samantha',
      'victoria',
      'karen',
      'tessa',
      'moira',
      'fiona',
      'zira',
      'lekha',
      'veena',
      'google uk english female',
      'google us english female',
      'google us english',
      'google हिन्दी',
      'female',
      'woman',
    ];

    // 1. Language matched female voice
    let match = this.voices.find((v) => {
      const name = v.name.toLowerCase();
      const lang = v.lang.toLowerCase();
      const matchesLang = lang.startsWith(preferredLang.toLowerCase());
      const isFemale = femaleKeywords.some((kw) => name.includes(kw));
      return matchesLang && isFemale;
    });

    // 2. High quality natural English/South Asian female voice
    if (!match) {
      match = this.voices.find((v) => {
        const name = v.name.toLowerCase();
        return femaleKeywords.some((kw) => name.includes(kw));
      });
    }

    // 3. Fallback
    this.selectedVoice = match || this.voices[0] || null;
    return this.selectedVoice;
  }

  /**
   * Speaks text using Shachina's calm, pleasant human female voice persona.
   */
  public speak(
    text: string,
    lang: string = 'ne',
    onStart?: () => void,
    onEnd?: () => void
  ) {
    if (typeof window === 'undefined' || !this.synth || this.isMuted) {
      if (onEnd) onEnd();
      return;
    }

    // Resume synth if paused/suspended by browser
    if (this.synth.paused) {
      this.synth.resume();
    }

    // Stop previous utterance
    this.synth.cancel();

    // Clean formatting for natural human speech flow
    const cleanText = text
      .replace(/[*#_`•]/g, ' ')
      .replace(/NPR/gi, ' रुपैयाँ ')
      .replace(/NEPSE/gi, 'नेप्से')
      .replace(/NABIL/gi, 'नबिल')
      .replace(/SHIVM/gi, 'शिवम')
      .replace(/UPPER/gi, 'अपर')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) {
      if (onEnd) onEnd();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    this.currentUtterance = utterance; // Prevent garbage collection mid-speech

    const voice = this.selectBestFemaleVoice(lang);
    if (voice) {
      utterance.voice = voice;
    }

    // Human female acoustic calibration:
    utterance.pitch = 1.12;
    utterance.rate = 0.98;
    utterance.volume = 1.0;

    if (lang === 'ne' || lang === 'hi') {
      utterance.lang = 'hi-IN';
    } else {
      utterance.lang = 'en-US';
    }

    utterance.onstart = () => {
      if (onStart) onStart();
    };

    utterance.onend = () => {
      this.currentUtterance = null;
      if (onEnd) onEnd();
    };

    utterance.onerror = () => {
      this.currentUtterance = null;
      if (onEnd) onEnd();
    };

    this.synth.speak(utterance);
  }

  public stop() {
    if (this.synth) {
      this.synth.cancel();
    }
    this.currentUtterance = null;
  }

  public isSpeaking(): boolean {
    return this.synth ? this.synth.speaking : false;
  }

  /**
   * Requests real microphone permission and connects Web Audio Analyser for live volume meter.
   */
  public async startMicrophoneWithVisualizer(
    onAmplitude: (level: number) => void
  ): Promise<boolean> {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          this.audioContext = new AudioCtx();
          if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
          }
          const source = this.audioContext.createMediaStreamSource(this.micStream);
          this.analyserNode = this.audioContext.createAnalyser();
          this.analyserNode.fftSize = 64;
          source.connect(this.analyserNode);

          const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
          
          const updateMeter = () => {
            if (!this.analyserNode) return;
            this.analyserNode.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            const normalized = Math.min(100, Math.round((avg / 128) * 100));
            onAmplitude(normalized);
            this.animFrameId = requestAnimationFrame(updateMeter);
          };

          updateMeter();
        }
        return true;
      }
      return false;
    } catch (err) {
      console.warn('Microphone access not granted or unavailable:', err);
      return false;
    }
  }

  public stopMicrophoneVisualizer() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (_) {}
      this.audioContext = null;
    }
  }

  /**
   * Listens to owner/user speech and returns real transcript.
   */
  public listen(
    lang: string = 'ne',
    onInterim: (text: string) => void,
    onResult: (finalText: string) => void,
    onError: (err: any) => void,
    onEnd: () => void
  ) {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      onError('Speech recognition not supported in this browser. Please use Chrome, Edge, or Safari, or type your query.');
      onEnd();
      return;
    }

    try {
      this.stop(); // Stop audio playback before listening
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = true;

      if (lang === 'ne') {
        rec.lang = 'ne-NP';
      } else if (lang === 'hi') {
        rec.lang = 'hi-IN';
      } else {
        rec.lang = 'en-US';
      }

      rec.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        if (interim) onInterim(interim);
        if (final) onResult(final);
      };

      rec.onerror = (event: any) => {
        onError(event.error || 'Voice recognition error');
      };

      rec.onend = () => {
        onEnd();
      };

      rec.start();
      this.recognition = rec;
    } catch (e) {
      onError(e);
      onEnd();
    }
  }

  public stopListening() {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (_) {}
      this.recognition = null;
    }
    this.stopMicrophoneVisualizer();
  }
}

export const voiceEngine = new ShachinaVoiceEngine();
