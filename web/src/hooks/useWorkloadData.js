import { useState, useEffect } from 'react';
import { apiFetch, safeErrorMessage } from '../lib/api';
import { buildUsersMap } from '../utils/workloadCalculations';

async function fetchWorkloadData() {
  const res = await apiFetch('/api/workload-data');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `טעינת נתוני העומס נכשלה (${res.status})`);
  }
  return res.json(); // { planningItems, actualsItems, users }
}

export const useWorkloadData = () => {
  const [actualsItems, setActualsItems] = useState([]);
  const [planningItems, setPlanningItems] = useState([]);
  const [usersById, setUsersById] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const { planningItems: planning, actualsItems: actuals, users } = await fetchWorkloadData();

      setPlanningItems(planning);
      setActualsItems(actuals);
      setUsersById(buildUsersMap(users));
    } catch (err) {
      console.error('Failed to fetch workload data:', err);
      setError(safeErrorMessage(err, 'טעינת נתוני העומס נכשלה'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return { actualsItems, planningItems, usersById, loading, error, refetch: fetchData };
};
