-- Freezes the "(Xh)" hour-equivalent shown next to a closed month's target % (MonthTooltip.jsx's
-- hoursSuffixFor), alongside the already-frozen frozen_target_percent. Without this, the percent
-- stays stable once a month closes but the hour-equivalent kept drifting, since it was always
-- recomputed as totalPlannedHours (live, current) x frozenPercent - a project's live total
-- estimated hours can keep changing (new tasks added etc) long after a month has closed.
ALTER TABLE project_month_history ADD COLUMN frozen_total_planned_hours REAL;
