CREATE TABLE IF NOT EXISTS shared_champion_scores (
  board_key TEXT PRIMARY KEY,
  score_half_points INTEGER NOT NULL CHECK (score_half_points >= 0),
  holder_name VARCHAR(15) NOT NULL,
  holder_mode TEXT NOT NULL CHECK (holder_mode IN ('human', 'agent')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS champion_submissions_log (
  id SERIAL PRIMARY KEY,
  client_ip TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submissions_ip_time
ON champion_submissions_log (client_ip, submitted_at);

CREATE TABLE IF NOT EXISTS shared_champion_run_tokens (
  run_id UUID PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  player_name VARCHAR(15) NOT NULL,
  control_mode TEXT NOT NULL CHECK (control_mode IN ('human', 'agent')),
  map_id VARCHAR(64) NOT NULL,
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
