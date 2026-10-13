export class ShowreelAudioSynth {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private beatGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;
  private adest: MediaStreamAudioDestinationNode | null = null;
  private nbuf: AudioBuffer | null = null;
  private muted = false;
  private voiceEnabled = true;
  private isVoiceSpeakingFlag = false;
  private currentVoiceSceneIdx = -1;
  private voiceEndTime = 0;
  private voiceMinEndTime = 0;
  private voiceGraceEndTime = 0;
  private isAudioBufferPlaying = false;
  private isUtterancePlaying = false;
  private isLoadingAudio = false;
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private activeVoiceSource: AudioBufferSourceNode | null = null;
  private decodedCache = new Map<string, AudioBuffer>();

  public init() {
    if (this.ac) return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ac = new AudioCtx();
    this.master = this.ac.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;

    this.beatGain = this.ac.createGain();
    this.beatGain.gain.value = 0.32; // Batida mais suave para destacar a voz narradora

    this.voiceGain = this.ac.createGain();
    this.voiceGain.gain.value = 1.0;

    this.adest = this.ac.createMediaStreamDestination();
    this.beatGain.connect(this.master);
    this.voiceGain.connect(this.master);
    this.master.connect(this.ac.destination);
    this.master.connect(this.adest);

    this.nbuf = this.ac.createBuffer(1, this.ac.sampleRate, this.ac.sampleRate);
    const d = this.nbuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] = Math.random() * 2 - 1;
    }
  }

  public async resume() {
    this.init();
    if (this.ac && this.ac.state === 'suspended') {
      try {
        await Promise.race([
          this.ac.resume(),
          new Promise<void>((resolve) => setTimeout(resolve, 150)),
        ]);
      } catch {
        // Ignore autoplay restriction errors until user gesture
      }
    }
  }

  public setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ac) {
      this.master.gain.setValueAtTime(this.muted ? 0 : 0.9, this.ac.currentTime);
    }
    if (m) {
      this.stopVoice();
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setVoiceEnabled(v: boolean) {
    this.voiceEnabled = v;
    if (!v) {
      this.stopVoice();
    }
  }

  public isVoiceEnabled(): boolean {
    return this.voiceEnabled;
  }

  public isVoiceSpeaking(): boolean {
    if (!this.voiceEnabled || this.muted) return false;
    if (!this.isVoiceSpeakingFlag) return false;
    if (this.isLoadingAudio) return true;
    if (this.isAudioBufferPlaying && this.activeVoiceSource !== null) return true;
    if (
      this.isUtterancePlaying &&
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      window.speechSynthesis.speaking
    ) {
      return true;
    }
    const now = performance.now();
    return now < this.voiceGraceEndTime || now < this.voiceEndTime;
  }

  public isVoiceSpeakingForScene(idx: number): boolean {
    if (!this.voiceEnabled || this.muted) return false;
    if (!this.isVoiceSpeakingFlag) return false;
    if (this.currentVoiceSceneIdx !== idx) return false;

    // 1. Se ainda está decodificando ou carregando áudio da cena
    if (this.isLoadingAudio) return true;

    // 2. Se o buffer neural Web Audio (Gemini TTS) ainda estiver ativamente tocando
    if (this.isAudioBufferPlaying && this.activeVoiceSource !== null) return true;

    // 3. Se o sintetizador do navegador ainda estiver pronunciando palavras
    if (
      this.isUtterancePlaying &&
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      window.speechSynthesis.speaking
    ) {
      return true;
    }

    const now = performance.now();
    // 4. Margem de respiro de 450ms pós-fala (garante que a última palavra ressoe antes do corte)
    if (now < this.voiceGraceEndTime) return true;
    if (now < this.voiceEndTime) return true;
    if (now < this.voiceMinEndTime) return true;

    return false;
  }

  public stopVoice() {
    this.isVoiceSpeakingFlag = false;
    this.isLoadingAudio = false;
    this.isAudioBufferPlaying = false;
    this.isUtterancePlaying = false;
    this.currentVoiceSceneIdx = -1;
    this.voiceEndTime = 0;
    this.voiceMinEndTime = 0;
    this.voiceGraceEndTime = 0;
    if (this.activeVoiceSource) {
      try {
        this.activeVoiceSource.stop();
        this.activeVoiceSource.disconnect();
      } catch {
        // ignore
      }
      this.activeVoiceSource = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
      this.activeUtterance = null;
    }
  }

  public async decodeBase64Audio(
    base64Data: string,
    mimeType = 'audio/wav'
  ): Promise<AudioBuffer | null> {
    this.init();
    if (!this.ac || !base64Data) return null;

    const cacheKey = base64Data.slice(0, 64) + '_' + base64Data.length;
    const cached = this.decodedCache.get(cacheKey);
    if (cached) return cached;

    try {
      const binary = atob(base64Data);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      // Check if it has a RIFF/WAV header or standard encoded audio
      const isRiffWav =
        len > 44 &&
        bytes[0] === 0x52 && // 'R'
        bytes[1] === 0x49 && // 'I'
        bytes[2] === 0x46 && // 'F'
        bytes[3] === 0x46; // 'F'

      if (isRiffWav || (!mimeType.toLowerCase().includes('l16') && !mimeType.toLowerCase().includes('pcm'))) {
        try {
          const copyBuf = bytes.buffer.slice(0);
          const decoded = await this.ac.decodeAudioData(copyBuf);
          this.decodedCache.set(cacheKey, decoded);
          return decoded;
        } catch {
          // Fall through to raw L16 PCM 24kHz decoder if decodeAudioData fails
        }
      }

      // Raw 16-bit little-endian PCM at 24000 Hz (used by Gemini TTS L16 responses)
      const sampleRate = 24000;
      const numSamples = Math.floor(len / 2);
      const audioBuf = this.ac.createBuffer(1, numSamples, sampleRate);
      const channel = audioBuf.getChannelData(0);
      const view = new DataView(bytes.buffer);
      for (let i = 0; i < numSamples; i++) {
        const int16 = view.getInt16(i * 2, true);
        channel[i] = int16 / 32768;
      }
      this.decodedCache.set(cacheKey, audioBuf);
      return audioBuf;
    } catch {
      return null;
    }
  }

  public async decodeAudioDuration(
    base64Data: string,
    mimeType = 'audio/wav'
  ): Promise<number | null> {
    const buf = await this.decodeBase64Audio(base64Data, mimeType);
    return buf ? buf.duration : null;
  }

  public async speakScene(options: {
    text: string;
    sceneDuration: number;
    voiceAudioBase64?: string;
    voiceMimeType?: string;
    sceneIdx?: number;
    onEnd?: () => void;
  }) {
    if (this.muted || !this.voiceEnabled) return;
    const { text, sceneDuration, voiceAudioBase64, voiceMimeType, sceneIdx = -1, onEnd } = options;
    const cleanText = String(text || '').trim();
    if (!cleanText) return;

    this.stopVoice();
    this.init();

    this.currentVoiceSceneIdx = sceneIdx;
    this.isVoiceSpeakingFlag = true;
    this.isLoadingAudio = true;

    const wordsCount = cleanText.split(/\s+/).filter(Boolean).length;
    // Cadência humana de locução em português: ~1.95 palavras/segundo + 0.75s de respiração
    const estimatedSec = Math.max(2.8, (wordsCount / 1.95) + 0.75);
    const now = performance.now();
    this.voiceMinEndTime = now + (estimatedSec * 0.85) * 1000;
    this.voiceEndTime = now + estimatedSec * 1000;
    this.voiceGraceEndTime = this.voiceEndTime + 450;

    // 1. Se houver áudio neural da Gemini TTS para a cena, toca pelo AudioContext
    if (voiceAudioBase64 && this.ac && this.voiceGain) {
      const buf = await this.decodeBase64Audio(voiceAudioBase64, voiceMimeType);
      if (this.currentVoiceSceneIdx !== sceneIdx || !this.isVoiceSpeakingFlag) {
        this.isLoadingAudio = false;
        return;
      }

      if (buf && this.ac && this.voiceGain) {
        this.isLoadingAudio = false;
        const src = this.ac.createBufferSource();
        src.buffer = buf;
        // Reproduz na velocidade natural de fala 1.0 (ou leve ajuste se necessário)
        const rate = buf.duration > sceneDuration && sceneDuration > 1.2
          ? Math.min(1.06, Math.max(1.0, buf.duration / sceneDuration))
          : 1.0;
        src.playbackRate.value = rate;
        src.connect(this.voiceGain);
        this.activeVoiceSource = src;
        this.isAudioBufferPlaying = true;

        const durSec = buf.duration / rate;
        const playStart = performance.now();
        this.voiceEndTime = playStart + durSec * 1000;
        this.voiceMinEndTime = playStart + (durSec * 0.9) * 1000;
        this.voiceGraceEndTime = this.voiceEndTime + 450;

        src.onended = () => {
          if (this.activeVoiceSource === src) {
            this.activeVoiceSource = null;
            this.isAudioBufferPlaying = false;
            this.voiceGraceEndTime = performance.now() + 450;
            setTimeout(() => {
              if (this.currentVoiceSceneIdx === sceneIdx && !this.isAudioBufferPlaying) {
                this.isVoiceSpeakingFlag = false;
                onEnd?.();
              }
            }, 450);
          }
        };

        src.start(0);
        return;
      }
    }

    this.isLoadingAudio = false;

    // 2. Fallback humanizado de fala imediata via Web Speech API em Português
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(cleanText);
        utter.lang = 'pt-BR';
        utter.rate = 0.98; // Cadência humana articulada, pausada e sem pressa
        utter.pitch = 1.0;
        utter.volume = 1.0;

        this.isUtterancePlaying = true;
        this.voiceEndTime = performance.now() + estimatedSec * 1000;
        this.voiceGraceEndTime = this.voiceEndTime + 450;

        utter.onend = () => {
          this.isUtterancePlaying = false;
          this.voiceGraceEndTime = performance.now() + 450;
          setTimeout(() => {
            if (this.currentVoiceSceneIdx === sceneIdx && !this.isUtterancePlaying) {
              this.isVoiceSpeakingFlag = false;
              this.activeUtterance = null;
              onEnd?.();
            }
          }, 450);
        };

        utter.onerror = () => {
          this.isUtterancePlaying = false;
          this.isVoiceSpeakingFlag = false;
          this.activeUtterance = null;
        };

        const voices = window.speechSynthesis.getVoices();
        const ptVoice =
          voices.find(
            (v) =>
              v.lang.toLowerCase().includes('pt-br') &&
              (v.name.toLowerCase().includes('natural') ||
                v.name.toLowerCase().includes('neural') ||
                v.name.toLowerCase().includes('francisca') ||
                v.name.toLowerCase().includes('antonio') ||
                v.name.toLowerCase().includes('google') ||
                v.name.toLowerCase().includes('luciana') ||
                v.name.toLowerCase().includes('felipe'))
          ) || voices.find((v) => v.lang.toLowerCase().startsWith('pt'));
        if (ptVoice) {
          utter.voice = ptVoice;
        }
        this.activeUtterance = utter;
        window.speechSynthesis.speak(utter);
      } catch {
        this.isVoiceSpeakingFlag = false;
        this.isUtterancePlaying = false;
      }
    }
  }

  public getAudioTracks(): MediaStreamTrack[] {
    this.init();
    return this.adest ? this.adest.stream.getAudioTracks() : [];
  }

  public kick() {
    if (!this.ac || !this.beatGain || this.muted) return;
    const t = this.ac.currentTime;
    const o = this.ac.createOscillator();
    const g = this.ac.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.12);
    g.gain.setValueAtTime(0.85, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    o.connect(g);
    g.connect(this.beatGain);
    o.start(t);
    o.stop(t + 0.28);
  }

  public hat() {
    if (!this.ac || !this.beatGain || !this.nbuf || this.muted) return;
    const t = this.ac.currentTime;
    const s = this.ac.createBufferSource();
    const f = this.ac.createBiquadFilter();
    const g = this.ac.createGain();
    s.buffer = this.nbuf;
    f.type = 'highpass';
    f.frequency.value = 7000;
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    s.connect(f);
    s.connect(g);
    g.connect(this.beatGain);
    s.start(t, Math.random() * 0.5);
    s.stop(t + 0.06);
  }

  public whoosh() {
    if (!this.ac || !this.beatGain || !this.nbuf || this.muted) return;
    const t = this.ac.currentTime;
    const s = this.ac.createBufferSource();
    const f = this.ac.createBiquadFilter();
    const g = this.ac.createGain();
    s.buffer = this.nbuf;
    f.type = 'bandpass';
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(3200, t + 0.26);
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    s.connect(f);
    f.connect(g);
    g.connect(this.beatGain);
    s.start(t);
    s.stop(t + 0.34);
  }
}
