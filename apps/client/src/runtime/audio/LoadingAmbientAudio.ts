const MENU_ACTIVE_GAIN = 0.45;
const MENU_MUTED_GAIN = 0;

export class LoadingAmbientAudio {
  private static readonly SRC = "/ClawdStriker_Audio.mp3";

  private audioEl: HTMLAudioElement | null = null;
  private muted = false;

  setMuted(muted: boolean) {
    this.muted = muted;
    const audio = this.audioEl;
    if (!audio) return;
    audio.volume = muted ? MENU_MUTED_GAIN : MENU_ACTIVE_GAIN;
  }

  isMuted(): boolean {
    return this.muted;
  }

  async start(): Promise<void> {
    const audio = this.getOrCreateAudio();
    audio.volume = this.muted ? MENU_MUTED_GAIN : MENU_ACTIVE_GAIN;

    try {
      await audio.play();
    } catch {
      // Autoplay can be blocked until explicit user interaction.
    }
  }

  stop() {
    const audio = this.audioEl;
    if (!audio) return;

    audio.pause();
    audio.currentTime = 0;
  }

  private getOrCreateAudio(): HTMLAudioElement {
    if (this.audioEl) return this.audioEl;

    const audio = new Audio(LoadingAmbientAudio.SRC);
    audio.loop = true;
    audio.preload = "auto";

    this.audioEl = audio;
    return audio;
  }
}
