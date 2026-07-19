-- D1 schema - replaces the local dashboard's backend/data/*.json files.
-- Payloads are kept as JSON text columns (matching the source files' own shape) rather than
-- fully normalized tables, to keep the one-time migration script a straight copy - no need to
-- redesign the data model, just move where it lives.

CREATE TABLE IF NOT EXISTS payment_policies (
  project_id TEXT PRIMARY KEY,
  reviewed INTEGER NOT NULL DEFAULT 0,
  milestones_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS attendance_overrides (
  logger_id TEXT NOT NULL,
  month_key TEXT NOT NULL,
  vacation_days INTEGER NOT NULL DEFAULT 0,
  sick_days INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (logger_id, month_key)
);

CREATE TABLE IF NOT EXISTS workload_volume_cache (
  cycle_key INTEGER PRIMARY KEY,
  computed_at TEXT NOT NULL,
  data_json TEXT NOT NULL
);

-- Layer 3 (see PLAN.md): who's allowed to reach the dashboard through the Worker at all.
CREATE TABLE IF NOT EXISTS authorized_users (
  email TEXT PRIMARY KEY,
  name TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);
