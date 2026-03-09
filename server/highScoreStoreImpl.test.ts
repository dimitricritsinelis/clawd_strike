import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";

import { authorizeStatsAdminRequest } from "./highScoreSecurity.js";
import { handleSharedChampionRunFinishRequest } from "./highScoreRunApi.js";
import {
  createSharedChampion,
  parseSharedChampion,
} from "../apps/shared/highScore.js";
import {
  deriveRunFields,
  parseStatsFilters,
} from "./highScoreStats.js";
import {
  createInMemorySharedChampionStore,
  planSharedChampionAcceptedRunBackfill,
  normalizePgConnectionString,
  resolvePgConnectionSelection,
  resolvePgConnectionString,
  resolveSharedChampionReconcileConnectionString,
  runSharedChampionSchemaMaintenance,
  type SharedChampionAuditEvent,
  type SharedChampionStore,
  validateSharedChampionConstraints,
} from "./highScoreStoreImpl.js";

function createValidRunFinishSummary() {
  return {
    survivalTimeS: 1,
    kills: 1,
    headshots: 0,
    headshotsPerWave: [0],
    shotsFired: 1,
    shotsHit: 1,
    accuracy: 100,
    finalScore: 5,
    deathCause: "enemy-fire" as const,
  };
}

function createRunFinishRequest(input: {
  runToken?: string;
  summary?: unknown;
} = {}): Request {
  return new Request("https://example.test/api/run/finish", {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      origin: "https://example.test",
      "user-agent": "shared-champion-test-agent",
    },
    body: JSON.stringify({
      runToken: input.runToken ?? "test-run-token",
      summary: input.summary ?? createValidRunFinishSummary(),
    }),
  });
}

function createSharedChampionStoreStub(
  overrides: Partial<SharedChampionStore> = {},
): SharedChampionStore {
  return {
    async getChampion() {
      return null;
    },
    async submitCandidate() {
      throw new Error("unused");
    },
    async isRateLimited() {
      return false;
    },
    async logSubmission() {},
    async issueRunToken() {
      throw new Error("unused");
    },
    async consumeRunToken() {
      return {
        status: "missing" as const,
        record: null,
      };
    },
    async finalizeValidatedRun() {
      throw new Error("unused");
    },
    async recordAuditEvent() {},
    async getStatsOverview() {
      throw new Error("unused");
    },
    async listRuns() {
      throw new Error("unused");
    },
    async listNames() {
      throw new Error("unused");
    },
    async listDaily() {
      throw new Error("unused");
    },
    ...overrides,
  };
}

test("shared server modules use explicit .js suffixes for relative imports", () => {
  const sharedDir = fileURLToPath(new URL("../apps/shared/", import.meta.url));
  const sourceFiles = readdirSync(sharedDir)
    .filter((entry) => entry.endsWith(".ts"))
    .sort();
  const missingJsSuffixes: string[] = [];
  const importSpecifierPattern = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["'](\.{1,2}\/[^"']+)["']/g;

  for (const sourceFile of sourceFiles) {
    const sourcePath = path.join(sharedDir, sourceFile);
    const sourceText = readFileSync(sourcePath, "utf8");
    for (const match of sourceText.matchAll(importSpecifierPattern)) {
      const specifier = match[1];
      if (!specifier || specifier.endsWith(".js")) continue;
      missingJsSuffixes.push(`${sourceFile}: ${specifier}`);
    }
  }

  assert.deepEqual(missingJsSuffixes, []);
});

test("prefers explicit write and read overrides when they are configured", () => {
  const env = {
    POSTGRES_WRITE_URL: "postgres://write-explicit",
    POSTGRES_READ_URL: "postgres://read-explicit",
    POSTGRES_URL: "postgres://generic-pooled",
    DATABASE_URL: "postgres://database-url",
  } as NodeJS.ProcessEnv;

  assert.deepEqual(resolvePgConnectionSelection("write", env), {
    connectionString: "postgres://write-explicit",
    envKey: "POSTGRES_WRITE_URL",
  });
  assert.deepEqual(resolvePgConnectionSelection("read", env), {
    connectionString: "postgres://read-explicit",
    envKey: "POSTGRES_READ_URL",
  });
});

