/// <reference types="vite/client" />

import type { AgentAction } from "./runtime/input/AgentAction";

declare global {
  interface Window {
    agent_observe?: () => string;
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => Promise<void>;
    agent_apply_action?: (action: AgentAction) => void;
    __debug_emit_combat_feedback?: (payload: {
      isHeadshot?: boolean;
      didKill?: boolean;
      damage?: number;
      enemyName?: string;
    }) => void;
    __debug_eliminate_all_bots?: () => number;
    __debug_set_buff_orbs?: (payload: {
      count?: number;
    }) => number;
    __debug_set_player_pose?: (payload: {
      x: number;
      y: number;
      z: number;
      yawDeg?: number;
    }) => void;
    __debug_reset_bot_knowledge?: () => void;
    __debug_suppress_bot_intel_ms?: (durationMs: number) => void;
    __vt_pending?: unknown;
  }
}

export {};
