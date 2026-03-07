import { attachDatabasePool } from "@vercel/functions";
import { Pool, type PoolConfig } from "pg";
import {
  HIGH_SCORE_MAP_ID_MAX_LENGTH,
  SITEWIDE_CHAMPION_BOARD_KEY,
  createSharedChampion,
  normalizeScoreHalfPoints,
  sanitizeSharedChampionMapId,
  sanitizeSharedChampionName,
  type SharedChampion,
  type SharedChampionControlMode,
  type SharedChampionPostRequest,
} from "../apps/shared/highScore.js";

const CREATE_HIGH_SCORE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS shared_champion_scores (
    board_key TEXT PRIMARY KEY,
    score_half_points INTEGER NOT NULL CHECK (score_half_points >= 0),
    holder_name VARCHAR(15) NOT NULL,
    holder_mode TEXT NOT NULL CHECK (holder_mode IN ('human', 'agent')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const CREATE_SUBMISSIONS_LOG_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS champion_submissions_log (
    id SERIAL PRIMARY KEY,
    client_ip TEXT NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const CREATE_SUBMISSIONS_LOG_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_submissions_ip_time
  ON champion_submissions_log (client_ip, submitted_at);
`;

const RATE_LIMIT_CHECK_SQL = `
  SELECT COUNT(*) AS recent
  FROM champion_submissions_log
  WHERE client_ip = $1 AND submitted_at > NOW() - INTERVAL '30 seconds';
`;

const RATE_LIMIT_INSERT_SQL = `
  INSERT INTO champion_submissions_log (client_ip) VALUES ($1);
`;

const RATE_LIMIT_CLEANUP_SQL = `
  DELETE FROM champion_submissions_log WHERE submitted_at < NOW() - INTERVAL '1 hour';
`;

const CREATE_RUN_TOKEN_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS shared_champion_run_tokens (
    run_id UUID PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    player_name VARCHAR(15) NOT NULL,
    control_mode TEXT NOT NULL CHECK (control_mode IN ('human', 'agent')),
    map_id VARCHAR(${HIGH_SCORE_MAP_ID_MAX_LENGTH}) NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    claimed_at TIMESTAMPTZ,
    created_ip_hash TEXT,
    created_user_agent TEXT,
    claim_ip_hash TEXT,
    claim_user_agent TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_shared_champion_run_tokens_expires_at
    ON shared_champion_run_tokens (expires_at);
`;

const CREATE_AUDIT_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS shared_champion_run_audit (
    id BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,
    outcome TEXT NOT NULL,
    run_id UUID,
    ip_hash TEXT,
    user_agent TEXT,
    reason TEXT,
    payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const SELECT_CHAMPION_SQL = `
  SELECT score_half_points, holder_name, holder_mode, updated_at
  FROM shared_champion_scores
  WHERE board_key = $1
  LIMIT 1;
`;

const UPSERT_CHAMPION_SQL = `
  WITH attempted AS (
    INSERT INTO shared_champion_scores AS scores (
      board_key,
      score_half_points,
      holder_name,
      holder_mode
    )
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (board_key) DO UPDATE
    SET
      score_half_points = EXCLUDED.score_half_points,
      holder_name = EXCLUDED.holder_name,
      holder_mode = EXCLUDED.holder_mode,
      updated_at = NOW()
    WHERE EXCLUDED.score_half_points > scores.score_half_points
    RETURNING score_half_points, holder_name, holder_mode, updated_at, TRUE AS updated
  )
  SELECT score_half_points, holder_name, holder_mode, updated_at, updated
  FROM attempted
  UNION ALL
  SELECT score_half_points, holder_name, holder_mode, updated_at, FALSE AS updated
  FROM shared_champion_scores
  WHERE board_key = $1
    AND NOT EXISTS (SELECT 1 FROM attempted)
  LIMIT 1;
`;

const INSERT_RUN_TOKEN_SQL = `
  INSERT INTO shared_champion_run_tokens (
    run_id,
    token_hash,
    player_name,
    control_mode,
    map_id,
    expires_at,
    created_ip_hash,
    created_user_agent
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  RETURNING run_id, player_name, control_mode, map_id, issued_at, expires_at, claimed_at;
`;

const CLAIM_RUN_TOKEN_SQL = `
  UPDATE shared_champion_run_tokens
  SET
    claimed_at = NOW(),
    claim_ip_hash = $2,
    claim_user_agent = $3
  WHERE token_hash = $1
    AND claimed_at IS NULL
    AND expires_at > NOW()
  RETURNING run_id, player_name, control_mode, map_id, issued_at, expires_at, claimed_at;
`;

const SELECT_RUN_TOKEN_SQL = `
  SELECT run_id, player_name, control_mode, map_id, issued_at, expires_at, claimed_at
  FROM shared_champion_run_tokens
  WHERE token_hash = $1
  LIMIT 1;
`;

const INSERT_AUDIT_EVENT_SQL = `
  INSERT INTO shared_champion_run_audit (
    event_type,
    outcome,
    run_id,
    ip_hash,
    user_agent,
    reason,
    payload
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb);
`;

type ChampionRow = {
  score_half_points: number;
  holder_name: string;
  holder_mode: SharedChampionControlMode;
  updated_at: Date;
};

type ChampionMutationRow = ChampionRow & {
  updated: boolean;
};

type RunTokenRow = {
  run_id: string;
  player_name: string;
  control_mode: SharedChampionControlMode;
  map_id: string;
  issued_at: Date;
  expires_at: Date;
  claimed_at: Date | null;
};

export type SharedChampionRunTokenRecord = {
  runId: string;
  playerName: string;
  controlMode: SharedChampionControlMode;
  mapId: string;
  issuedAt: string;
  expiresAt: string;
  claimedAt: string | null;
};

export type SharedChampionAuditEvent = {
  eventType: string;
  outcome: "accepted" | "rejected";
  runId?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
  reason?: string | null;
  payload?: unknown;
};

export type SharedChampionStore = {
  getChampion: () => Promise<SharedChampion | null>;
  submitCandidate: (input: SharedChampionPostRequest) => Promise<{
    updated: boolean;
    champion: SharedChampion | null;
  }>;
  isRateLimited: (clientIp: string) => Promise<boolean>;
  logSubmission: (clientIp: string) => Promise<void>;
  issueRunToken: (input: {
    runId: string;
    tokenHash: string;
    playerName: string;
    controlMode: SharedChampionControlMode;
    mapId: string;
    expiresAt: Date;
    clientIpHash: string | null;
    userAgent: string | null;
  }) => Promise<SharedChampionRunTokenRecord>;
  consumeRunToken: (input: {
    tokenHash: string;
    clientIpHash: string | null;
    userAgent: string | null;
  }) => Promise<{
    status: "consumed" | "missing" | "expired" | "used";
    record: SharedChampionRunTokenRecord | null;
  }>;
  recordAuditEvent: (event: SharedChampionAuditEvent) => Promise<void>;
};

type InMemoryRunTokenRecord = SharedChampionRunTokenRecord & {
  tokenHash: string;
};

function mapRowToChampion(row: ChampionRow): SharedChampion {
  return createSharedChampion({
    holderName: row.holder_name,
    scoreHalfPoints: row.score_half_points,
    controlMode: row.holder_mode,
    updatedAt: row.updated_at,
  });
}

function mapRunTokenRow(row: RunTokenRow): SharedChampionRunTokenRecord {
  return {
    runId: row.run_id,
    playerName: row.player_name,
    controlMode: row.control_mode,
    mapId: row.map_id,
    issuedAt: row.issued_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    claimedAt: row.claimed_at ? row.claimed_at.toISOString() : null,
  };
}

function normalizeSubmission(input: SharedChampionPostRequest): SharedChampionPostRequest {
  return {
    playerName: sanitizeSharedChampionName(input.playerName, input.controlMode),
    scoreHalfPoints: normalizeScoreHalfPoints(input.scoreHalfPoints),
    controlMode: input.controlMode,
    ...(input.telemetry ? { telemetry: input.telemetry } : {}),
  };
}

function normalizeRunTokenInput(input: {
  runId: string;
  tokenHash: string;
  playerName: string;
  controlMode: SharedChampionControlMode;
  mapId: string;
  expiresAt: Date;
  clientIpHash: string | null;
  userAgent: string | null;
}) {
  return {
    runId: input.runId,
    tokenHash: input.tokenHash.trim(),
    playerName: sanitizeSharedChampionName(input.playerName, input.controlMode),
    controlMode: input.controlMode,
    mapId: sanitizeSharedChampionMapId(input.mapId),
    expiresAt: input.expiresAt,
    clientIpHash: input.clientIpHash,
    userAgent: input.userAgent?.trim() ? input.userAgent.trim().slice(0, 512) : null,
  };
}

export function createInMemorySharedChampionStore(): SharedChampionStore {
  let champion: SharedChampion | null = null;
  const runTokens = new Map<string, InMemoryRunTokenRecord>();
  const auditEvents: SharedChampionAuditEvent[] = [];

  return {
    async getChampion() {
      return champion;
    },
    async submitCandidate(input) {
      const normalized = normalizeSubmission(input);
      const nextChampion = createSharedChampion({
        holderName: normalized.playerName,
        scoreHalfPoints: normalized.scoreHalfPoints,
        controlMode: normalized.controlMode,
        updatedAt: new Date(),
      });

      if (!champion || normalized.scoreHalfPoints > champion.scoreHalfPoints) {
        champion = nextChampion;
        return {
          updated: true,
          champion,
        };
      }

      return {
        updated: false,
        champion,
      };
    },
    async isRateLimited() {
      // In-memory store is dev/test only — skip rate limiting
      return false;
    },
    async logSubmission() {
      // No-op in dev/test
    },
    async issueRunToken(input) {
      const normalized = normalizeRunTokenInput(input);
      const issuedAt = new Date();
      const record: InMemoryRunTokenRecord = {
        runId: normalized.runId,
        tokenHash: normalized.tokenHash,
        playerName: normalized.playerName,
        controlMode: normalized.controlMode,
        mapId: normalized.mapId,
        issuedAt: issuedAt.toISOString(),
        expiresAt: normalized.expiresAt.toISOString(),
        claimedAt: null,
      };
      runTokens.set(normalized.tokenHash, record);
      return {
        runId: record.runId,
        playerName: record.playerName,
        controlMode: record.controlMode,
        mapId: record.mapId,
        issuedAt: record.issuedAt,
        expiresAt: record.expiresAt,
        claimedAt: record.claimedAt,
      };
    },
    async consumeRunToken(input) {
      const tokenHash = input.tokenHash.trim();
      const record = runTokens.get(tokenHash) ?? null;
      if (!record) {
        return {
          status: "missing" as const,
          record: null,
        };
      }

      if (record.claimedAt !== null) {
        return {
          status: "used" as const,
          record: {
            runId: record.runId,
            playerName: record.playerName,
            controlMode: record.controlMode,
            mapId: record.mapId,
            issuedAt: record.issuedAt,
            expiresAt: record.expiresAt,
            claimedAt: record.claimedAt,
          },
        };
      }

      if (Date.parse(record.expiresAt) <= Date.now()) {
        return {
          status: "expired" as const,
          record: {
            runId: record.runId,
            playerName: record.playerName,
            controlMode: record.controlMode,
            mapId: record.mapId,
            issuedAt: record.issuedAt,
            expiresAt: record.expiresAt,
            claimedAt: record.claimedAt,
          },
        };
      }

      record.claimedAt = new Date().toISOString();
      return {
        status: "consumed" as const,
        record: {
          runId: record.runId,
          playerName: record.playerName,
          controlMode: record.controlMode,
          mapId: record.mapId,
          issuedAt: record.issuedAt,
          expiresAt: record.expiresAt,
          claimedAt: record.claimedAt,
        },
      };
    },
    async recordAuditEvent(event) {
      auditEvents.push(event);
    },
  };
}

function hasPgConnectionString(): boolean {
  return [
    process.env.POSTGRES_URL,
    process.env.DATABASE_URL,
    process.env.NEON_DATABASE_URL,
  ].some((value) => typeof value === "string" && value.trim().length > 0);
}

function resolvePgConnectionString(): string {
  const connectionString = process.env.POSTGRES_URL
    ?? process.env.DATABASE_URL
    ?? process.env.NEON_DATABASE_URL
    ?? "";

  if (connectionString.trim().length === 0) {
    throw new Error(
      "Missing Postgres connection string. Configure Vercel Marketplace Postgres (Neon recommended) and expose POSTGRES_URL or DATABASE_URL.",
    );
  }

  return connectionString;
}

function resolveSslConfig(connectionString: string): PoolConfig["ssl"] {
  try {
    const parsedUrl = new URL(connectionString);
    const sslMode = parsedUrl.searchParams.get("sslmode")?.trim().toLowerCase();
    const isLocalHost = parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1";
    if (sslMode === "disable" || isLocalHost) return undefined;
    return { rejectUnauthorized: true };
  } catch {
    return { rejectUnauthorized: true };
  }
}

let pool: Pool | null = null;
let schemaReadyPromise: Promise<void> | null = null;

function getPool(): Pool {
  if (pool) return pool;

  const connectionString = resolvePgConnectionString();
  pool = new Pool({
    connectionString,
    max: 4,
    idleTimeoutMillis: 5_000,
    ssl: resolveSslConfig(connectionString),
  });
  attachDatabasePool(pool);
  return pool;
}

async function ensureSchemaReady(): Promise<void> {
  if (schemaReadyPromise) {
    return schemaReadyPromise;
  }

  schemaReadyPromise = (async () => {
    const p = getPool();
    await p.query(CREATE_HIGH_SCORE_TABLE_SQL);
    await p.query(CREATE_SUBMISSIONS_LOG_TABLE_SQL);
    await p.query(CREATE_SUBMISSIONS_LOG_INDEX_SQL);
    await p.query(CREATE_RUN_TOKEN_TABLE_SQL);
    await p.query(CREATE_AUDIT_TABLE_SQL);
  })().catch((error) => {
    schemaReadyPromise = null;
    throw error;
  });

  return schemaReadyPromise;
}

export function hasConfiguredSharedChampionDatabase(): boolean {
  return hasPgConnectionString();
}

export function createPostgresSharedChampionStore(): SharedChampionStore {
  return {
    async getChampion() {
      await ensureSchemaReady();
      const result = await getPool().query<ChampionRow>(SELECT_CHAMPION_SQL, [SITEWIDE_CHAMPION_BOARD_KEY]);
      const row = result.rows[0];
      return row ? mapRowToChampion(row) : null;
    },
    async submitCandidate(input) {
      await ensureSchemaReady();
      const normalized = normalizeSubmission(input);
      const result = await getPool().query<ChampionMutationRow>(UPSERT_CHAMPION_SQL, [
        SITEWIDE_CHAMPION_BOARD_KEY,
        normalized.scoreHalfPoints,
        normalized.playerName,
        normalized.controlMode,
      ]);
      const row = result.rows[0] ?? null;
      return {
        updated: row?.updated === true,
        champion: row ? mapRowToChampion(row) : null,
      };
    },
    async isRateLimited(clientIp) {
      await ensureSchemaReady();
      const result = await getPool().query<{ recent: string }>(RATE_LIMIT_CHECK_SQL, [clientIp]);
      const recent = parseInt(result.rows[0]?.recent ?? "0", 10);
      return recent > 0;
    },
    async logSubmission(clientIp) {
      await ensureSchemaReady();
      await getPool().query(RATE_LIMIT_INSERT_SQL, [clientIp]);
      // Best-effort cleanup of old entries
      getPool().query(RATE_LIMIT_CLEANUP_SQL).catch(() => {});
    },
    async issueRunToken(input) {
      await ensureSchemaReady();
      const normalized = normalizeRunTokenInput(input);
      const result = await getPool().query<RunTokenRow>(INSERT_RUN_TOKEN_SQL, [
        normalized.runId,
        normalized.tokenHash,
        normalized.playerName,
        normalized.controlMode,
        normalized.mapId,
        normalized.expiresAt,
        normalized.clientIpHash,
        normalized.userAgent,
      ]);
      const row = result.rows[0];
      if (!row) {
        throw new Error("Failed to issue shared champion run token.");
      }
      return mapRunTokenRow(row);
    },
    async consumeRunToken(input) {
      await ensureSchemaReady();
      const normalizedTokenHash = input.tokenHash.trim();
      const result = await getPool().query<RunTokenRow>(CLAIM_RUN_TOKEN_SQL, [
        normalizedTokenHash,
        input.clientIpHash,
        input.userAgent?.trim() ? input.userAgent.trim().slice(0, 512) : null,
      ]);
      const consumed = result.rows[0];
      if (consumed) {
        return {
          status: "consumed" as const,
          record: mapRunTokenRow(consumed),
        };
      }

      const lookup = await getPool().query<RunTokenRow>(SELECT_RUN_TOKEN_SQL, [normalizedTokenHash]);
      const row = lookup.rows[0] ?? null;
      if (!row) {
        return {
          status: "missing" as const,
          record: null,
        };
      }

      if (row.claimed_at !== null) {
        return {
          status: "used" as const,
          record: mapRunTokenRow(row),
        };
      }

      if (row.expires_at.getTime() <= Date.now()) {
        return {
          status: "expired" as const,
          record: mapRunTokenRow(row),
        };
      }

      return {
        status: "used" as const,
        record: mapRunTokenRow(row),
      };
    },
    async recordAuditEvent(event) {
      await ensureSchemaReady();
      await getPool().query(INSERT_AUDIT_EVENT_SQL, [
        event.eventType,
        event.outcome,
        event.runId ?? null,
        event.ipHash ?? null,
        event.userAgent ?? null,
        event.reason ?? null,
        JSON.stringify(event.payload ?? null),
      ]);
    },
  };
}
