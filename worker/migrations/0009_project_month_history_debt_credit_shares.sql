-- Second follow-up to the sequential debt/credit engine (see PLAN.md, 2026-07-19 round). Freezes
-- the RAW debt/credit components that went into a month's locked target, separately from the
-- already-frozen NET result (frozen_effective_target). Needed because a month can carry BOTH a
-- real debt share AND a real credit share at once (e.g. a large early-project surplus reserved
-- for the last month can be bigger than that month's own accumulated debt) - the net value alone
-- can't distinguish "14% debt fully offset by 15% credit" from "a plain 1% credit with no debt
-- underneath it at all", but the user explicitly wants BOTH lines visible when both are real.
ALTER TABLE project_month_history ADD COLUMN frozen_debt_share REAL;
ALTER TABLE project_month_history ADD COLUMN frozen_credit_share REAL;