test("accepts Vercel generic Postgres aliases for gameplay writes", () => {
  const pooledEnv = {
    NODE_ENV: "production",
    POSTGRES_URL: "postgres://generic-pooled",
  } as NodeJS.ProcessEnv;
  assert.equal(resolvePgConnectionString("write", pooledEnv), "postgres://generic-pooled");

  const databaseUrlEnv = {
    VERCEL: "1",
    DATABASE_URL: "postgres://database-url",
  } as NodeJS.ProcessEnv;
  assert.equal(resolvePgConnectionString("write", databaseUrlEnv), "postgres://database-url");
});

test("normalizes legacy SSL modes to verify-full while preserving local disable semantics", () => {
  assert.deepEqual(
    normalizePgConnectionString("postgres://db.example.com/app?sslmode=require"),
    {
      connectionString: "postgres://db.example.com/app?sslmode=verify-full",
      sslModeBefore: "require",
      sslModeAfter: "verify-full",
    },
  );
  assert.deepEqual(
    normalizePgConnectionString("postgres://db.example.com/app?sslmode=prefer"),
    {
      connectionString: "postgres://db.example.com/app?sslmode=verify-full",
      sslModeBefore: "prefer",
      sslModeAfter: "verify-full",
    },
  );
  assert.deepEqual(
    normalizePgConnectionString("postgres://db.example.com/app?sslmode=verify-ca"),
    {
      connectionString: "postgres://db.example.com/app?sslmode=verify-full",
      sslModeBefore: "verify-ca",
      sslModeAfter: "verify-full",
    },
  );
  assert.deepEqual(
    normalizePgConnectionString("postgres://localhost/app?sslmode=disable"),
    {
      connectionString: "postgres://localhost/app?sslmode=disable",
      sslModeBefore: "disable",
      sslModeAfter: "disable",
    },
  );
});

test("accepts non-pooling aliases and write fallback when read-specific config is absent", () => {
  const nonPoolingEnv = {
    POSTGRES_URL_NON_POOLING: "postgres://non-pooling",
  } as NodeJS.ProcessEnv;
  assert.equal(resolvePgConnectionString("write", nonPoolingEnv), "postgres://non-pooling");

  const readFallbackEnv = {
    POSTGRES_WRITE_URL: "postgres://write-fallback",
  } as NodeJS.ProcessEnv;
  assert.equal(resolvePgConnectionString("read", readFallbackEnv), "postgres://write-fallback");
});

test("prefers unpooled URLs for explicit reconcile runs", () => {
  const env = {
    POSTGRES_URL_NON_POOLING: "postgres://non-pooling-primary",
    DATABASE_URL_UNPOOLED: "postgres://database-unpooled",
    POSTGRES_WRITE_URL: "postgres://write-pooled",
  } as NodeJS.ProcessEnv;
  assert.equal(
    resolveSharedChampionReconcileConnectionString(env),
    "postgres://non-pooling-primary",
  );
});

test("missing config errors enumerate the supported aliases", () => {
  assert.throws(
    () => resolvePgConnectionString("write", {} as NodeJS.ProcessEnv),
    /POSTGRES_WRITE_URL, POSTGRES_URL, POSTGRES_URL_NON_POOLING, DATABASE_URL, NEON_DATABASE_URL/,
  );
  assert.throws(
    () => resolvePgConnectionString("read", {} as NodeJS.ProcessEnv),
    /POSTGRES_READ_URL, POSTGRES_WRITE_URL, POSTGRES_URL, POSTGRES_URL_NON_POOLING, DATABASE_URL, NEON_DATABASE_URL/,
  );
  assert.throws(
    () => resolveSharedChampionReconcileConnectionString({} as NodeJS.ProcessEnv),
    /POSTGRES_URL_NON_POOLING, DATABASE_URL_UNPOOLED, POSTGRES_WRITE_URL, POSTGRES_URL, DATABASE_URL, NEON_DATABASE_URL/,
  );
});

test("production admin stats auth fails closed when token is missing", () => {
  const request = new Request("https://example.com/api/admin/stats/overview", {
    headers: {
      authorization: "Bearer any-token",
    },
  });

  assert.deepEqual(
    authorizeStatsAdminRequest(request, {
      NODE_ENV: "production",
    } as NodeJS.ProcessEnv),
    {
      ok: false,
      status: 503,
      error: "Admin stats are unavailable. Configure STATS_ADMIN_TOKEN.",
    },
  );
});

