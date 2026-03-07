const AK47_CLOSE_BASENAME = "/assets/audio/weapons/ak47/fire_close_01";
const AK47_TAIL_BASENAME = "/assets/audio/weapons/ak47/fire_tail_01";
const AK47_RELOAD_BASENAME = "/assets/audio/weapons/ak47/reload";
const KILL_DING_BASENAME = "/assets/audio/ui/kill_ding";
// Prefer mp3 first: the deployed site ships mp3, and probing for ogg first creates noisy 404s in the console.
const AUDIO_EXTENSIONS = [".mp3", ".ogg", ".wav"] as const;
const FALLBACK_NOISE_SECONDS = 0.22;
const EVENT_NOISE_POOL_SIZE = 4;
const KILL_DING_TRIM_START_S = 0.26;
const PLAYER_RELOAD_AUDIO_TARGET_DURATION_S = 1.2;

export const AK47_AUDIO_TUNING = {
  player: {
    layerGainScale: 0.7,
    postGain: 0.1,
    transientAttackMs: 2.4,
    transientDrive: 1.1,
    lowShelfDb: 4.1,
    highShelfHz: 3800,
    highShelfDb: 0.85,
  },
  enemy: {
    layerGainScale: 0.7,
    postGain: 0.1,
    transientAttackMs: 3.1,
    transientDrive: 0.95,
    lowShelfDb: 3.9,
    highShelfHz: 3400,
    closeHighShelfDb: 0.45,
    farHighShelfDb: -2.6,
    distanceMinM: 8,
    distanceMaxM: 42,
    minGain: 0.28,
    closeLowpassHz: 18000,
    farLowpassHz: 1700,
  },
} as const;

type LoadedLayer = {
  buffer: AudioBuffer | null;
  resolvedUrl: string | null;
  triedUrls: string[];
};

export type EnemyAk47ShotOptions = {
  layerGainScale: number;
  distanceNorm: number;
};

type Ak47BufferPlaybackOptions = {
  destination?: AudioNode;
  attackSeconds?: number;
  lowShelfGainDb?: number;
  highShelfFrequencyHz?: number;
  highShelfGainDb?: number;
  driveCurve?: Float32Array;
  lowpassFrequencyHz?: number;
  offsetSeconds?: number;
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function createDriveCurve(samples: number, amount: number): Float32Array {
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount);
  }
  return curve;
}

const DRIVE_CURVE = createDriveCurve(512, 1.35);
const PLAYER_AK47_DRIVE_CURVE = createDriveCurve(512, AK47_AUDIO_TUNING.player.transientDrive);
const ENEMY_AK47_DRIVE_CURVE = createDriveCurve(512, AK47_AUDIO_TUNING.enemy.transientDrive);
const KILL_DING_DRIVE_CURVE = createDriveCurve(512, 1.05);

export class WeaponAudio {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private playerGunGain: GainNode | null = null;
  private enemyGunGain: GainNode | null = null;

  private closeBuffer: AudioBuffer | null = null;
  private tailBuffer: AudioBuffer | null = null;
  private reloadBuffer: AudioBuffer | null = null;
  private killDingBuffer: AudioBuffer | null = null;
  private fallbackNoiseBuffer: AudioBuffer | null = null;

  private loadPromise: Promise<void> | null = null;
  private didLogMissingAssetWarning = false;
  private variationState = 0x12345678;
  private hitThudNoisePool: AudioBuffer[] | null = null;
  private dryFireNoisePool: AudioBuffer[] | null = null;
  private reloadStartNoisePool: AudioBuffer[] | null = null;
  private reloadSnapNoisePool: AudioBuffer[] | null = null;
  private combatFeedbackWarmed = false;

  private footstepNoiseBuffer: AudioBuffer | null = null;
  private footstepAlt = false;
  private activeReloadSource: AudioBufferSourceNode | null = null;
  private activeReloadCleanup: (() => void) | null = null;

  // Ambient audio: low wind loop
  private ambientSource: AudioBufferSourceNode | null = null;
  private ambientGain: GainNode | null = null;
  private ambientRunning = false;

