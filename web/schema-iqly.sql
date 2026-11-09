-- iQLY activation postbacks. Safe to run on an existing D1.
ALTER TABLE players ADD COLUMN iqly_code TEXT;

CREATE TABLE IF NOT EXISTS iqly_events (
  player_id TEXT NOT NULL,
  event TEXT NOT NULL,
  txn_id TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  status TEXT,
  PRIMARY KEY (player_id, event)
);
