-- Fixes the "orphan done task" gap (see PLAN.md) - a task marked "בוצע" with no logged hours and
-- no weeklyTimeline.to has no date resolveCompletionDate can fall back to, so it silently drops
-- out of monthly target/debt tracking even though it counts toward the overall completion badge.
-- One row per task: the most recent real date it transitioned INTO a completion status, read from
-- monday's own activity_logs (never overwritten with an earlier date - see writeTaskDoneDates).
CREATE TABLE IF NOT EXISTS task_status_history (
  task_id TEXT PRIMARY KEY,
  done_at TEXT NOT NULL
);
