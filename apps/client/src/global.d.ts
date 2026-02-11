declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => Promise<void>;
    __vt_pending?: unknown;
  }
}

export {};

