CREATE TABLE IF NOT EXISTS status_checks (
  monitor_id TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  url TEXT NOT NULL,
  ok INTEGER NOT NULL,
  status INTEGER,
  latency_ms INTEGER,
  attempt INTEGER NOT NULL,
  error TEXT,
  PRIMARY KEY (monitor_id, checked_at)
);

CREATE INDEX IF NOT EXISTS idx_status_checks_checked_at
  ON status_checks (checked_at);
