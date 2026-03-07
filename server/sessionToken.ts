/**
 * Session Token Module — Anti-Cheat Layer
 *
 * Purpose: Proves a score submission originated from an actual game page load,
 * not a direct API call. The server issues a signed HMAC-SHA256 token when the
 * game runtime starts; the client must include it when submitting scores.
 *
 * Design decisions:
 * - Stateless: no DB table needed. The HMAC signature is the proof.
 * - 30-minute expiry: generous enough for long game sessions, short enough
 *   to limit token harvesting.
 * - Per-run tokens: the client requests a fresh token on every respawn,
 *   so each run has its own token.
 * - Not one-time-use: would require a DB table. The existing rate limiter
 *   (1 submission per 30s per IP) prevents rapid reuse of the same token.
 *
 * Security: SESSION_SECRET env var is required in production. In dev (when
 * the env var is absent), a hardcoded fallback is used. Never ship the
 * fallback to production.
 *
 * See docs/security.md for the full security architecture.
 */

import { createHmac, randomUUID } from "node:crypto";

const SESSION_TOKEN_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

const DEV_FALLBACK_SECRET = "clawd-strike-dev-session-secret-do-not-use-in-production";

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.trim().length >= 32) {
    return secret.trim();
  }
  // In production, warn loudly if the secret is missing or too short.
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    console.warn(
      "[session-token] WARNING: SESSION_SECRET is missing or too short. "
      + "Using dev fallback. Set a 32+ character SESSION_SECRET env var in Vercel.",
    );
  }
  return DEV_FALLBACK_SECRET;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
}

type SessionPayload = {
  sid: string;
  iat: number;
};

/**
 * Issue a new session token. Call this when a game run starts.
 * Returns a signed token string in the format: base64url(payload).signature
 */
export function issueSessionToken(): string {
  const payload: SessionPayload = {
    sid: randomUUID(),
    iat: Date.now(),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
}

export type SessionTokenResult =
  | { valid: true; payload: SessionPayload }
  | { valid: false; reason: string };

/**
 * Verify a session token. Checks HMAC signature and expiry.
 * Does NOT check one-time-use (stateless design — rate limiter covers this).
 */
export function verifySessionToken(token: unknown): SessionTokenResult {
  if (typeof token !== "string" || token.length === 0) {
    return { valid: false, reason: "missing" };
  }

  const dotIndex = token.indexOf(".");
  if (dotIndex < 1 || dotIndex >= token.length - 1) {
    return { valid: false, reason: "malformed" };
  }

  const encoded = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);

  // Verify HMAC signature
  const expected = sign(encoded);
  if (signature !== expected) {
    return { valid: false, reason: "invalid-signature" };
  }

  // Decode and parse payload
  let payload: SessionPayload;
  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    payload = JSON.parse(decoded) as SessionPayload;
  } catch {
    return { valid: false, reason: "corrupt-payload" };
  }

  if (typeof payload.iat !== "number" || !Number.isFinite(payload.iat)) {
    return { valid: false, reason: "invalid-timestamp" };
  }

  // Check expiry
  const age = Date.now() - payload.iat;
  if (age < 0 || age > SESSION_TOKEN_EXPIRY_MS) {
    return { valid: false, reason: "expired" };
  }

  return { valid: true, payload };
}

/**
 * Handle a POST /api/session request. Returns a JSON response with a token.
 */
export function handleSessionRequest(request: Request): Response {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "allow": "POST, OPTIONS",
        "cache-control": "no-store",
      },
    });
  }

  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed." },
      { status: 405, headers: { "cache-control": "no-store" } },
    );
  }

  const token = issueSessionToken();
  console.log(`[session-token] issued sid=${token.slice(0, 16)}...`);

  return Response.json(
    { token },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      },
    },
  );
}
