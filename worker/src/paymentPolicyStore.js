// D1-backed replacement for backend/src/paymentPolicyStore.js (which read/wrote
// backend/data/payment-policies.json - no filesystem exists on Workers, see PLAN.md).
export async function getPolicies(env) {
  const { results } = await env.DB.prepare('SELECT project_id, reviewed, milestones_json, hour_bank_size FROM payment_policies').all();
  const policies = {};
  for (const row of results) {
    policies[row.project_id] = {
      reviewed: !!row.reviewed,
      milestones: JSON.parse(row.milestones_json),
      hourBankSize: row.hour_bank_size,
    };
  }
  return policies;
}

export async function setPolicy(env, projectId, { milestones, hourBankSize }) {
  const cleaned = (milestones || []).map((m) => ({
    id: m.id || crypto.randomUUID(),
    note: m.note || '',
    percent: Number(m.percent) || 0,
    trigger: m.trigger,
    customDate: m.trigger === 'custom' ? m.customDate : null,
    monthsAfterStart: m.monthsAfterStart ? Number(m.monthsAfterStart) : null,
    timeConfirmed: !!m.timeConfirmed,
  }));

  await env.DB.prepare(
    'INSERT INTO payment_policies (project_id, reviewed, milestones_json, hour_bank_size) VALUES (?, 1, ?, ?) ' +
    'ON CONFLICT(project_id) DO UPDATE SET reviewed = 1, milestones_json = excluded.milestones_json, hour_bank_size = excluded.hour_bank_size'
  ).bind(projectId, JSON.stringify(cleaned), hourBankSize != null ? Number(hourBankSize) : null).run();

  return getPolicies(env);
}
