// Demo copy - getLastScheduleChanges is copied verbatim from the real scheduleHistoryService.js
// (it only ever reads D1, never talks to monday.com). syncScheduleHistory becomes a no-op: the
// real version scans monday's live activity_logs for real schedule-change events, which don't
// exist here - the demo's schedule_change_events table is seeded once during setup instead (see
// README.md), and the frontend already calls this endpoint on every mount and tolerates it
// returning nothing new.

export async function syncScheduleHistory(env) {
  return { scannedLogs: 0, parsedEvents: 0 };
}

// { projectId: lastScheduleChangeAt } - one value per project, shown in the tooltip on every
// currently-open month.
export async function getLastScheduleChanges(env) {
  const { results } = await env.DB.prepare(
    'SELECT project_id, MAX(changed_at) as last_changed_at FROM schedule_change_events GROUP BY project_id'
  ).all();

  const lastChanges = {};
  for (const row of results) {
    lastChanges[row.project_id] = row.last_changed_at;
  }
  return lastChanges;
}
