import { PLAYER_NAME_MAX_LENGTH } from "./playerName.js";

export const PUBLIC_AGENT_API_VERSION = 1;
export const PUBLIC_AGENT_CONTRACT = "public-agent-v1";
export const PUBLIC_AGENT_CANONICAL_HOST = "https://clawd-strike.vercel.app/";
export const PUBLIC_AGENT_CANONICAL_SKILLS_PATH = "/skills.md";
export const PUBLIC_AGENT_CANONICAL_SKILLS_URL = new URL(
  PUBLIC_AGENT_CANONICAL_SKILLS_PATH,
  PUBLIC_AGENT_CANONICAL_HOST,
).toString();
export const PUBLIC_AGENT_COMPANION_REPO_NAME = "clawd-strike-agent-starter";
export const PUBLIC_AGENT_COMPANION_REPO_URL =
  "https://github.com/dimitricritsinelis/clawd-strike-agent-starter";
export const PUBLIC_AGENT_NAME_MAX_LENGTH = PLAYER_NAME_MAX_LENGTH;

export const PUBLIC_AGENT_STABLE_SELECTORS = {
  agentMode: '[data-testid="agent-mode"]',
  play: '[data-testid="play"]',
  agentName: '[data-testid="agent-name"]',
  playAgain: '[data-testid="play-again"]',
} as const;

export const PUBLIC_AGENT_SUPPORTED_GLOBALS = [
  "agent_observe",
  "render_game_to_text",
  "agent_apply_action",
  "advanceTime",
] as const;

export type PublicAgentStableSelectorKey = keyof typeof PUBLIC_AGENT_STABLE_SELECTORS;
export type PublicAgentSupportedGlobal = (typeof PUBLIC_AGENT_SUPPORTED_GLOBALS)[number];
