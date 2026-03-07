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