test("schema maintenance includes shared_champion_runs and rollup views", async () => {
  const statements: string[] = [];
  const mockClient = {
    async query<T extends Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[] }> {
      statements.push(text);
      if (text.includes("information_schema.columns")) {
        const tableName = values?.[0];
        const columnName = values?.[1];
        if (tableName === "shared_champion_scores" && columnName === "score") {
          return { rows: [{ exists: false } as unknown as T] };
        }
        if (tableName === "shared_champion_scores" && columnName === "score_half_points") {
          return { rows: [{ exists: true } as unknown as T] };
        }
        if (tableName === "shared_champion_runs" && columnName === "score") {
          return { rows: [{ exists: false } as unknown as T] };
        }
        if (tableName === "shared_champion_runs" && columnName === "score_half_points") {
          return { rows: [{ exists: true } as unknown as T] };
        }
        return { rows: [{ exists: false } as unknown as T] };
      }
      return { rows: [] };
    },
  };

  await runSharedChampionSchemaMaintenance(mockClient);

  assert(statements.some((statement) => statement.includes("ALTER TABLE shared_champion_scores") && statement.includes("ADD COLUMN score INTEGER")));
  assert(statements.some((statement) => statement.includes("UPDATE shared_champion_scores") && statement.includes("score_half_points / 2.0")));
  assert(statements.some((statement) => statement.includes("DROP COLUMN IF EXISTS score_half_points")));
  assert(statements.some((statement) => statement.includes("DROP VIEW IF EXISTS shared_champion_daily_rollups_v1")));
  assert(statements.some((statement) => statement.includes("ALTER TABLE shared_champion_runs") && statement.includes("ADD COLUMN score INTEGER")));
  assert(statements.some((statement) => statement.includes("UPDATE shared_champion_runs") && statement.includes("score_half_points / 2.0")));
  assert(statements.some((statement) => statement.includes("CREATE TABLE IF NOT EXISTS shared_champion_runs")));
  assert(statements.some((statement) => statement.includes("CREATE OR REPLACE VIEW shared_champion_daily_rollups_v1")));
  assert(statements.some((statement) => statement.includes("CREATE OR REPLACE VIEW shared_champion_name_rollups_v1")));
  assert(statements.some((statement) => statement.includes("shared_champion_scores_holder_name_contract_v1")));
  assert(statements.some((statement) => statement.includes("shared_champion_run_tokens_player_name_contract_v1")));
  assert(statements.some((statement) => statement.includes("shared_champion_runs_player_name_contract_v1")));
  assert(statements.some((statement) => statement.includes("shared_champion_runs_player_name_key_contract_v1")));
});

