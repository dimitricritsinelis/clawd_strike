const AK47_CLOSE_BASENAME = "/assets/audio/weapons/ak47/fire_close_01";
const AK47_TAIL_BASENAME = "/assets/audio/weapons/ak47/fire_tail_01";
const AUDIO_EXTENSIONS = [".ogg", ".mp3", ".wav"] as const;
const FALLBACK_NOISE_SECONDS = 0.22;

type LoadedLayer = {
  buffer: AudioBuffer | null;
  resolvedUrl: string | null;
  triedUrls: string[];
};

function createDriveCurve(samples: number): Float32Array {
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 1.35);
  }
  return curve;
}

const DRIVE_CURVE = createDriveCurve(512);

export class WeaponAudio {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;

  private closeBuffer: AudioBuffer | null = null;
  private tailBuffer: AudioBuffer | null = null;
  private fallbackNoiseBuffer: AudioBuffer | null = null;

  private loadPromise: Promise<void> | null = null;
  private didLogMissingAssetWarning = false;
  private variationState = 0x12345678;

  ensureResumedFromGesture(): void {
    const ctx = this.ensureAudioGraph();
    if (!ctx) return;

    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    this.ensureBuffersLoaded();
  }

  playAk47Shot(): void {
    const ctx = this.ensureAudioGraph();
    if (!ctx || !this.masterGain || !this.compressor) return;

    this.ensureBuffersLoaded();

    if (ctx.state === "suspended") {
      return;
    }

    const now = ctx.currentTime;

    if (this.closeBuffer) {
      this.playBuffer(this.closeBuffer, now, this.randRange(0.985, 1.015), this.randRange(0.78, 0.9));
    } else {
      this.playFallbackCrack(now);
    }

    if (this.tailBuffer) {
      this.playBuffer(
        this.tailBuffer,
        now + this.randRange(0.012, 0.024),
        this.randRange(0.99, 1.01),
        this.randRange(0.36, 0.52),
      );
    }
  }

  dispose(): void {
    this.loadPromise = null;
    this.closeBuffer = null;
    this.tailBuffer = null;
    this.fallbackNoiseBuffer = null;

    this.masterGain?.disconnect();
    this.compressor?.disconnect();

    this.masterGain = null;
    this.compressor = null;

    if (this.audioContext) {
      const ctx = this.audioContext;
      this.audioContext = null;
      void ctx.close();
    }
  }

  private ensureAudioGraph(): AudioContext | null {
    if (this.audioContext && this.masterGain && this.compressor) {
      return this.audioContext;
    }

    const AudioContextCtor =
      window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }

    const ctx = new AudioContextCtor();

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 14;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.09;

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.1;

    compressor.connect(masterGain);
    masterGain.connect(ctx.destination);