  ensureResumedFromGesture(): void {
    const ctx = this.ensureAudioGraph();
    if (!ctx) return;

    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    this.ensureBuffersLoaded();
    this.prewarmCombatFeedback();
  }

  prewarmCombatFeedback(): void {
    const ctx = this.ensureAudioGraph();
    if (!ctx || !this.compressor || this.combatFeedbackWarmed) return;

    this.combatFeedbackWarmed = true;
    if (!this.hitThudNoisePool) {
      this.hitThudNoisePool = this.buildNoisePool(ctx, 0.04);
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const highShelf = ctx.createBiquadFilter();
    highShelf.type = "highshelf";

    osc.connect(gain);
    gain.connect(highShelf);
    highShelf.connect(this.compressor);

    osc.disconnect();
    gain.disconnect();
    highShelf.disconnect();
  }

  playAk47Shot(): void {
    const ctx = this.ensureAudioGraph();
    if (!ctx || !this.masterGain || !this.compressor || !this.playerGunGain) return;
    const tuning = AK47_AUDIO_TUNING.player;

    this.ensureBuffersLoaded();

    if (ctx.state === "suspended") {
      return;
    }

    const now = ctx.currentTime;

    if (this.closeBuffer) {
      this.playBuffer(
        this.closeBuffer,
        now,
        this.randRange(0.985, 1.015),
        this.randRange(0.78, 0.9) * tuning.layerGainScale,
        {
          destination: this.playerGunGain,
          attackSeconds: tuning.transientAttackMs / 1000,
          lowShelfGainDb: tuning.lowShelfDb,
          highShelfFrequencyHz: tuning.highShelfHz,
          highShelfGainDb: tuning.highShelfDb,
          driveCurve: PLAYER_AK47_DRIVE_CURVE,
        },
      );
    } else {
      this.playFallbackCrack(now, tuning.layerGainScale, this.playerGunGain);
    }

    if (this.tailBuffer) {
      this.playBuffer(
        this.tailBuffer,
        now + this.randRange(0.012, 0.024),
        this.randRange(0.99, 1.01),
        this.randRange(0.36, 0.52) * tuning.layerGainScale,
        {
          destination: this.playerGunGain,
          attackSeconds: tuning.transientAttackMs / 1000,
          lowShelfGainDb: tuning.lowShelfDb,
          highShelfFrequencyHz: tuning.highShelfHz,
          highShelfGainDb: tuning.highShelfDb,
          driveCurve: PLAYER_AK47_DRIVE_CURVE,
        },
      );
    }
  }

  playAk47ShotQuiet(options: EnemyAk47ShotOptions): void {
    const ctx = this.ensureAudioGraph();
    if (!ctx || !this.masterGain || !this.compressor || !this.enemyGunGain) return;
    const tuning = AK47_AUDIO_TUNING.enemy;

    this.ensureBuffersLoaded();

    if (ctx.state === "suspended") return;

    const now = ctx.currentTime;
    const distanceNorm = clamp01(options.distanceNorm);
    const distanceGain = lerp(1, tuning.minGain, distanceNorm);
    const lowpassFrequencyHz = lerp(tuning.closeLowpassHz, tuning.farLowpassHz, distanceNorm);
    const highShelfGainDb = lerp(tuning.closeHighShelfDb, tuning.farHighShelfDb, distanceNorm);
    const g = Math.max(0, options.layerGainScale) * tuning.layerGainScale * distanceGain;

    if (this.closeBuffer) {
      this.playBuffer(
        this.closeBuffer,
        now,
        this.randRange(0.985, 1.015),
        this.randRange(0.78, 0.9) * g,
        {
          destination: this.enemyGunGain,
          attackSeconds: tuning.transientAttackMs / 1000,
          lowShelfGainDb: tuning.lowShelfDb,
          highShelfFrequencyHz: tuning.highShelfHz,
          highShelfGainDb,
          driveCurve: ENEMY_AK47_DRIVE_CURVE,
          lowpassFrequencyHz,
        },
      );
    }
    // No fallback for enemy shots — silence is fine if audio hasn't loaded yet

    if (this.tailBuffer) {
      this.playBuffer(
        this.tailBuffer,
        now + this.randRange(0.012, 0.024),
        this.randRange(0.99, 1.01),
        this.randRange(0.36, 0.52) * g,
        {
          destination: this.enemyGunGain,
          attackSeconds: tuning.transientAttackMs / 1000,
          lowShelfGainDb: tuning.lowShelfDb,
          highShelfFrequencyHz: tuning.highShelfHz,
          highShelfGainDb,
          driveCurve: ENEMY_AK47_DRIVE_CURVE,
          lowpassFrequencyHz,
        },
      );
    }
  }

  /**
   * Short soft thud played when a bullet hits an enemy (non-lethal).
   * Synthesized: noise burst bandpass-filtered to ~800-1200Hz (flesh impact zone),
   * with a brief 40ms envelope.
   */
  playHitThud(): void {
    const ctx = this.ensureAudioGraph();
    if (!ctx || !this.compressor) return;
    if (ctx.state === "suspended") return;

    const now = ctx.currentTime;
    const DURATION_S = 0.04;

    if (!this.hitThudNoisePool) {
      this.hitThudNoisePool = this.buildNoisePool(ctx, DURATION_S);
    }

    const source = ctx.createBufferSource();
    source.buffer = this.pickPooledNoise(this.hitThudNoisePool);

    // Bandpass: flesh impact sits ~900Hz
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = this.randRange(800, 1100);
    bp.Q.value = 1.8;

    // Short fast-attack envelope
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(this.randRange(0.28, 0.38), now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + DURATION_S);

    source.connect(bp);
    bp.connect(gain);
    gain.connect(this.compressor);

    source.start(now);
    source.stop(now + DURATION_S + 0.005);
    source.onended = () => {
      source.disconnect();
      bp.disconnect();
      gain.disconnect();
    };
  }

  /**
   * Kill-confirm cue played on a confirmed enemy kill.
   * Prefers the shipped sample and falls back to the older synthesized ding if the asset fails to load.
   */
  playKillDing(): void {
    const ctx = this.ensureAudioGraph();
    if (!ctx || !this.compressor) return;
    if (ctx.state === "suspended") return;

    const now = ctx.currentTime;
    if (this.killDingBuffer) {
      this.playBuffer(
        this.killDingBuffer,
        now,
        this.randRange(0.99, 1.01),
        1.2,
        {
          attackSeconds: 0,
          lowShelfGainDb: 0,
          highShelfFrequencyHz: 3400,
          highShelfGainDb: -1.5,
          driveCurve: KILL_DING_DRIVE_CURVE,
          lowpassFrequencyHz: 10000,
          offsetSeconds: KILL_DING_TRIM_START_S,
        },
      );
      return;
    }

    const FREQ = this.randRange(1180, 1260); // slight pitch variation
    const DURATION_S = 0.22;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(FREQ, now);
    // Slight pitch drop for a more organic feel
    osc.frequency.exponentialRampToValueAtTime(FREQ * 0.92, now + DURATION_S);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.55, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + DURATION_S);

    // High-shelf boost to make it bright and cut through
    const highShelf = ctx.createBiquadFilter();
    highShelf.type = "highshelf";
    highShelf.frequency.value = 3000;
    highShelf.gain.value = 4;

    osc.connect(gain);
    gain.connect(highShelf);
    highShelf.connect(this.compressor);

    osc.start(now);
    osc.stop(now + DURATION_S + 0.01);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      highShelf.disconnect();
    };
  }

  playFootstep(speedNorm: number): void {
    const ctx = this.ensureAudioGraph();
    if (!ctx || !this.compressor) return;
    if (ctx.state === "suspended") return;

    if (!this.footstepNoiseBuffer) {
      this.footstepNoiseBuffer = this.createNoiseBuffer(ctx, 0.12); // 120ms noise
    }

    const now = ctx.currentTime;
    const gain = this.randRange(0.18, 0.26) * Math.max(0.4, speedNorm);
    // Alternate L/R: right foot slightly higher pitch for natural walking feel
    const pitchShift = this.footstepAlt ? 1.0 : 0.88;
    this.footstepAlt = !this.footstepAlt;

    this.playFootstepBurst(now, gain, pitchShift);
  }

  /**
   * Heavy landing thud — played when the player hits the ground after a fall.
   * Louder and lower-pitched than a footstep.
   */
  playLanding(): void {
    const ctx = this.ensureAudioGraph();
    if (!ctx || !this.compressor) return;
    if (ctx.state === "suspended") return;

    if (!this.footstepNoiseBuffer) {
      this.footstepNoiseBuffer = this.createNoiseBuffer(ctx, 0.12);
    }

    const now = ctx.currentTime;
    // 2× louder than a run footstep, lower pitch for heavier impact
    this.playFootstepBurst(now, 0.55, 0.72);
    // Delayed secondary resonance for thick impact body
    this.playFootstepBurst(now + 0.018, 0.28, 0.58);
  }

  /**
   * Dry-fire click — played when trigger is pulled with an empty magazine.
   * Synthesized: short metallic click (highpass noise + triangle ping).
   */
  playDryFire(): void {
    const ctx = this.ensureAudioGraph();
    if (!ctx || !this.compressor) return;
    if (ctx.state === "suspended") return;

    const now = ctx.currentTime;
    if (!this.dryFireNoisePool) {
      this.dryFireNoisePool = this.buildNoisePool(ctx, 0.018);
    }

    // Metallic click transient: very short highpass noise burst
    const source = ctx.createBufferSource();
    source.buffer = this.pickPooledNoise(this.dryFireNoisePool);

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 3200;
    hp.Q.value = 1.2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.016);

    source.connect(hp);
    hp.connect(gain);
    gain.connect(this.compressor);

    source.start(now);
    source.stop(now + 0.02);
    source.onended = () => {
      source.disconnect();
      hp.disconnect();
      gain.disconnect();
    };

    // Tiny triangle ping (bolt hitting empty chamber)
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.04);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.0001, now);
    oscGain.gain.exponentialRampToValueAtTime(0.08, now + 0.002);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

    osc.connect(oscGain);
    oscGain.connect(this.compressor);
    osc.start(now);
    osc.stop(now + 0.045);
    osc.onended = () => {
      osc.disconnect();
      oscGain.disconnect();
    };
  }

  /**
   * Reload start — magazine drop: low plastic clunk.
   * Synthesized: bandpass noise with pitch drop envelope.
   */
  playReloadStart(): void {
    const ctx = this.ensureAudioGraph();
    if (!ctx || !this.compressor) return;
    this.ensureBuffersLoaded();
    if (ctx.state === "suspended") return;

    const now = ctx.currentTime;
    if (this.reloadBuffer) {
      this.playReloadClip(now);
      return;
    }

    const DURATION_S = 0.12;
    if (!this.reloadStartNoisePool) {
      this.reloadStartNoisePool = this.buildNoisePool(ctx, DURATION_S);
    }

    const source = ctx.createBufferSource();
    source.buffer = this.pickPooledNoise(this.reloadStartNoisePool);

    // Bandpass centred ~320Hz — hollow plastic/polymer mag drop
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = this.randRange(300, 360);
    bp.Q.value = 1.5;

    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = "lowshelf";
    lowShelf.frequency.value = 200;
    lowShelf.gain.value = 5;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(this.randRange(0.32, 0.44), now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + DURATION_S);

    const drive = ctx.createWaveShaper();
    drive.curve = DRIVE_CURVE as Float32Array<ArrayBuffer>;

    source.connect(bp);
    bp.connect(lowShelf);
    lowShelf.connect(gain);
    gain.connect(drive);
    drive.connect(this.compressor);

    source.start(now);
    source.stop(now + DURATION_S + 0.01);
    source.onended = () => {
      source.disconnect();
      bp.disconnect();
      lowShelf.disconnect();
      gain.disconnect();
      drive.disconnect();
    };
  }

  /**
   * Reload end — fresh magazine seated + bolt charged: sharp metallic clack.
   * Two layers: seating thud + charging handle snap.
   */
  playReloadEnd(): void {
    const ctx = this.ensureAudioGraph();
    if (!ctx || !this.compressor) return;
    if (ctx.state === "suspended") return;

    if (this.reloadBuffer) {
      this.stopReload();
      return;
    }

    const now = ctx.currentTime;

    // Layer 1: mag seat — medium thud
    this.playFootstepBurst(now, 0.45, 0.95);

    // Layer 2: charging handle snap (0.08s later) — sharp highpass click
    const SNAP_DELAY = 0.08;
    if (!this.reloadSnapNoisePool) {
      this.reloadSnapNoisePool = this.buildNoisePool(ctx, 0.03);
    }

    const source = ctx.createBufferSource();
    source.buffer = this.pickPooledNoise(this.reloadSnapNoisePool);

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1800;
    hp.Q.value = 0.9;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now + SNAP_DELAY);
    gain.gain.exponentialRampToValueAtTime(this.randRange(0.28, 0.38), now + SNAP_DELAY + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + SNAP_DELAY + 0.028);

    // Metallic ring
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(this.randRange(2200, 2800), now + SNAP_DELAY);
    osc.frequency.exponentialRampToValueAtTime(400, now + SNAP_DELAY + 0.04);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.0001, now + SNAP_DELAY);
    oscGain.gain.exponentialRampToValueAtTime(0.12, now + SNAP_DELAY + 0.002);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + SNAP_DELAY + 0.05);

    source.connect(hp);
    hp.connect(gain);
    gain.connect(this.compressor);
    osc.connect(oscGain);
    oscGain.connect(this.compressor);

    source.start(now + SNAP_DELAY);
    source.stop(now + SNAP_DELAY + 0.04);
    osc.start(now + SNAP_DELAY);
    osc.stop(now + SNAP_DELAY + 0.06);

    source.onended = () => {
      source.disconnect();
      hp.disconnect();
      gain.disconnect();
    };
    osc.onended = () => {
      osc.disconnect();
      oscGain.disconnect();
    };
  }

  stopReload(): void {
    if (this.activeReloadSource) {
      this.activeReloadSource.onended = null;
      try {
        this.activeReloadSource.stop();
      } catch {
        // Source may have already ended.
      }
      this.activeReloadSource.disconnect();
      this.activeReloadSource = null;
    }

    if (this.activeReloadCleanup) {
      this.activeReloadCleanup();
      this.activeReloadCleanup = null;
    }
  }

  /**
   * Enemy footstep — quieter, slightly muffled version of the player footstep.
   * distanceNorm: 0=close, 1=far.
   */
  playEnemyFootstep(distanceNorm: number): void {
    const ctx = this.ensureAudioGraph();
    if (!ctx || !this.compressor) return;
    if (ctx.state === "suspended") return;

    if (!this.footstepNoiseBuffer) {
      this.footstepNoiseBuffer = this.createNoiseBuffer(ctx, 0.12);
    }

    const now = ctx.currentTime;
    const falloff = 1 - Math.min(1, distanceNorm);
    // At close range ~0.15 gain; at max range ~0.03
    const gain = (0.03 + 0.12 * falloff) * this.randRange(0.8, 1.2);
    const pitch = this.randRange(0.78, 0.92);
    this.playFootstepBurst(now, gain, pitch);
  }

  /**
   * Start a subtle synthesized wind-drone ambient loop.
   * Safe to call multiple times — only starts once.
   */
  startAmbient(): void {
    if (this.ambientRunning) return;
    const ctx = this.ensureAudioGraph();
    if (!ctx || !this.masterGain) return;
    if (ctx.state === "suspended") return;

    this.ambientRunning = true;

    // Create a 4-second loopable noise buffer
    const AMBIENT_DURATION_S = 4.0;
    const sampleRate = ctx.sampleRate;
    const frameCount = Math.floor(AMBIENT_DURATION_S * sampleRate);
    const buf = ctx.createBuffer(1, frameCount, sampleRate);
    const data = buf.getChannelData(0);

    // Very slow, smooth noise (pink-ish: generated by 6 running sums for 1/f character)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0;
    for (let i = 0; i < frameCount; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const pink = (b0 + b1 + b2 + b3 + b4 + b5 + white * 0.5362) * 0.11;
      data[i] = pink;
    }

    // Smooth loop transition: fade first/last 0.1s
    const fadeLen = Math.floor(0.1 * sampleRate);
    for (let i = 0; i < fadeLen; i++) {
      const t = i / fadeLen;
      data[i]! *= t;
      data[frameCount - 1 - i]! *= t;
    }

    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.loop = true;

    // Low-pass: only let frequencies < 600Hz through (wind feel)
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 550;
    lp.Q.value = 0.5;

    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.0; // start silent

    source.connect(lp);
    lp.connect(gainNode);
    gainNode.connect(this.masterGain);

    source.start();
    this.ambientSource = source;
    this.ambientGain = gainNode;

    // Fade in over 3 seconds to 0.06 (very subtle)
    const now = ctx.currentTime;
    gainNode.gain.setValueAtTime(0.0, now);
    gainNode.gain.linearRampToValueAtTime(0.06, now + 3.0);
  }

  dispose(): void {
    if (this.ambientSource) {
      try { this.ambientSource.stop(); } catch { /* already stopped */ }
      this.ambientSource = null;
    }
    if (this.ambientGain) {
      this.ambientGain.disconnect();
      this.ambientGain = null;
    }
    this.ambientRunning = false;
    this.loadPromise = null;
    this.stopReload();
    this.closeBuffer = null;
    this.tailBuffer = null;
    this.reloadBuffer = null;
    this.killDingBuffer = null;
    this.fallbackNoiseBuffer = null;
    this.hitThudNoisePool = null;
    this.dryFireNoisePool = null;
    this.reloadStartNoisePool = null;
    this.reloadSnapNoisePool = null;
    this.footstepNoiseBuffer = null;

    this.masterGain?.disconnect();
    this.compressor?.disconnect();
    this.playerGunGain?.disconnect();
    this.enemyGunGain?.disconnect();

    this.masterGain = null;
    this.compressor = null;
    this.playerGunGain = null;
    this.enemyGunGain = null;

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
    const playerGunGain = ctx.createGain();
    playerGunGain.gain.value = AK47_AUDIO_TUNING.player.postGain;
    const enemyGunGain = ctx.createGain();
    enemyGunGain.gain.value = AK47_AUDIO_TUNING.enemy.postGain;

    playerGunGain.connect(compressor);
    enemyGunGain.connect(compressor);
    compressor.connect(masterGain);
    masterGain.connect(ctx.destination);

    this.audioContext = ctx;
    this.compressor = compressor;
    this.masterGain = masterGain;
    this.playerGunGain = playerGunGain;
    this.enemyGunGain = enemyGunGain;
    return ctx;
  }

  private ensureBuffersLoaded(): void {
    if (this.loadPromise) return;

    const ctx = this.audioContext;
    if (!ctx) return;

    this.loadPromise = (async () => {
      const [closeLayer, tailLayer, reloadLayer, killDingLayer] = await Promise.all([
        this.loadLayerWithExtensions(ctx, AK47_CLOSE_BASENAME),
        this.loadLayerWithExtensions(ctx, AK47_TAIL_BASENAME),
        this.loadLayerWithExtensions(ctx, AK47_RELOAD_BASENAME),
        this.loadLayerWithExtensions(ctx, KILL_DING_BASENAME),
      ]);

      this.closeBuffer = closeLayer.buffer;
      this.tailBuffer = tailLayer.buffer;
      this.reloadBuffer = reloadLayer.buffer;
      this.killDingBuffer = killDingLayer.buffer;

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

  private playBuffer(
    buffer: AudioBuffer,
    startTime: number,
    playbackRate: number,
    gain: number,
    options: Ak47BufferPlaybackOptions = {},
  ): void {
    if (!this.audioContext || !this.compressor) return;
    const destination = options.destination ?? (this.compressor as AudioNode);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;

    const gainNode = this.audioContext.createGain();
    const peakGain = Math.max(0.0001, gain);
    const attackSeconds = Math.max(0, options.attackSeconds ?? 0);
    gainNode.gain.setValueAtTime(0.0001, startTime);
    if (attackSeconds > 0) {
      gainNode.gain.exponentialRampToValueAtTime(peakGain, startTime + attackSeconds);
    } else {
      gainNode.gain.setValueAtTime(peakGain, startTime);
    }

    const highpass = this.audioContext.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 60;
    highpass.Q.value = 0.7;

    const lowShelf = this.audioContext.createBiquadFilter();
    lowShelf.type = "lowshelf";
    lowShelf.frequency.value = 120;
    lowShelf.gain.value = options.lowShelfGainDb ?? this.randRange(3.5, 5.5);

    const highShelf = this.audioContext.createBiquadFilter();
    highShelf.type = "highshelf";
    highShelf.frequency.value = options.highShelfFrequencyHz ?? this.randRange(3500, 4800);
    highShelf.gain.value = options.highShelfGainDb ?? this.randRange(1.2, 2.8);

    const drive = this.audioContext.createWaveShaper();
    drive.curve = new Float32Array(options.driveCurve ?? DRIVE_CURVE);
    drive.oversample = "2x";

    const lowpassFrequencyHz = options.lowpassFrequencyHz;
    const lowpass =
      lowpassFrequencyHz === undefined
        ? null
        : this.audioContext.createBiquadFilter();
    if (lowpass) {
      lowpass.type = "lowpass";
      const resolvedLowpassFrequencyHz = lowpassFrequencyHz;
      if (resolvedLowpassFrequencyHz !== undefined) {
        lowpass.frequency.value = resolvedLowpassFrequencyHz;
      }
      lowpass.Q.value = 0.72;
    }

    source.connect(gainNode);
    gainNode.connect(highpass);
    highpass.connect(lowShelf);
    lowShelf.connect(highShelf);
    highShelf.connect(drive);
    if (lowpass) {
      drive.connect(lowpass);
      lowpass.connect(destination);
    } else {
      drive.connect(destination);
    }

    const offsetSeconds = Math.max(0, options.offsetSeconds ?? 0);
    source.start(startTime, Math.min(offsetSeconds, Math.max(0, buffer.duration - 0.001)));
    source.onended = () => {
      source.disconnect();
      gainNode.disconnect();
      highpass.disconnect();
      lowShelf.disconnect();
      highShelf.disconnect();
      drive.disconnect();
      lowpass?.disconnect();
    };
  }

  private playReloadClip(startTime: number): void {
    if (!this.audioContext || !this.playerGunGain || !this.reloadBuffer) return;

    this.stopReload();

    const source = this.audioContext.createBufferSource();
    source.buffer = this.reloadBuffer;
    source.playbackRate.value = Math.max(
      0.85,
      Math.min(1.05, this.reloadBuffer.duration / PLAYER_RELOAD_AUDIO_TARGET_DURATION_S),
    );

    const highpass = this.audioContext.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 80;
    highpass.Q.value = 0.7;

    const lowShelf = this.audioContext.createBiquadFilter();
    lowShelf.type = "lowshelf";
    lowShelf.frequency.value = 140;
    lowShelf.gain.value = 1.8;

    const highShelf = this.audioContext.createBiquadFilter();
    highShelf.type = "highshelf";
    highShelf.frequency.value = 3600;
    highShelf.gain.value = -0.8;

    const gainNode = this.audioContext.createGain();
    gainNode.gain.setValueAtTime(0.72, startTime);

    source.connect(highpass);
    highpass.connect(lowShelf);
    lowShelf.connect(highShelf);
    highShelf.connect(gainNode);
    gainNode.connect(this.playerGunGain);

    const cleanup = (): void => {
      source.disconnect();
      highpass.disconnect();
      lowShelf.disconnect();
      highShelf.disconnect();
      gainNode.disconnect();
      if (this.activeReloadCleanup === cleanup) {
        this.activeReloadCleanup = null;
      }
      if (this.activeReloadSource === source) {
        this.activeReloadSource = null;
      }
    };

    this.activeReloadSource = source;
    this.activeReloadCleanup = cleanup;
    source.onended = cleanup;
    source.start(startTime);
  }

  private playFallbackCrack(
    startTime: number,
    gainScale = 1,
    destination: AudioNode = this.compressor as AudioNode,
  ): void {
    if (!this.audioContext || !this.compressor) return;

    if (!this.fallbackNoiseBuffer) {
      this.fallbackNoiseBuffer = this.createNoiseBuffer(this.audioContext, FALLBACK_NOISE_SECONDS);
    }

    this.playFallbackTransientLayer(startTime, gainScale, destination);
    this.playFallbackBodyLayer(startTime, gainScale, destination);
    this.playFallbackTailLayer(startTime + this.randRange(0.01, 0.02), gainScale, destination);
  }

  private playFallbackTransientLayer(
    startTime: number,
    gainScale = 1,
    destination: AudioNode = this.compressor as AudioNode,
  ): void {
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
    gainNode.gain.exponentialRampToValueAtTime(this.randRange(0.85, 1.05) * gainScale, startTime + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + decay);

    source.connect(highpass);
    highpass.connect(gainNode);
    gainNode.connect(destination);

    source.start(startTime);
    source.stop(startTime + decay + 0.02);
    source.onended = () => {
      source.disconnect();
      highpass.disconnect();
      gainNode.disconnect();
    };
  }

  private playFallbackBodyLayer(
    startTime: number,
    gainScale = 1,
    destination: AudioNode = this.compressor as AudioNode,
  ): void {
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
    gainNode.gain.exponentialRampToValueAtTime(this.randRange(0.26, 0.38) * gainScale, startTime + 0.004);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.11);

    osc.connect(lowpass);
    lowpass.connect(gainNode);
    gainNode.connect(destination);

    osc.start(startTime);
    osc.stop(startTime + 0.12);
    osc.onended = () => {
      osc.disconnect();
      lowpass.disconnect();
      gainNode.disconnect();
    };
  }

  private playFallbackTailLayer(
    startTime: number,
    gainScale = 1,
    destination: AudioNode = this.compressor as AudioNode,
  ): void {
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
    gainNode.gain.exponentialRampToValueAtTime(this.randRange(0.08, 0.12) * gainScale, startTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.16);

    source.connect(bandpass);
    bandpass.connect(gainNode);
    gainNode.connect(destination);

    source.start(startTime);
    source.stop(startTime + 0.17);
    source.onended = () => {
      source.disconnect();
      bandpass.disconnect();
      gainNode.disconnect();
    };
  }

  private playFootstepBurst(startTime: number, gain: number, pitchShift: number): void {
    if (!this.audioContext || !this.compressor || !this.footstepNoiseBuffer) return;

    const ctx = this.audioContext;
    const DURATION_S = 0.08; // 80ms thud

    const source = ctx.createBufferSource();
    source.buffer = this.footstepNoiseBuffer;
    source.playbackRate.value = pitchShift * this.randRange(0.95, 1.05);

    // Bandpass: centre energy in 140-200Hz footstep thud zone
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = this.randRange(140, 200);
    bandpass.Q.value = 1.2;

    // Low-shelf: add body below the bandpass
    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = "lowshelf";
    lowShelf.frequency.value = 120;
    lowShelf.gain.value = 6;

    // Gain envelope: fast attack (6ms), decay to silence at 80ms
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(gain, startTime + 0.006);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + DURATION_S);

    // Drive: tanh saturation for physical impact punch
    const drive = ctx.createWaveShaper();
    drive.curve = DRIVE_CURVE as Float32Array<ArrayBuffer>;
    drive.oversample = "2x";

    source.connect(bandpass);
    bandpass.connect(lowShelf);
    lowShelf.connect(gainNode);
    gainNode.connect(drive);
    drive.connect(this.compressor);

    source.start(startTime);
    source.stop(startTime + DURATION_S + 0.01);
    source.onended = () => {
      source.disconnect();
      bandpass.disconnect();
      lowShelf.disconnect();
      gainNode.disconnect();
      drive.disconnect();
    };
  }

  private buildNoisePool(ctx: AudioContext, durationSeconds: number): AudioBuffer[] {
    const pool = new Array<AudioBuffer>(EVENT_NOISE_POOL_SIZE);
    for (let i = 0; i < EVENT_NOISE_POOL_SIZE; i += 1) {
      pool[i] = this.createNoiseBuffer(ctx, durationSeconds);
    }
    return pool;
  }

  private pickPooledNoise(pool: readonly AudioBuffer[]): AudioBuffer {
    const rawIndex = Math.floor(this.randRange(0, pool.length));
    const index = Math.min(pool.length - 1, Math.max(0, rawIndex));
    return pool[index]!;
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