test("constraint validation runs schema maintenance first and validates each name constraint", async () => {
  const statements: string[] = [];
  const originalConnect = Pool.prototype.connect;
  const originalEnd = Pool.prototype.end;

  const mockClient = {
    async query<T extends Record<string, unknown>>(text: string, values?: unknown[]): Promise<{ rows: T[] }> {
      statements.push(text);
      if (text.includes("information_schema.columns")) {
        const tableName = values?.[0];
        const columnName = values?.[1];
        if (tableName === "shared_champion_scores" && columnName === "score") {
          return { rows: [{ exists: true } as unknown as T] };
        }
        if (tableName === "shared_champion_scores" && columnName === "score_half_points") {
          return { rows: [{ exists: false } as unknown as T] };
        }
        if (tableName === "shared_champion_runs" && columnName === "score") {
          return { rows: [{ exists: true } as unknown as T] };
        }
        if (tableName === "shared_champion_runs" && columnName === "score_half_points") {
          return { rows: [{ exists: false } as unknown as T] };
        }
        return { rows: [{ exists: false } as unknown as T] };
      }
      if (text.includes("FROM pg_constraint")) {
        return { rows: [{ exists: true } as unknown as T] };
      }
      return { rows: [] };
    },
    release() {},
  };

  Pool.prototype.connect = async function connect() {
    return mockClient as unknown as PoolClient;
  };
  Pool.prototype.end = async function end() {
    return undefined as void;
  };

  try {
    const report = await validateSharedChampionConstraints({
      env: {
        POSTGRES_URL_NON_POOLING: "postgres://db.example.com/app?sslmode=require",
      } as NodeJS.ProcessEnv,
    });

    assert.deepEqual(report.validatedConstraints, [
      "shared_champion_scores_holder_name_contract_v1",
      "shared_champion_run_tokens_player_name_contract_v1",
      "shared_champion_runs_player_name_contract_v1",
      "shared_champion_runs_player_name_key_contract_v1",
    ]);
    assert.deepEqual(report.alreadyPresentConstraints, report.validatedConstraints);
    assert.equal(report.connectionEnvKey, "POSTGRES_URL_NON_POOLING");
    assert.equal(report.connectionSslModeBefore, "require");
    assert.equal(report.connectionSslModeAfter, "verify-full");
    assert(statements.some((statement) => statement.includes("CREATE TABLE IF NOT EXISTS shared_champion_runs")));
    assert(statements.some((statement) => statement.includes("VALIDATE CONSTRAINT shared_champion_scores_holder_name_contract_v1")));
    assert(statements.some((statement) => statement.includes("VALIDATE CONSTRAINT shared_champion_run_tokens_player_name_contract_v1")));
    assert(statements.some((statement) => statement.includes("VALIDATE CONSTRAINT shared_champion_runs_player_name_contract_v1")));
    assert(statements.some((statement) => statement.includes("VALIDATE CONSTRAINT shared_champion_runs_player_name_key_contract_v1")));
  } finally {
    Pool.prototype.connect = originalConnect;
    Pool.prototype.end = originalEnd;
  }
});

test("invalid admin stats playerName filters fail instead of mapping to Unknown", () => {
  assert.throws(
    () => parseStatsFilters(new URL("https://example.test/api/admin/stats/overview?playerName=Bad%3CName")),
    /playerName is invalid/,
  );
});

test("shared champion parsing rejects malformed stored names instead of coercing to Unknown", () => {
  assert.throws(
    () => createSharedChampion({
      holderName: "Bad<Name",
      score: 10,
      controlMode: "agent",
      updatedAt: "2026-03-08T00:00:00.000Z",
    }),
    /validated player name/i,
  );

  assert.equal(
    parseSharedChampion({
      holderName: "Bad<Name",
      score: 10,
      controlMode: "agent",
      updatedAt: "2026-03-08T00:00:00.000Z",
      scope: "sitewide",
    }),
    null,
  );
});

test("deriveRunFields rejects malformed stored player names", () => {
  assert.throws(
    () => deriveRunFields({
      playerName: "Bad<Name",
      mapId: "bazaar-map",
      summary: {
        survivalTimeS: 1,
        kills: 1,
        headshots: 0,
        headshotsPerWave: [0],
        shotsFired: 1,
        shotsHit: 1,
        accuracy: 100,
        finalScore: 5,
        deathCause: "enemy-fire",
      },
      score: 5,
      elapsedMs: 1000,
    }),
    /Invalid stored player name/,
  );
});

test("run finish rejects malformed legacy token names instead of returning 500", async () => {
  const champion = createSharedChampion({
    holderName: "Clean Champ",
    score: 77,
    controlMode: "agent",
    updatedAt: "2026-03-08T12:00:00.000Z",
  });
  const auditEvents: SharedChampionAuditEvent[] = [];
  let finalizeCalls = 0;
  const store = createSharedChampionStoreStub({
    async getChampion() {
      return champion;
    },
    async consumeRunToken() {
      return {
        status: "consumed" as const,
        record: {
          runId: "legacy-run",
          playerName: "Bad<Name",
          controlMode: "human" as const,
          mapId: "bazaar-map",
          issuedAt: "2026-03-08T00:00:00.000Z",
          expiresAt: "2026-03-08T00:30:00.000Z",
          claimedAt: "2026-03-08T00:00:01.000Z",
        },
      };
    },
    async finalizeValidatedRun() {
      finalizeCalls += 1;
      throw new Error("finalizeValidatedRun should not be called for malformed legacy names");
    },
    async recordAuditEvent(event) {
      auditEvents.push(event);
    },
  });

  const response = await handleSharedChampionRunFinishRequest(createRunFinishRequest(), store);
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), {
    accepted: false,
    updated: false,
    champion,
    reason: "invalid-run-token-player-name",
  });
  assert.equal(finalizeCalls, 0);
  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0]?.eventType, "run-finish");
  assert.equal(auditEvents[0]?.outcome, "rejected");
  assert.equal(auditEvents[0]?.runId, "legacy-run");
  assert.equal(auditEvents[0]?.reason, "invalid-run-token-player-name");
  assert.deepEqual(auditEvents[0]?.payload, {
    mapId: "bazaar-map",
    playerName: "Bad<Name",
    controlMode: "human",
  });
  assert.match(auditEvents[0]?.ipFingerprint ?? "", /^[0-9a-f]{64}$/);
  assert.match(auditEvents[0]?.userAgentFingerprint ?? "", /^[0-9a-f]{64}$/);
});

