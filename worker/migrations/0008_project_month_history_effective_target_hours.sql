-- Follow-up to migration 0007 (see PLAN.md, 2026-07-19 round) - freezes the HOURS-equivalent of
-- frozen_effective_target alongside the percent, computed using totalPlannedHours AS IT STOOD at
-- lock time. Needed because converting a debt-inflated locked percent via the older
-- hoursPerPercentPoint ratio (calibrated for the plain calendar "remaining pool", not aware of
-- debt) produced an inflated, inconsistent hours number once a month's locked target exceeded
-- what was actually left in that pool.
ALTER TABLE project_month_history ADD COLUMN frozen_effective_target_hours REAL;
