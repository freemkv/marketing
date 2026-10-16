CREATE TABLE IF NOT EXISTS firmware_confirmations (
  person TEXT NOT NULL,
  target TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  confirmed_at INTEGER NOT NULL,
  PRIMARY KEY (person, target, source)
);
CREATE INDEX IF NOT EXISTS firmware_confirmations_target ON firmware_confirmations(target, source);
CREATE TABLE IF NOT EXISTS firmware_challenges (
  id TEXT PRIMARY KEY,
  person TEXT NOT NULL,
  target TEXT NOT NULL,
  source TEXT NOT NULL,
  code_mac TEXT NOT NULL,
  expires INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  state INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS firmware_challenges_expiry ON firmware_challenges(expires);
CREATE TABLE IF NOT EXISTS firmware_verification_limits (
  key TEXT PRIMARY KEY,
  bucket INTEGER NOT NULL,
  count INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS firmware_verification_sessions (
  token_mac TEXT PRIMARY KEY,
  person TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS firmware_verification_sessions_expiry ON firmware_verification_sessions(expires);