test("run finish normalizes valid legacy token names before finalizing", async () => {
  const finalizeStore = createInMemorySharedChampionStore();
  const auditEvents: SharedChampionAuditEvent[] = [];
  const finalizeInputs: Array<Parameters<SharedChampionStore["finalizeValidatedRun"]>[0]> = [];
  const store = createSharedChampionStoreStub({
    async consumeRunToken() {
      return {
        status: "consumed" as const,
        record: {
          runId: "normalized-run",
          playerName: "  Legacy   Name  ",
          controlMode: "agent" as const,
          mapId: "bazaar-map",
          issuedAt: "2026-03-08T00:00:00.000Z",
          expiresAt: "2026-03-08T00:30:00.000Z",
          claimedAt: "2026-03-08T00:00:01.000Z",
        },
      };
    },
    async finalizeValidatedRun(input) {
      finalizeInputs.push(input);
      return finalizeStore.finalizeValidatedRun(input);
    },
    async recordAuditEvent(event) {
      auditEvents.push(event);
    },
  });

  const response = await handleSharedChampionRunFinishRequest(createRunFinishRequest(), store);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    accepted: true,
    updated: true,
    champion: createSharedChampion({
      holderName: "Legacy Name",
      score: 5,
      controlMode: "agent",
      updatedAt: "2026-03-08T00:00:01.000Z",
    }),
    reason: null,
  });
  assert.equal(finalizeInputs.length, 1);
  assert.equal(finalizeInputs[0]?.tokenRecord.playerName, "Legacy Name");
  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0]?.outcome, "accepted");
  assert.deepEqual(auditEvents[0]?.payload, {
    playerName: "Legacy Name",
    controlMode: "agent",
    mapId: "bazaar-map",
    elapsedMs: 1000,
    score: 5,
    updated: true,
    runId: "normalized-run",
    summary: createValidRunFinishSummary(),
  });
});

