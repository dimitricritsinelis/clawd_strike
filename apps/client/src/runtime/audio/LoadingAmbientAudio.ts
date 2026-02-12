export type LoadingAmbientAudioOptions = {
  src: string;
  gain: number;
  playFromSec: number;
  loopStartSec: number;
  loopEndSec: number;
  crossfadeSec: number;
};

const DEFAULT_OPTIONS: LoadingAmbientAudioOptions = {
  src: "/loading-screen/ClawdStriker_Audio.mp3",
  gain: 0.45,
  playFromSec: 0,
  loopStartSec: 0,
  loopEndSec: Number.POSITIVE_INFINITY,
  crossfadeSec: 0.22,
};

export class LoadingAmbientAudio {
  private readonly options: LoadingAmbientAudioOptions;
  private audio: HTMLAudioElement | null = null;
  private muted = false;
  private running = false;
  private startedOnce = false;
  private readonly onTimeUpdate = () => {
    const audio = this.audio;
    if (!audio) return;

    const end = this.options.loopEndSec;
    if (!Number.isFinite(end)) return;
    if (audio.currentTime < end - 0.03) return;

    const loopStart = Math.max(0, this.options.loopStartSec);
    audio.currentTime = loopStart;
    if (this.running && audio.paused) {
      void audio.play().catch(() => {
        // Playback may be blocked without a user gesture.
      });
    }
  };

  constructor(options?: Partial<LoadingAmbientAudioOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    const audio = this.audio;
    if (!audio) return;

    audio.muted = muted;
    audio.volume = muted ? 0 : this.options.gain;
  }

  isMuted(): boolean {
    return this.muted;
  }

  async start(): Promise<void> {
    const audio = this.getOrCreateAudio();
    this.running = true;

    if (!this.startedOnce) {
      this.startedOnce = true;
      const startAt = Math.max(0, this.options.playFromSec);
      if (startAt > 0) {
        try {
          audio.currentTime = startAt;
        } catch {
          // Some browsers can reject currentTime writes before metadata is loaded.
        }
      }
    }

    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        // Browser blocked autoplay until explicit interaction.
      }
    }
  }

  stop() {
    this.running = false;
    const audio = this.audio;
    if (!audio) return;

    audio.pause();
    try {
      audio.currentTime = Math.max(0, this.options.playFromSec);
    } catch {
      // Ignore if seek is not currently allowed.
    }
  }

  private getOrCreateAudio(): HTMLAudioElement {
    if (this.audio) return this.audio;

    const audio = new Audio(this.options.src);
    audio.preload = "auto";
    audio.loop = !Number.isFinite(this.options.loopEndSec);
    audio.muted = this.muted;
    audio.volume = this.muted ? 0 : this.options.gain;

    if (Number.isFinite(this.options.loopEndSec)) {
      audio.addEventListener("timeupdate", this.onTimeUpdate);
    }

    // Start buffering immediately so first audible frame arrives faster.
    audio.load();

    this.audio = audio;
    return audio;
  }
}
