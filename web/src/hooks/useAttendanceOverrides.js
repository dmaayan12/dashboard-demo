import { useState, useEffect } from 'react';
import { apiFetch, safeErrorMessage } from '../lib/api';

async function fetchOverrides() {
  const res = await apiFetch('/api/attendance-overrides');
  if (!res.ok) throw new Error(`טעינת נתוני חופשה/מחלה נכשלה (${res.status})`);
  return res.json();
}

async function putOverride(userId, monthKey, values) {
  const res = await apiFetch('/api/attendance-overrides', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, monthKey, ...values }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `שמירת נתוני חופשה/מחלה נכשלה (${res.status})`);
  }
  return res.json();
}

export const useAttendanceOverrides = () => {
  const [overrides, setOverrides] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchOverrides()
      .then(setOverrides)
      .catch((err) => setError(safeErrorMessage(err, 'טעינת נתוני חופשה/מחלה נכשלה')))
      .finally(() => setLoading(false));
  }, []);

  const saveOverride = async (userId, monthKey, values) => {
    const updated = await putOverride(userId, monthKey, values);
    setOverrides(updated);
  };

  return { overrides, loading, error, saveOverride };
};
