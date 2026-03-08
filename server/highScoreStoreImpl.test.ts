import assert from "node:assert/strict";
import test from "node:test";

import { authorizeStatsAdminRequest } from "./highScoreSecurity.js";
import {
  planSharedChampionAcceptedRunBackfill,
  resolvePgConnectionSelection,
  resolvePgConnectionString,
  resolveSharedChampionReconcileConnectionString,
  runSharedChampionSchemaMaintenance,
} from "./highScoreStoreImpl.js";

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
    async query<T extends Record<string, unknown>>(text: string): Promise<{ rows: T[] }> {
      statements.push(text);
      if (text.includes("information_schema.columns")) {
        return { rows: [{ exists: false } as unknown as T] };
      }
      return { rows: [] };
    },
  };

  await runSharedChampionSchemaMaintenance(mockClient);

  assert(statements.some((statement) => statement.includes("CREATE TABLE IF NOT EXISTS shared_champion_runs")));
  assert(statements.some((statement) => statement.includes("CREATE OR REPLACE VIEW shared_champion_daily_rollups_v1")));
  assert(statements.some((statement) => statement.includes("CREATE OR REPLACE VIEW shared_champion_name_rollups_v1")));
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
          headshotsPerWave: [0, 0],
          deathCause: "enemy-fire",
          finalScore: 52,
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
  ]);

  const report = planSharedChampionAcceptedRunBackfill({
    acceptedAudits,
    runTokensByRunId,
    existingRunIds: new Set(["already-present"]),
  });

  assert.equal(report.insertedRuns, 1);
  assert.equal(report.skippedExistingRuns, 1);
  assert.equal(report.orphanedAcceptedFinishes, 1);
  assert.equal(report.malformedAcceptedFinishes, 1);
  assert.deepEqual(report.insertedRunIds, ["b312c727-6912-4dc4-87a6-9a5cdb92cc26"]);
  assert.deepEqual(report.skippedRunIds, ["already-present"]);
  assert.deepEqual(report.orphanedRunIds, ["missing-token"]);
  assert.deepEqual(report.malformedRunIds, ["bad-payload"]);
  assert.equal(report.inserts.length, 1);
  assert.equal(report.inserts[0]?.buildId, null);
  assert.equal(report.inserts[0]?.createdAt, claimedAt.toISOString());
  assert.equal(report.inserts[0]?.playerName, "Dimitri");
  assert.equal(report.inserts[0]?.score, 52);
  assert.equal(report.inserts[0]?.clientIpFingerprint, "claim-ip");
  assert.equal(report.inserts[0]?.userAgentFingerprint, "claim-ua");
});
