import { useState, useEffect, useCallback } from 'react';
import { apiFetch, safeErrorMessage } from '../lib/api';

async function fetchHistory() {
  const res = await apiFetch('/api/project-month-history');
  if (!res.ok) throw new Error(`טעינת היסטוריית פרויקטים נכשלה (${res.status})`);
  return res.json();
}

async function putHistory(projectId, entries) {
  const res = await apiFetch(`/api/project-month-history/${projectId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `שמירת היסטוריית פרויקט נכשלה (${res.status})`);
  }
  return res.json();
}

// Used by useDashboardData.js for two independent purposes (see PLAN.md):
// - Part B: freezing "יעד חודשי" the first time a milestone-project's month is seen as closed.
// - Part C: stamping every currently-open month with the real date the schedule last changed.
// Both write through the same recordHistory call - only which fields are populated differs.
export const useProjectMonthHistory = () => {
  const [history, setHistory] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchHistory()
      .then(setHistory)
      .catch((err) => setError(safeErrorMessage(err, 'טעינת היסטוריית פרויקטים נכשלה')))
      .finally(() => setLoading(false));
  }, []);

  // Fire-and-forget from the caller's point of view - it already has the up-to-date values
  // in-memory for this render (the live-computed ones), it doesn't need to wait for the write
  // to round-trip before displaying anything.
  //
  // useCallback with a stable identity is not just tidiness here - useDashboardData.js's effect
  // that calls this depends on it directly. Without memoizing, a NEW function was created on
  // every render of this hook, so that effect re-fired on every unrelated re-render anywhere in
  // the tree (scroll, drag, anything) - not just when there was actually something new to
  // freeze - hammering the endpoint with repeat writes. Caught via a live console-error check,
  // not by inspection alone.
  const recordHistory = useCallback(async (projectId, entries) => {
    try {
      const updated = await putHistory(projectId, entries);
      setHistory(updated);
    } catch (err) {
      console.error('Failed to record project month history:', err);
    }
  }, []);

  return { history, loading, error, recordHistory };
};
