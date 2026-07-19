// D1-backed store for Round 6 Part B (frozen target history) - see PLAN.md.
// Bulk-read like paymentPolicyStore.js's getPolicies (one query, keyed by project_id) rather
// than per-project, since the client needs every relevant project's history on every load.
//
// Extended 2026-07-19 (sequential debt/credit engine round) with five more frozen fields
// (frozen_effective_target, frozen_actual_value, frozen_effective_target_hours,
// frozen_debt_share, frozen_credit_share) - written by a COMPLETELY SEPARATE freeze path in
// useDashboardData.js (calculateSequentialEffectiveTargets) than the original two
// (frozen_target_percent, frozen_total_planned_hours). The two paths can each independently be
// the FIRST to ever write a given (project, month) row - see writeHistory's own comment for why
// every column now uses COALESCE-on-conflict, not just the original one.

export async function getAllHistory(env) {
  const { results } = await env.DB.prepare(
    'SELECT project_id, month_key, frozen_target_percent, frozen_total_planned_hours, frozen_effective_target, frozen_actual_value, frozen_effective_target_hours, frozen_debt_share, frozen_credit_share FROM project_month_history'
  ).all();

  const history = {};
  for (const row of results) {
    if (!history[row.project_id]) history[row.project_id] = {};
    history[row.project_id][row.month_key] = {
      frozenTargetPercent: row.frozen_target_percent,
      frozenTotalPlannedHours: row.frozen_total_planned_hours,
      frozenEffectiveTarget: row.frozen_effective_target,
      frozenActualValue: row.frozen_actual_value,
      frozenEffectiveTargetHours: row.frozen_effective_target_hours,
      frozenDebtShare: row.frozen_debt_share,
      frozenCreditShare: row.frozen_credit_share,
    };
  }
  return history;
}

// entries: [{ monthKey, frozenTargetPercent?, frozenTotalPlannedHours?, frozenEffectiveTarget?,
// frozenActualValue?, frozenEffectiveTargetHours?, frozenDebtShare?, frozenCreditShare? }] - a
// single entry only ever carries the fields ITS OWN freeze path knows about - missing fields are
// bound as NULL.
//
// EVERY column uses COALESCE-on-conflict (keep the existing value if it's already non-null,
// otherwise take the new one) - true write-once PER FIELD, but safe regardless of which of the
// two independent freeze paths happens to create the row first. Plain (non-COALESCE) "do nothing
// on conflict" for a column would let an early write from ONE path permanently lock that column
// at NULL, blocking the OTHER path from ever filling it in later - this is exactly the class of
// bug that caused a real production incident before (see the frozen_total_planned_hours backfill
// case, migration 0003) - a runaway PUT loop that exhausted the Cloudflare daily request quota
// twice, because the client kept seeing a stuck NULL and kept re-sending the same write forever.
// COALESCE makes every field idempotent once filled in, from either path, in either order.
export async function writeHistory(env, projectId, entries) {
  if (!entries?.length) return getAllHistory(env);

  const statements = entries.map(({
    monthKey, frozenTargetPercent, frozenTotalPlannedHours, frozenEffectiveTarget, frozenActualValue,
    frozenEffectiveTargetHours, frozenDebtShare, frozenCreditShare,
  }) =>
    env.DB.prepare(
      `INSERT INTO project_month_history
         (project_id, month_key, frozen_target_percent, frozen_total_planned_hours, frozen_effective_target, frozen_actual_value, frozen_effective_target_hours, frozen_debt_share, frozen_credit_share)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id, month_key) DO UPDATE SET
         frozen_target_percent = COALESCE(project_month_history.frozen_target_percent, excluded.frozen_target_percent),
         frozen_total_planned_hours = COALESCE(project_month_history.frozen_total_planned_hours, excluded.frozen_total_planned_hours),
         frozen_effective_target = COALESCE(project_month_history.frozen_effective_target, excluded.frozen_effective_target),
         frozen_actual_value = COALESCE(project_month_history.frozen_actual_value, excluded.frozen_actual_value),
         frozen_effective_target_hours = COALESCE(project_month_history.frozen_effective_target_hours, excluded.frozen_effective_target_hours),
         frozen_debt_share = COALESCE(project_month_history.frozen_debt_share, excluded.frozen_debt_share),
         frozen_credit_share = COALESCE(project_month_history.frozen_credit_share, excluded.frozen_credit_share)`
    ).bind(
      projectId,
      monthKey,
      frozenTargetPercent ?? null,
      frozenTotalPlannedHours ?? null,
      frozenEffectiveTarget ?? null,
      frozenActualValue ?? null,
      frozenEffectiveTargetHours ?? null,
      frozenDebtShare ?? null,
      frozenCreditShare ?? null
    )
  );

  await env.DB.batch(statements);
  return getAllHistory(env);
}
