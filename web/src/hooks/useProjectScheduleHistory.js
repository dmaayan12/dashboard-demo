import { useState, useEffect } from 'react';
import { apiFetch, safeErrorMessage } from '../lib/api';

async function syncScheduleHistory() {
  const res = await apiFetch('/api/project-schedule-history', { method: 'POST' });
  if (!res.ok) throw new Error(`סנכרון היסטוריית לו"ז נכשל (${res.status})`);
  return res.json();
}

async function fetchLastChanges() {
  const res = await apiFetch('/api/project-schedule-history');
  if (!res.ok) throw new Error(`טעינת היסטוריית לו"ז נכשלה (${res.status})`);
  return res.json(); // { [projectId]: lastScheduleChangeAt }
}

// Round 6, Part C (see PLAN.md) - { projectId: lastScheduleChangeAt } read from
// schedule_change_events (worker-computed from monday's real activity logs, not client-side
// guessing).
//
// BUG FIXED HERE (found live, not from reading code): the original version only ever read
// schedule_change_events - nothing ever called the sync (POST) that actually scans monday's
// activity logs and writes into that table, so the table stayed permanently empty and the
// tooltip note never appeared, no matter how many real schedule changes happened. Now this
// triggers a sync on every mount (POST, scans monday's real activity_logs) before reading -
// verified manually via curl that scanning ~850 logs is fast enough for this to be reasonable;
// revisit frequency (e.g. throttle to once per N minutes) if the board's log volume grows a lot.
export const useProjectScheduleHistory = () => {
  const [lastChanges, setLastChanges] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    syncScheduleHistory()
      .catch((err) => console.error('Schedule history sync failed:', err)) // don't block the read on a failed sync
      .then(fetchLastChanges)
      .then(setLastChanges)
      .catch((err) => setError(safeErrorMessage(err, 'סנכרון היסטוריית לו"ז נכשל')))
      .finally(() => setLoading(false));
  }, []);

  return { lastChanges, loading, error };
};
