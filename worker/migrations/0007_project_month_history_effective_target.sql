-- Sequential debt/credit engine (see PLAN.md, 2026-07-19 round) - freezes each month's LOCKED
-- "יעד עדכני" (calendar target already adjusted for debt/credit, computed once as it would have
-- looked the moment that month began) and, for closed months only, the real performance that
-- month ended up delivering - both permanent once set, exactly like frozen_target_percent already
-- is. Written by a completely separate freeze path from frozen_target_percent/
-- frozen_total_planned_hours (see projectMonthHistoryStore.js's writeHistory - both paths can fire
-- independently, in either order, for the same row).
ALTER TABLE project_month_history ADD COLUMN frozen_effective_target REAL;
ALTER TABLE project_month_history ADD COLUMN frozen_actual_value REAL;
