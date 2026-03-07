import {
  isSharedChampionControlMode,
  normalizeScoreHalfPoints,
  parseTelemetry,
  sanitizeSharedChampionName,
  validateTelemetry,
  type SharedChampionPostRequest,
} from "../apps/shared/highScore.js";
import type { SharedChampionStore } from "./highScoreStore.js";
import { verifySessionToken } from "./sessionToken.js";

const MAX_POST_BODY_BYTES = 1024;

const JSON_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
} as const;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...(init.headers ?? {}),
    },
  });
}

function errorResponse(status: number, error: string): Response {
  return jsonResponse({ error }, { status });
}

function parseSubmissionBody(value: unknown): SharedChampionPostRequest | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!isSharedChampionControlMode(record.controlMode)) return null;

  const parsedScore = Number(record.scoreHalfPoints);
  if (!Number.isFinite(parsedScore) || parsedScore < 0) return null;

  const telemetry = parseTelemetry(record.telemetry);
  if (!telemetry) return null;

  return {
    playerName: sanitizeSharedChampionName(record.playerName, record.controlMode),
    scoreHalfPoints: normalizeScoreHalfPoints(parsedScore),
    controlMode: record.controlMode,
    telemetry,
  };
}

function extractClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

export async function handleSharedChampionRequest(
  request: Request,
  store: SharedChampionStore | null,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "allow": "GET, POST, OPTIONS",
        "cache-control": "no-store",
      },
    });
  }

  if (store === null) {
    return errorResponse(
      503,
      "Shared champion storage is unavailable. Configure Vercel Marketplace Postgres (Neon recommended).",
    );
  }

  try {
    if (request.method === "GET") {
      const champion = await store.getChampion();
      return jsonResponse({ champion });
    }

    if (request.method === "POST") {
      const clientIp = extractClientIp(request);

      // ── Request size limit ──────────────────────────────────────────────
      const contentLength = parseInt(request.headers.get("content-length") ?? "0", 10);
      if (contentLength > MAX_POST_BODY_BYTES) {
        console.log(`[champion-submit] ip=${clientIp} result=rejected reason=payload-too-large size=${contentLength}`);
        return errorResponse(413, "Payload too large.");
      }

      // ── Rate limiting ───────────────────────────────────────────────────
      const rateLimited = await store.isRateLimited(clientIp);
      if (rateLimited) {
        console.log(`[champion-submit] ip=${clientIp} result=rate-limited`);
        return errorResponse(429, "Too many submissions. Try again later.");
      }

      // ── Parse body ──────────────────────────────────────────────────────
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        console.log(`[champion-submit] ip=${clientIp} result=rejected reason=invalid-json`);
        return errorResponse(400, "Invalid JSON body.");
      }

      // ── Session token verification ──────────────────────────────────────
      // Proves the submission came from an actual game page load, not a
      // direct API call. See docs/security.md for design rationale.
      const rawToken = (body as Record<string, unknown>)?.sessionToken;
      const tokenResult = verifySessionToken(rawToken);
      if (!tokenResult.valid) {
        console.log(`[champion-submit] ip=${clientIp} result=rejected reason=session-${tokenResult.reason}`);
        return errorResponse(403, "Invalid or expired session token.");
      }

      const parsedBody = parseSubmissionBody(body);
      if (!parsedBody) {
        console.log(`[champion-submit] ip=${clientIp} result=rejected reason=invalid-payload`);
        return errorResponse(400, "Expected { playerName, scoreHalfPoints, controlMode, telemetry, sessionToken }.");
      }

      // ── Telemetry validation ────────────────────────────────────────────
      const telemetryResult = validateTelemetry(parsedBody.scoreHalfPoints, parsedBody.telemetry);
      if (!telemetryResult.valid) {
        console.log(
          `[champion-submit] ip=${clientIp} name=${parsedBody.playerName} score=${parsedBody.scoreHalfPoints} mode=${parsedBody.controlMode} result=rejected reason=telemetry-${telemetryResult.reason}`,
        );
        return errorResponse(400, "Score telemetry validation failed.");
      }

      // ── Submit ──────────────────────────────────────────────────────────
      const result = await store.submitCandidate(parsedBody);

      // ── Log submission + record for rate limiting ───────────────────────
      await store.logSubmission(clientIp);

      console.log(
        `[champion-submit] ip=${clientIp} name=${parsedBody.playerName} score=${parsedBody.scoreHalfPoints} mode=${parsedBody.controlMode} result=${result.updated ? "accepted" : "not-higher"}`,
      );

      return jsonResponse(result);
    }

    return errorResponse(405, "Method not allowed.");
  } catch (error) {
    console.error("[shared-champion] request failed", error);
    return errorResponse(500, "Shared champion request failed.");
  }
}
