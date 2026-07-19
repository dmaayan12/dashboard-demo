-- Write-once weekly freeze of "נפח עבודה צפוי"'s monthly target/actual figures - see
-- paceTargetSnapshotStore.js for the full reasoning. One row per (week, project, month), never
-- updated once written.
CREATE TABLE IF NOT EXISTS pace_target_snapshot (
  week_key INTEGER NOT NULL,
  project_id TEXT NOT NULL,
  month_key TEXT NOT NULL,
  target REAL NOT NULL,
  actual REAL NOT NULL,
  PRIMARY KEY (week_key, project_id, month_key)
);
