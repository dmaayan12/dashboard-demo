-- Round 6, Part B + Part C (see PLAN.md) - freezing historical monthly targets for milestone
-- projects, and tracking real schedule-change dates from monday's own activity logs.

-- Part B - one row per (project, month): the "יעד חודשי" (pace-target %) value locked in the
-- first time this month was observed as closed (strictly before today). Never overwritten once
-- set (see projectMonthHistoryStore.js's ON CONFLICT ... DO NOTHING semantics).
CREATE TABLE IF NOT EXISTS project_month_history (
  project_id TEXT NOT NULL,
  month_key TEXT NOT NULL,
  frozen_target_percent REAL,
  PRIMARY KEY (project_id, month_key)
);

-- Part C - full log of real schedule-change events read from monday's activity_logs (not just
-- the latest one), so the project can be analyzed later ("how many times was this extended, and
-- when"). Only ONE value per project actually gets displayed (the most recent changed_at, shown
-- on every currently-open month) - that's derived on read with MAX(changed_at) GROUP BY
-- project_id, not stored as a separate per-month field.
CREATE TABLE IF NOT EXISTS schedule_change_events (
  project_id TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  new_end_date TEXT,
  PRIMARY KEY (project_id, changed_at)
);
