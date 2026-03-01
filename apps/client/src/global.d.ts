import type { AgentAction } from "./runtime/input/AgentAction";

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => Promise<void>;
    agent_apply_action?: (action: AgentAction) => void;
    __vt_pending?: unknown;
  }
}

export {};
