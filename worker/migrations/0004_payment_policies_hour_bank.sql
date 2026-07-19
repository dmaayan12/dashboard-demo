-- Optional per-project "hour bank" ceiling (e.g. 140h) for ad-hoc work within a milestone-based
-- project's already-fixed price. Purely a monitoring guardrail (no financial meaning of its own -
-- confirmed with the user) - set once here, alongside the milestones themselves, rather than
-- being derived from monday (a fake placeholder task with 140 "expected hours" would both pollute
-- planning-cost calculations and clutter the real board).
ALTER TABLE payment_policies ADD COLUMN hour_bank_size REAL;
