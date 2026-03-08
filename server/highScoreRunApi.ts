import { randomBytes, randomUUID } from "node:crypto";
import {
  SHARED_CHAMPION_RUN_TOKEN_TTL_MS,
  SHARED_CHAMPION_SCORE_RULESET,
  isSharedChampionControlMode,
  normalizeSharedChampionRunSummary,
  sanitizeSharedChampionMapId,
  sanitizeSharedChampionName,
  validateSharedChampionRunSummary,
  type SharedChampionRunFinishRequest,
  type SharedChampionRunFinishResponse,
  type SharedChampionRunStartRequest,
  type SharedChampionRunStartResponse,
} from "../apps/shared/highScore.js";
import {
  isSharedChampionPublicRunSubmissionEnabled,
  protectJsonWriteRequest,
  sha256Hex,
} from "./highScoreSecurity.js";
import type { SharedChampionAuditEvent, SharedChampionStore } from "./highScoreStore.js";

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

function parseRunStartBody(value: unknown): SharedChampionRunStartRequest | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!isSharedChampionControlMode(record.controlMode)) return null;
  return {
    playerName: sanitizeSharedChampionName(record.playerName, record.controlMode),
    controlMode: record.controlMode,
    mapId: sanitizeSharedChampionMapId(record.mapId),
  };
}

function parseRunFinishBody(value: unknown): SharedChampionRunFinishRequest | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  if (typeof record.runToken !== "string" || record.runToken.trim().length === 0) {
    return null;
  }

  const summary = normalizeSharedChampionRunSummary(record.summary);
  if (!summary) {
    return null;
  }

  return {
    runToken: record.runToken.trim(),
    summary,
  };
}

async function recordAuditEvent(
  store: SharedChampionStore,
  event: SharedChampionAuditEvent,
): Promise<void> {
  try {
    await store.recordAuditEvent(event);
  } catch (error) {
    console.warn("[shared-champion] failed to record audit event", error);
  }
}

function publicRunsDisabledResponse(): Response {
  return errorResponse(
    503,
    "Shared champion submissions are disabled on this deployment.",
  );
}

export async function handleSharedChampionRunStartRequest(
  request: Request,
  store: SharedChampionStore | null,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(405, "Method not allowed.");
  }

  if (store === null) {
    return errorResponse(
      503,
      "Shared champion storage is unavailable. Configure Vercel Marketplace Postgres (Neon recommended).",
    );
  }

  const writeCheck = protectJsonWriteRequest(request, {
    rateLimitNamespace: "shared-champion-run-start",
    maxRequests: 120,
    windowMs: 60_000,
    requireSameOrigin: true,
  });
  if (!writeCheck.ok) {
    await recordAuditEvent(store, {
      eventType: "run-start",
      outcome: "rejected",
      ipFingerprint: writeCheck.clientIpFingerprint,
      userAgentFingerprint: writeCheck.userAgentFingerprint,
      reason: writeCheck.error,
    });
    return errorResponse(writeCheck.status, writeCheck.error);
  }

  if (!isSharedChampionPublicRunSubmissionEnabled()) {
    await recordAuditEvent(store, {
      eventType: "run-start",
      outcome: "rejected",
      ipFingerprint: writeCheck.clientIpFingerprint,
      userAgentFingerprint: writeCheck.userAgentFingerprint,
      reason: "public-runs-disabled",
    });
    return publicRunsDisabledResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    await recordAuditEvent(store, {
      eventType: "run-start",
      outcome: "rejected",
      ipFingerprint: writeCheck.clientIpFingerprint,
      userAgentFingerprint: writeCheck.userAgentFingerprint,
      reason: "invalid-json",
    });
    return errorResponse(400, "Invalid JSON body.");
  }

  const parsedBody = parseRunStartBody(body);
  if (!parsedBody) {
    await recordAuditEvent(store, {
      eventType: "run-start",
      outcome: "rejected",
      ipFingerprint: writeCheck.clientIpFingerprint,
      userAgentFingerprint: writeCheck.userAgentFingerprint,
      reason: "invalid-start-payload",
    });
    return errorResponse(400, "Expected { playerName, controlMode, mapId }.");
  }

  try {
    const runToken = randomBytes(32).toString("base64url");
    const issued = await store.issueRunToken({
      runId: randomUUID(),
      tokenHash: sha256Hex(runToken),
      playerName: parsedBody.playerName,
      controlMode: parsedBody.controlMode,
      mapId: parsedBody.mapId,
      expiresAt: new Date(Date.now() + SHARED_CHAMPION_RUN_TOKEN_TTL_MS),
      clientIpFingerprint: writeCheck.clientIpFingerprint,
      userAgentFingerprint: writeCheck.userAgentFingerprint,
    });

    const responseBody: SharedChampionRunStartResponse = {
      runToken,
      issuedAt: issued.issuedAt,
      expiresAt: issued.expiresAt,
      ruleset: SHARED_CHAMPION_SCORE_RULESET,
    };

    await recordAuditEvent(store, {
      eventType: "run-start",
      outcome: "accepted",
      runId: issued.runId,
      ipFingerprint: writeCheck.clientIpFingerprint,
      userAgentFingerprint: writeCheck.userAgentFingerprint,
      payload: {
        playerName: issued.playerName,
        controlMode: issued.controlMode,
        mapId: issued.mapId,
        expiresAt: issued.expiresAt,
      },
    });

    return jsonResponse(responseBody);
  } catch (error) {
    console.error("[shared-champion] run-start failed", error);
    return errorResponse(500, "Shared champion run start failed.");
  }
}

