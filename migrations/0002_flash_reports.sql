CREATE TABLE IF NOT EXISTS flash_report_requests (
  id TEXT PRIMARY KEY,
  poll_hash TEXT NOT NULL,
  approval_hash TEXT NOT NULL,
  upload_hash TEXT,
  download_hash TEXT,
  scope TEXT,
  state TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  request_expires INTEGER NOT NULL,
  upload_expires INTEGER,
  uploaded_at INTEGER,
  object_key TEXT,
  byte_length INTEGER,
  sha256 TEXT,
  ip_hash TEXT,
  notified INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS flash_report_requests_created ON flash_report_requests(created_at);
CREATE INDEX IF NOT EXISTS flash_report_requests_ip ON flash_report_requests(ip_hash, created_at);
