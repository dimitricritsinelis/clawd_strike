export const PLAYER_NAME_MAX_LENGTH = 15;

const PLAYER_NAME_ALLOWED_CHARS_RE = /^[A-Za-z0-9 ._'-]+$/;
const PLAYER_NAME_REQUIRED_CHAR_RE = /[A-Za-z0-9]/;

const MODERATION_CHAR_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
};

const BLOCKED_PLAYER_NAME_TOKENS = new Set([
  "asshole",
  "bitch",
  "bitches",
  "chink",
  "coon",
  "cunt",
  "fag",
  "faggot",
  "fuck",
  "fucker",
  "fucking",
  "gook",
  "kike",
  "motherfucker",
  "nigga",
  "nigger",
  "raghead",
  "retard",
  "shit",
  "shitty",
  "spic",
  "towelhead",
  "tranny",
  "wetback",
]);

const BLOCKED_PLAYER_NAME_KEYS = new Set([
  ...BLOCKED_PLAYER_NAME_TOKENS,
  "dickhead",
  "fuckface",
  "shithead",
]);

export type PlayerNameValidationReason = "valid" | "required" | "invalid-chars" | "blocked";

export type PlayerNameValidationResult =
  | {
      ok: true;
      reason: "valid";
      normalized: string;
      moderationKey: string;
    }
  | {
      ok: false;
      reason: Exclude<PlayerNameValidationReason, "valid">;
      normalized: string;
      moderationKey: string;
    };

export function clampPlayerNameInput(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.slice(0, PLAYER_NAME_MAX_LENGTH);
}

function normalizePlayerNameWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toModerationKey(value: string): string {
  let key = "";

  for (const char of value.toLowerCase()) {
    const mapped = MODERATION_CHAR_MAP[char] ?? char;
    if (mapped >= "a" && mapped <= "z") {
      key += mapped;
    }
  }

  return key;
}

function tokenizeModerationKey(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[\s._'-]+/)
    .map((token) => toModerationKey(token))
    .filter((token) => token.length > 0);
}

function isBlockedPlayerName(normalized: string, moderationKey: string): boolean {
  if (BLOCKED_PLAYER_NAME_KEYS.has(moderationKey)) {
    return true;
  }

  return tokenizeModerationKey(normalized).some((token) => BLOCKED_PLAYER_NAME_TOKENS.has(token));
}

export function validatePlayerName(value: unknown): PlayerNameValidationResult {
  const normalized = normalizePlayerNameWhitespace(clampPlayerNameInput(value));

  if (normalized.length === 0) {
    return {
      ok: false,
      reason: "required",
      normalized,
      moderationKey: "",
    };
  }

  if (!PLAYER_NAME_ALLOWED_CHARS_RE.test(normalized) || !PLAYER_NAME_REQUIRED_CHAR_RE.test(normalized)) {
    return {
      ok: false,
      reason: "invalid-chars",
      normalized,
      moderationKey: toModerationKey(normalized),
    };
  }

  const moderationKey = toModerationKey(normalized);
  if (isBlockedPlayerName(normalized, moderationKey)) {
    return {
      ok: false,
      reason: "blocked",
      normalized,
      moderationKey,
    };
  }

  return {
    ok: true,
    reason: "valid",
    normalized,
    moderationKey,
  };
}

export function parseStoredPlayerName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const result = validatePlayerName(value);
  return result.ok ? result.normalized : null;
}

export function sanitizeValidatedPlayerName(value: unknown): string | null {
  return parseStoredPlayerName(value);
}

export function normalizeValidatedPlayerName(value: string): string {
  const normalized = parseStoredPlayerName(value);
  if (normalized === null) {
    throw new Error("Expected a validated player name.");
  }
  return normalized;
}