async function buildRejectedFinishResponse(
  store: SharedChampionStore,
  status: number,
  reason: string,
): Promise<Response> {
  const champion = await store.getChampion();
  const body: SharedChampionRunFinishResponse = {
    accepted: false,
    updated: false,
    champion,
    reason,
  };
  return jsonResponse(body, { status });
}

export async function handleSharedChampionRunFinishRequest(
  request: Request,
  store: SharedChampionStore | null,
): Promise<Response> {
  if (request.method !== "POST") {
    return errorResponse(405, "Method not allowed.");
  }

  if (store === null) {
    return errorResponse(
      503,
      "Shared champion storage is unavailable. Configure Vercel Marketplace Postgres (Neon recommended).",
    );
  }

  const writeCheck = protectJsonWriteRequest(request, {
    rateLimitNamespace: "shared-champion-run-finish",
    maxRequests: 120,
    windowMs: 60_000,
    requireSameOrigin: true,
  });
  if (!writeCheck.ok) {
    await recordAuditEvent(store, {
      eventType: "run-finish",
      outcome: "rejected",
      ipFingerprint: writeCheck.clientIpFingerprint,
      userAgentFingerprint: writeCheck.userAgentFingerprint,
      reason: writeCheck.error,
    });
    return buildRejectedFinishResponse(store, writeCheck.status, writeCheck.error);
  }

  if (!isSharedChampionPublicRunSubmissionEnabled()) {
    await recordAuditEvent(store, {
      eventType: "run-finish",
      outcome: "rejected",
      ipFingerprint: writeCheck.clientIpFingerprint,
      userAgentFingerprint: writeCheck.userAgentFingerprint,
      reason: "public-runs-disabled",
    });
    return buildRejectedFinishResponse(store, 503, "public-runs-disabled");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    await recordAuditEvent(store, {
      eventType: "run-finish",
      outcome: "rejected",
      ipFingerprint: writeCheck.clientIpFingerprint,
      userAgentFingerprint: writeCheck.userAgentFingerprint,
      reason: "invalid-json",
    });
    return buildRejectedFinishResponse(store, 400, "invalid-json");
  }

  const parsedBody = parseRunFinishBody(body);
  if (!parsedBody) {
    await recordAuditEvent(store, {
      eventType: "run-finish",
      outcome: "rejected",
      ipFingerprint: writeCheck.clientIpFingerprint,
      userAgentFingerprint: writeCheck.userAgentFingerprint,
      reason: "invalid-finish-payload",
    });
    return buildRejectedFinishResponse(store, 400, "invalid-finish-payload");
  }

  try {
    const consumed = await store.consumeRunToken({
      tokenHash: sha256Hex(parsedBody.runToken),
      clientIpFingerprint: writeCheck.clientIpFingerprint,
      userAgentFingerprint: writeCheck.userAgentFingerprint,
    });

    if (consumed.status !== "consumed" || !consumed.record) {
      const status = consumed.status === "expired"
        ? 410
        : consumed.status === "used"
          ? 409
          : 404;
      await recordAuditEvent(store, {
        eventType: "run-finish",
        outcome: "rejected",
        runId: consumed.record?.runId ?? null,
        ipFingerprint: writeCheck.clientIpFingerprint,
        userAgentFingerprint: writeCheck.userAgentFingerprint,
        reason: consumed.status,
      });
      return buildRejectedFinishResponse(store, status, consumed.status);
    }

    const claimedAtMs = consumed.record.claimedAt
      ? Date.parse(consumed.record.claimedAt)
      : Date.now();
    const issuedAtMs = Date.parse(consumed.record.issuedAt);
    const elapsedMs = Math.max(0, claimedAtMs - issuedAtMs);
    const validation = validateSharedChampionRunSummary(parsedBody.summary, elapsedMs);

    if (!validation.ok) {
      await recordAuditEvent(store, {
        eventType: "run-finish",
        outcome: "rejected",
        runId: consumed.record.runId,
        ipFingerprint: writeCheck.clientIpFingerprint,
        userAgentFingerprint: writeCheck.userAgentFingerprint,
        reason: validation.reason,
        payload: {
          mapId: consumed.record.mapId,
          playerName: consumed.record.playerName,
          controlMode: consumed.record.controlMode,
          elapsedMs: validation.elapsedMs,
          maxKills: validation.maxKills,
          maxShotsFired: validation.maxShotsFired,
          summary: parsedBody.summary,
        },
      });
      return buildRejectedFinishResponse(store, 422, validation.reason);
    }

    const result = await store.finalizeValidatedRun({
      tokenRecord: consumed.record,
      summary: parsedBody.summary,
      elapsedMs: validation.elapsedMs,
      scoreHalfPoints: validation.computedScoreHalfPoints,
      clientIpFingerprint: writeCheck.clientIpFingerprint,
      userAgentFingerprint: writeCheck.userAgentFingerprint,
    });

    await recordAuditEvent(store, {
      eventType: "run-finish",
      outcome: "accepted",
      runId: consumed.record.runId,
      ipFingerprint: writeCheck.clientIpFingerprint,
      userAgentFingerprint: writeCheck.userAgentFingerprint,
      payload: {
        playerName: consumed.record.playerName,
        controlMode: consumed.record.controlMode,
        mapId: consumed.record.mapId,
        elapsedMs: validation.elapsedMs,
        scoreHalfPoints: validation.computedScoreHalfPoints,
        updated: result.updated,
        runId: result.run.runId,
        summary: parsedBody.summary,
      },
    });

    const responseBody: SharedChampionRunFinishResponse = {
      accepted: true,
      updated: result.updated,
      champion: result.champion,
      reason: null,
    };

    return jsonResponse(responseBody);
  } catch (error) {
    console.error("[shared-champion] run-finish failed", error);
    return errorResponse(500, "Shared champion run finish failed.");
  }
}
