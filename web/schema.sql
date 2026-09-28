CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  pass_hash TEXT,
  created_at INTEGER NOT NULL,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  kills INTEGER NOT NULL DEFAULT 0,
  best INTEGER,
  solo_wins INTEGER NOT NULL DEFAULT 0,
  solo_losses INTEGER NOT NULL DEFAULT 0,
  solo_draws INTEGER NOT NULL DEFAULT 0,
  google TEXT
);

CREATE INDEX IF NOT EXISTS players_rank ON players (wins DESC, losses ASC);
CREATE UNIQUE INDEX IF NOT EXISTS players_google ON players (google);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_player ON sessions (player_id);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  room TEXT NOT NULL,
  p1 TEXT NOT NULL,
  p2 TEXT NOT NULL,
  winner TEXT,
  reason TEXT NOT NULL,
  volleys INTEGER NOT NULL,
  started_at INTEGER,
  ended_at INTEGER NOT NULL,
  log TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS matches_p1 ON matches (p1, ended_at);
CREATE INDEX IF NOT EXISTS matches_p2 ON matches (p2, ended_at);