    this.audioContext = ctx;
    this.compressor = compressor;
    this.masterGain = masterGain;
    return ctx;
  }

  private ensureBuffersLoaded(): void {
    if (this.loadPromise) return;

    const ctx = this.audioContext;
    if (!ctx) return;

    this.loadPromise = (async () => {
      const [closeLayer, tailLayer] = await Promise.all([
        this.loadLayerWithExtensions(ctx, AK47_CLOSE_BASENAME),
        this.loadLayerWithExtensions(ctx, AK47_TAIL_BASENAME),
      ]);

      this.closeBuffer = closeLayer.buffer;
      this.tailBuffer = tailLayer.buffer;

      if (!this.didLogMissingAssetWarning && !closeLayer.buffer) {
        console.warn(
          `[WeaponAudio] missing close-layer weapon audio assets (${closeLayer.triedUrls.join(", ")}). ` +
            "Using synthesized fallback for close shot.",
        );
        this.didLogMissingAssetWarning = true;
      }
    })().catch((error: unknown) => {
      if (!this.didLogMissingAssetWarning) {
        this.didLogMissingAssetWarning = true;
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[WeaponAudio] failed loading weapon audio, using fallback: ${message}`);
      }
    });
  }

  private async loadLayerWithExtensions(ctx: AudioContext, baseUrl: string): Promise<LoadedLayer> {
    const triedUrls: string[] = [];

    for (const ext of AUDIO_EXTENSIONS) {
      const url = `${baseUrl}${ext}`;
      triedUrls.push(url);

      try {
        const response = await fetch(url);
        if (!response.ok) {
          continue;
        }

        const encoded = await response.arrayBuffer();
        if (encoded.byteLength === 0) {
          continue;
        }

        const decoded = await ctx.decodeAudioData(encoded.slice(0));
        return {
          buffer: decoded,
          resolvedUrl: url,
          triedUrls,
        };
      } catch {
        // Try next extension.
      }
    }

    return {
      buffer: null,
      resolvedUrl: null,
      triedUrls,
    };
  }

  private playBuffer(buffer: AudioBuffer, startTime: number, playbackRate: number, gain: number): void {
    if (!this.audioContext || !this.compressor) return;

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;

    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = gain;

    const highpass = this.audioContext.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 60;
    highpass.Q.value = 0.7;

    const lowShelf = this.audioContext.createBiquadFilter();
    lowShelf.type = "lowshelf";
    lowShelf.frequency.value = 120;
    lowShelf.gain.value = this.randRange(3.5, 5.5);

    const highShelf = this.audioContext.createBiquadFilter();
    highShelf.type = "highshelf";
    highShelf.frequency.value = this.randRange(3500, 4800);
    highShelf.gain.value = this.randRange(1.2, 2.8);

    const drive = this.audioContext.createWaveShaper();
    drive.curve = new Float32Array(DRIVE_CURVE);
    drive.oversample = "2x";

    source.connect(gainNode);
    gainNode.connect(highpass);
    highpass.connect(lowShelf);
    lowShelf.connect(highShelf);
    highShelf.connect(drive);
    drive.connect(this.compressor);

    source.start(startTime);
    source.onended = () => {
      source.disconnect();
      gainNode.disconnect();
      highpass.disconnect();
      lowShelf.disconnect();
      highShelf.disconnect();
      drive.disconnect();
    };
  }

  private playFallbackCrack(startTime: number): void {
    if (!this.audioContext || !this.compressor) return;

    if (!this.fallbackNoiseBuffer) {
      this.fallbackNoiseBuffer = this.createNoiseBuffer(this.audioContext, FALLBACK_NOISE_SECONDS);
    }

    this.playFallbackTransientLayer(startTime);
    this.playFallbackBodyLayer(startTime);
    this.playFallbackTailLayer(startTime + this.randRange(0.01, 0.02));
  }

  private playFallbackTransientLayer(startTime: number): void {
    if (!this.audioContext || !this.compressor || !this.fallbackNoiseBuffer) return;

    const source = this.audioContext.createBufferSource();
    source.buffer = this.fallbackNoiseBuffer;
    source.playbackRate.value = this.randRange(1.0, 1.3);

    const highpass = this.audioContext.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = this.randRange(1800, 2400);
    highpass.Q.value = 0.8;

    const gainNode = this.audioContext.createGain();
    const attack = 0.001;
    const decay = this.randRange(0.05, 0.072);

    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(this.randRange(0.85, 1.05), startTime + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + decay);

    source.connect(highpass);
    highpass.connect(gainNode);
    gainNode.connect(this.compressor);

    source.start(startTime);
    source.stop(startTime + decay + 0.02);
    source.onended = () => {
      source.disconnect();
      highpass.disconnect();
      gainNode.disconnect();
    };
  }

  private playFallbackBodyLayer(startTime: number): void {
    if (!this.audioContext || !this.compressor) return;

    const osc = this.audioContext.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(this.randRange(220, 280), startTime);
    osc.frequency.exponentialRampToValueAtTime(this.randRange(95, 120), startTime + 0.095);

    const lowpass = this.audioContext.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 900;
    lowpass.Q.value = 0.6;

    const gainNode = this.audioContext.createGain();
    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(this.randRange(0.26, 0.38), startTime + 0.004);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.11);

    osc.connect(lowpass);
    lowpass.connect(gainNode);
    gainNode.connect(this.compressor);

    osc.start(startTime);
    osc.stop(startTime + 0.12);
    osc.onended = () => {
      osc.disconnect();
      lowpass.disconnect();
      gainNode.disconnect();
    };
  }

  private playFallbackTailLayer(startTime: number): void {
    if (!this.audioContext || !this.compressor || !this.fallbackNoiseBuffer) return;

    const source = this.audioContext.createBufferSource();
    source.buffer = this.fallbackNoiseBuffer;
    source.playbackRate.value = this.randRange(0.72, 0.88);

    const bandpass = this.audioContext.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = this.randRange(680, 940);
    bandpass.Q.value = 0.8;

    const gainNode = this.audioContext.createGain();
    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(this.randRange(0.08, 0.12), startTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.16);

    source.connect(bandpass);
    bandpass.connect(gainNode);
    gainNode.connect(this.compressor);

    source.start(startTime);
    source.stop(startTime + 0.17);
    source.onended = () => {
      source.disconnect();
      bandpass.disconnect();
      gainNode.disconnect();
    };
  }

  private createNoiseBuffer(ctx: AudioContext, durationSeconds: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const frameCount = Math.max(1, Math.floor(durationSeconds * sampleRate));
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const channel = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i += 1) {
      channel[i] = this.randRange(-1, 1);
    }

    return buffer;
  }

  private randRange(min: number, max: number): number {
    this.variationState = (Math.imul(this.variationState, 1664525) + 1013904223) >>> 0;
    const normalized = this.variationState / 0x1_0000_0000;
    return min + (max - min) * normalized;
  }
}
