PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','open','closed')),
  budget INTEGER,
  opens_at TEXT,
  christmas_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE,
  code_hash TEXT NOT NULL,
  assigned_to INTEGER REFERENCES participants(id),
  opened_at TEXT,
  wishlist TEXT NOT NULL DEFAULT '',
  UNIQUE(round_id,name)
);
CREATE TABLE IF NOT EXISTS exclusions (
  round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  giver_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  receiver_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  PRIMARY KEY(round_id,giver_id,receiver_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('admin','guest')),
  participant_id INTEGER REFERENCES participants(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_participants_round ON participants(round_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS login_attempts (
  id TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
