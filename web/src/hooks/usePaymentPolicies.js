import { useState, useEffect } from 'react';
import { apiFetch, safeErrorMessage } from '../lib/api';

async function fetchPolicies() {
  const res = await apiFetch('/api/payment-policies');
  if (!res.ok) throw new Error(`טעינת מדיניות תשלום נכשלה (${res.status})`);
  return res.json();
}

async function putPolicy(projectId, { milestones, hourBankSize }) {
  const res = await apiFetch(`/api/payment-policies/${projectId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ milestones, hourBankSize }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `שמירת מדיניות תשלום נכשלה (${res.status})`);
  }
  return res.json();
}

export const usePaymentPolicies = () => {
  const [policies, setPolicies] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPolicies()
      .then(setPolicies)
      .catch((err) => setError(safeErrorMessage(err, 'טעינת מדיניות תשלום נכשלה')))
      .finally(() => setLoading(false));
  }, []);

  const savePolicy = async (projectId, milestones) => {
    const updated = await putPolicy(projectId, milestones);
    setPolicies(updated);
  };

  return { policies, loading, error, savePolicy };
};