test("backfill planning is conservative and idempotent", () => {
  const issuedAt = new Date("2026-03-07T20:13:59.000Z");
  const claimedAt = new Date("2026-03-07T20:14:23.829Z");
  const acceptedAudits = [
    {
      id: "53",
      run_id: "b312c727-6912-4dc4-87a6-9a5cdb92cc26",
      created_at: claimedAt,
      payload: {
        updated: true,
        elapsedMs: 6437,
        summary: {
          kills: 10,
          accuracy: 100,
          shotsHit: 10,
          headshots: 0,
          headshotsPerWave: [0],
          deathCause: "enemy-fire",
          finalScore: 50,
          shotsFired: 10,
          survivalTimeS: 6,
        },
      },
    },
    {
      id: "58",
      run_id: "already-present",
      created_at: new Date("2026-03-07T20:17:39.756Z"),
      payload: {
        updated: true,
        elapsedMs: 43998,
        summary: {
          kills: 9,
          accuracy: 31.4,
          shotsHit: 16,
          headshots: 9,
          deathCause: "enemy-fire",
          finalScore: 112.5,
          shotsFired: 51,
          survivalTimeS: 43.7,
        },
      },
    },
    {
      id: "65",
      run_id: "missing-token",
      created_at: new Date("2026-03-08T02:07:33.481Z"),
      payload: {
        updated: true,
        elapsedMs: 207267,
        summary: {
          kills: 46,
          accuracy: 38.2,
          shotsHit: 92,
          headshots: 45,
          deathCause: "enemy-fire",
          finalScore: 572.5,
          shotsFired: 241,
          survivalTimeS: 207,
        },
      },
    },
    {
      id: "66",
      run_id: "bad-payload",
      created_at: new Date("2026-03-08T02:08:00.000Z"),
      payload: {
        updated: true,
        elapsedMs: 1000,
        summary: {
          kills: 4,
        },
      },
    },
  ];

  const runTokensByRunId = new Map([
    [
      "b312c727-6912-4dc4-87a6-9a5cdb92cc26",
      {
        run_id: "b312c727-6912-4dc4-87a6-9a5cdb92cc26",
        player_name: "Dimitri",
        control_mode: "human" as const,
        map_id: "bazaar-map",
        issued_at: issuedAt,
        expires_at: new Date("2026-03-07T20:43:59.000Z"),
        claimed_at: claimedAt,
        created_ip_fingerprint: "created-ip",
        created_user_agent_fingerprint: "created-ua",
        claim_ip_fingerprint: "claim-ip",
        claim_user_agent_fingerprint: "claim-ua",
      },
    ],
    [
      "bad-payload",
      {
        run_id: "bad-payload",
        player_name: "Broken",
        control_mode: "human" as const,
        map_id: "bazaar-map",
        issued_at: new Date("2026-03-08T02:07:50.000Z"),
        expires_at: new Date("2026-03-08T02:37:50.000Z"),
        claimed_at: new Date("2026-03-08T02:08:00.000Z"),
        created_ip_fingerprint: "created-ip",
        created_user_agent_fingerprint: "created-ua",
        claim_ip_fingerprint: "claim-ip",
        claim_user_agent_fingerprint: "claim-ua",
      },
    ],
    [
      "bad-name",
      {
        run_id: "bad-name",
        player_name: "Bad<Name",
        control_mode: "human" as const,
        map_id: "bazaar-map",
        issued_at: new Date("2026-03-08T02:08:10.000Z"),
        expires_at: new Date("2026-03-08T02:38:10.000Z"),
        claimed_at: new Date("2026-03-08T02:08:20.000Z"),
        created_ip_fingerprint: "created-ip",
        created_user_agent_fingerprint: "created-ua",
        claim_ip_fingerprint: "claim-ip",
        claim_user_agent_fingerprint: "claim-ua",
      },
    ],
  ]);

  acceptedAudits.push({
    id: "67",
    run_id: "bad-name",
    created_at: new Date("2026-03-08T02:08:20.000Z"),
    payload: {
      updated: true,
      elapsedMs: 1000,
      summary: {
        kills: 1,
        accuracy: 100,
        shotsHit: 1,
        headshots: 0,
        headshotsPerWave: [0],
        deathCause: "enemy-fire",
        finalScore: 5,
        shotsFired: 1,
        survivalTimeS: 1,
      },
    },
  });

  const report = planSharedChampionAcceptedRunBackfill({
    acceptedAudits,
    runTokensByRunId,
    existingRunIds: new Set(["already-present"]),
  });

  assert.equal(report.insertedRuns, 1);
  assert.equal(report.skippedExistingRuns, 1);
  assert.equal(report.orphanedAcceptedFinishes, 1);
  assert.equal(report.malformedAcceptedFinishes, 2);
  assert.deepEqual(report.insertedRunIds, ["b312c727-6912-4dc4-87a6-9a5cdb92cc26"]);
  assert.deepEqual(report.skippedRunIds, ["already-present"]);
  assert.deepEqual(report.orphanedRunIds, ["missing-token"]);
  assert.deepEqual(report.malformedRunIds, ["bad-payload", "bad-name"]);
  assert.equal(report.inserts.length, 1);
  assert.equal(report.inserts[0]?.buildId, null);
  assert.equal(report.inserts[0]?.createdAt, claimedAt.toISOString());
  assert.equal(report.inserts[0]?.playerName, "Dimitri");
  assert.equal(report.inserts[0]?.score, 50);
  assert.equal(report.inserts[0]?.clientIpFingerprint, "claim-ip");
  assert.equal(report.inserts[0]?.userAgentFingerprint, "claim-ua");
});
