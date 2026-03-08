CREATE TABLE IF NOT EXISTS shared_champion_scores (
  board_key TEXT PRIMARY KEY,
  score INTEGER NOT NULL CHECK (score >= 0),
  holder_name VARCHAR(15) NOT NULL,
  holder_mode TEXT NOT NULL CHECK (holder_mode IN ('human', 'agent')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS champion_submissions_log (
  id SERIAL PRIMARY KEY,
  client_ip_fingerprint TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submissions_ip_fingerprint_time
ON champion_submissions_log (client_ip_fingerprint, submitted_at);

CREATE TABLE IF NOT EXISTS shared_champion_run_tokens (
  run_id UUID PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  player_name VARCHAR(15) NOT NULL,
  control_mode TEXT NOT NULL CHECK (control_mode IN ('human', 'agent')),
  map_id VARCHAR(64) NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  created_ip_fingerprint TEXT,
  created_user_agent_fingerprint TEXT,
  claim_ip_fingerprint TEXT,
  claim_user_agent_fingerprint TEXT
);

CREATE INDEX IF NOT EXISTS idx_shared_champion_run_tokens_expires_at
  ON shared_champion_run_tokens (expires_at);

CREATE TABLE IF NOT EXISTS shared_champion_run_audit (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  outcome TEXT NOT NULL,
  run_id UUID,
  ip_fingerprint TEXT,
  user_agent_fingerprint TEXT,
  reason TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shared_champion_runs (
  run_id UUID PRIMARY KEY,
  player_name VARCHAR(15) NOT NULL,
  player_name_key VARCHAR(15) NOT NULL,
  control_mode TEXT NOT NULL CHECK (control_mode IN ('human', 'agent')),
  map_id VARCHAR(64) NOT NULL,
  ruleset TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  elapsed_ms INTEGER NOT NULL CHECK (elapsed_ms >= 0),
  score INTEGER NOT NULL CHECK (score >= 0),
  kills INTEGER NOT NULL CHECK (kills >= 0),
  headshots INTEGER NOT NULL CHECK (headshots >= 0),
  shots_fired INTEGER NOT NULL CHECK (shots_fired >= 0),
  shots_hit INTEGER NOT NULL CHECK (shots_hit >= 0),
  accuracy_pct DOUBLE PRECISION NOT NULL CHECK (accuracy_pct >= 0),
  waves_cleared INTEGER NOT NULL CHECK (waves_cleared >= 0),
  wave_reached INTEGER NOT NULL CHECK (wave_reached >= 1),
  death_cause TEXT CHECK (death_cause IN ('enemy-fire', 'unknown')),
  champion_updated BOOLEAN NOT NULL,
  build_id VARCHAR(128),
  client_ip_fingerprint TEXT,
  user_agent_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shared_champion_runs_created_at
  ON shared_champion_runs (created_at DESC, run_id DESC);
CREATE INDEX IF NOT EXISTS idx_shared_champion_runs_player_name_key
  ON shared_champion_runs (player_name_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_champion_runs_map_id
  ON shared_champion_runs (map_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_champion_runs_champion_updated
  ON shared_champion_runs (champion_updated, created_at DESC);

CREATE OR REPLACE VIEW shared_champion_daily_rollups_v1 AS
SELECT
  TO_CHAR(DATE_TRUNC('day', ended_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
  COUNT(*)::BIGINT AS total_runs,
  SUM(CASE WHEN champion_updated THEN 1 ELSE 0 END)::BIGINT AS champion_updates,
  COUNT(DISTINCT player_name_key)::BIGINT AS unique_player_names,
  SUM(CASE WHEN control_mode = 'human' THEN 1 ELSE 0 END)::BIGINT AS human_runs,
  SUM(CASE WHEN control_mode = 'agent' THEN 1 ELSE 0 END)::BIGINT AS agent_runs,
  MAX(score)::INTEGER AS best_score,
  AVG(score)::DOUBLE PRECISION AS average_score,
  AVG(accuracy_pct)::DOUBLE PRECISION AS average_accuracy_pct
FROM shared_champion_runs
GROUP BY 1;

CREATE OR REPLACE VIEW shared_champion_name_rollups_v1 AS
SELECT
  player_name_key,
  MIN(player_name) AS player_name,
  COUNT(*)::BIGINT AS total_runs,
  SUM(CASE WHEN champion_updated THEN 1 ELSE 0 END)::BIGINT AS champion_updates,
  SUM(CASE WHEN control_mode = 'human' THEN 1 ELSE 0 END)::BIGINT AS human_runs,
  SUM(CASE WHEN control_mode = 'agent' THEN 1 ELSE 0 END)::BIGINT AS agent_runs,
  MAX(score)::INTEGER AS best_score,
  AVG(score)::DOUBLE PRECISION AS average_score,
  AVG(accuracy_pct)::DOUBLE PRECISION AS average_accuracy_pct,
  MAX(created_at) AS latest_run_at
FROM shared_champion_runs
GROUP BY player_name_key;
