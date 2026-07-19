// Demo copy - getTaskDoneDates is copied verbatim from the real statusHistoryService.js (it only
// ever reads D1, never talks to monday.com). syncTaskStatusHistory becomes a no-op: the real
// version scans monday's live activity_logs for real status-change events, which don't exist
// here - the demo's task_status_history table is seeded once during setup instead (see
// README.md), and the frontend already calls this endpoint on every mount and tolerates it
// returning nothing new.

export async function syncTaskStatusHistory(env) {
  return { scannedLogs: 0, doneTransitionsFound: 0 };
}

// { taskId: doneAtISO } - what resolveCompletionDate actually consumes.
export async function getTaskDoneDates(env) {
  const { results } = await env.DB.prepare('SELECT task_id, done_at FROM task_status_history').all();
  const map = {};
  for (const row of results) map[row.task_id] = row.done_at;
  return map;
}
