import { attachDatabasePool } from "@vercel/functions";
import { Pool, type PoolConfig } from "pg";
import {
  SITEWIDE_CHAMPION_BOARD_KEY,
  createSharedChampion,
  normalizeScoreHalfPoints,
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

type ChampionRow = {
  score_half_points: number;
  holder_name: string;
  holder_mode: SharedChampionControlMode;
  updated_at: Date;
};

type ChampionMutationRow = ChampionRow & {
  updated: boolean;
};

export type SharedChampionStore = {
  getChampion: () => Promise<SharedChampion | null>;
  submitCandidate: (input: SharedChampionPostRequest) => Promise<{
    updated: boolean;
    champion: SharedChampion | null;
  }>;
  isRateLimited: (clientIp: string) => Promise<boolean>;
  logSubmission: (clientIp: string) => Promise<void>;
};

function mapRowToChampion(row: ChampionRow): SharedChampion {
  return createSharedChampion({
    holderName: row.holder_name,
    scoreHalfPoints: row.score_half_points,
    controlMode: row.holder_mode,
    updatedAt: row.updated_at,
  });
}

function normalizeSubmission(input: SharedChampionPostRequest): SharedChampionPostRequest {
  return {
    playerName: sanitizeSharedChampionName(input.playerName, input.controlMode),
    scoreHalfPoints: normalizeScoreHalfPoints(input.scoreHalfPoints),
    controlMode: input.controlMode,
    telemetry: input.telemetry,
  };
}

export function createInMemorySharedChampionStore(): SharedChampionStore {
  let champion: SharedChampion | null = null;

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
  };
}
