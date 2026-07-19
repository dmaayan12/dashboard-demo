// D1-backed replacement for backend/src/attendanceStore.js (which read/wrote
// backend/data/attendance-overrides.json - no filesystem exists on Workers, see PLAN.md).
// The original's 3-month pruning is dropped here - D1 has no real storage-size pressure
// for a table this small, so there's no need to delete old months.
export async function getOverrides(env) {
  const { results } = await env.DB.prepare(
    'SELECT logger_id, month_key, vacation_days, sick_days FROM attendance_overrides'
  ).all();
  const data = {};
  for (const row of results) {
    if (!data[row.logger_id]) data[row.logger_id] = {};
    data[row.logger_id][row.month_key] = { vacationDays: row.vacation_days, sickDays: row.sick_days };
  }
  return data;
}

export async function setOverride(env, userId, monthKey, { vacationDays, sickDays }) {
  await env.DB.prepare(
    'INSERT INTO attendance_overrides (logger_id, month_key, vacation_days, sick_days) VALUES (?, ?, ?, ?) ' +
    'ON CONFLICT(logger_id, month_key) DO UPDATE SET vacation_days = excluded.vacation_days, sick_days = excluded.sick_days'
  ).bind(userId, monthKey, Number(vacationDays) || 0, Number(sickDays) || 0).run();

  return getOverrides(env);
}
