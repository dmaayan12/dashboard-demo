import { useState, useEffect } from 'react';
import { apiFetch, safeErrorMessage } from '../lib/api';

async function syncTaskStatusHistory() {
  const res = await apiFetch('/api/task-status-history', { method: 'POST' });
  if (!res.ok) throw new Error(`סנכרון היסטוריית סטטוסים נכשל (${res.status})`);
  return res.json();
}

async function fetchTaskDoneDates() {
  const res = await apiFetch('/api/task-status-history');
  if (!res.ok) throw new Error(`טעינת היסטוריית סטטוסים נכשלה (${res.status})`);
  return res.json(); // { [taskId]: doneAtISO }
}

// See PLAN.md's task-status-history round - { taskId: doneAtISO }, the real date each task last
// transitioned to a completion status in monday, read from monday's own activity_logs
// (worker-computed, not client-side guessing). Same sync-then-fetch pattern as
// useProjectScheduleHistory.js, and the same known limitation: syncs on every mount with no
// throttling (see PLAN.md's open item on useProjectScheduleHistory.js about this).
export const useTaskStatusHistory = () => {
  const [taskDoneDates, setTaskDoneDates] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    syncTaskStatusHistory()
      .catch((err) => console.error('Task status history sync failed:', err)) // don't block the read on a failed sync
      .then(fetchTaskDoneDates)
      .then(setTaskDoneDates)
      .catch((err) => setError(safeErrorMessage(err, 'סנכרון היסטוריית סטטוסים נכשל')))
      .finally(() => setLoading(false));
  }, []);

  return { taskDoneDates, loading, error };
};
