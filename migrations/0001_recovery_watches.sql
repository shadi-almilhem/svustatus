CREATE TABLE IF NOT EXISTS recovery_watches (
  id TEXT PRIMARY KEY,
  monitor_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  notified_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS recovery_watches_endpoint_monitor_idx
  ON recovery_watches(endpoint, monitor_id);

CREATE INDEX IF NOT EXISTS recovery_watches_pending_idx
  ON recovery_watches(monitor_id, notified_at, expires_at);
