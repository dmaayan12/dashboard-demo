// Entry point - the demo Worker's only routing table. Unlike the real project, there's no
// /debug/* diagnostic surface here (that existed only for Claude's own access during real
// development, see auth.js) and no monday.com calls anywhere (see fakeData.js).
import { getDashboardData } from './dashboardService.js';
import { getWorkloadData } from './workloadService.js';
import { getPolicies, setPolicy } from './paymentPolicyStore.js';
import { getOverrides, setOverride } from './attendanceStore.js';
import { getAllHistory, writeHistory } from './projectMonthHistoryStore.js';
import { syncScheduleHistory, getLastScheduleChanges } from './scheduleHistoryService.js';
import { syncTaskStatusHistory, getTaskDoneDates } from './statusHistoryService.js';
import {
  getCurrentWeekSnapshot, getPreviousWeekSnapshot, getWeekBoundaries, currentWeekKey,
  getPaceTargetSnapshot, writePaceTargetSnapshot,
} from './workloadVolumeCache.js';
import { checkEntryCode } from './auth.js';

// Narrowed to the real extension id once it's known (chrome-extension://<id>) - '*' is a
// placeholder for local development only.
// Access-Control-Allow-Methods matters here in a way it never did for the real Chrome extension
// version of this project: an extension with host_permissions for this origin bypasses the
// browser's CORS preflight entirely, so the real project never needed this header explicitly.
// This demo runs as a plain website (no such exemption) - without it, the browser's preflight
// blocks every PUT request (payment policy edits, attendance overrides, project-month-history
// writes) even though Access-Control-Allow-Origin: '*' looks permissive enough at a glance.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Entry-Code',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
};

const json = (data, status = 200) =>
  Response.json(data, { status, headers: CORS_HEADERS });

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({ ok: true });
    }

    // Everything below requires the entry code.
    if (!checkEntryCode(request, env)) {
      return json({ error: 'Unauthorized' }, 401);
    }

    // Used only by PasswordGate.jsx to check the code without needing a real data fetch.
    if (url.pathname === '/api/validate-code') {
      return json({ ok: true });
    }

    if (url.pathname === '/api/dashboard-data') {
      try {
        return json(await getDashboardData(env));
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    if (url.pathname === '/api/workload-data') {
      try {
        return json(await getWorkloadData(env));
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    if (url.pathname === '/api/payment-policies') {
      if (request.method === 'GET') {
        try {
          return json(await getPolicies(env));
        } catch (err) {
          return json({ error: err.message }, 500);
        }
      }
    }

    const policyMatch = url.pathname.match(/^\/api\/payment-policies\/(.+)$/);
    if (policyMatch && request.method === 'PUT') {
      try {
        const body = await request.json();
        return json(await setPolicy(env, policyMatch[1], body));
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    if (url.pathname === '/api/attendance-overrides') {
      if (request.method === 'GET') {
        try {
          return json(await getOverrides(env));
        } catch (err) {
          return json({ error: err.message }, 500);
        }
      }
      if (request.method === 'PUT') {
        try {
          const { userId, monthKey, vacationDays, sickDays } = await request.json();
          if (!userId || !monthKey) return json({ error: 'userId and monthKey are required' }, 400);
          return json(await setOverride(env, userId, monthKey, { vacationDays, sickDays }));
        } catch (err) {
          return json({ error: err.message }, 500);
        }
      }
    }

    if (url.pathname === '/api/project-month-history') {
      if (request.method === 'GET') {
        try {
          return json(await getAllHistory(env));
        } catch (err) {
          return json({ error: err.message }, 500);
        }
      }
    }

    const historyMatch = url.pathname.match(/^\/api\/project-month-history\/(.+)$/);
    if (historyMatch && request.method === 'PUT') {
      try {
        const { entries } = await request.json();
        if (!Array.isArray(entries)) return json({ error: 'entries array is required' }, 400);
        return json(await writeHistory(env, historyMatch[1], entries));
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    if (url.pathname === '/api/project-schedule-history') {
      if (request.method === 'GET') {
        try {
          return json(await getLastScheduleChanges(env));
        } catch (err) {
          return json({ error: err.message }, 500);
        }
      }
      // Client-triggered (not on every load - see PLAN.md's "כמה פעמים לרענן" open question) re-
      // scan of monday's real activity logs. Safe to call repeatedly - writes are idempotent.
      if (request.method === 'POST') {
        try {
          return json(await syncScheduleHistory(env));
        } catch (err) {
          return json({ error: err.message }, 500);
        }
      }
    }

    if (url.pathname === '/api/task-status-history') {
      if (request.method === 'GET') {
        try {
          return json(await getTaskDoneDates(env));
        } catch (err) {
          return json({ error: err.message }, 500);
        }
      }
      // Client-triggered re-scan of monday's real activity logs, same pattern as
      // /api/project-schedule-history - safe to call repeatedly, always overwrites with the
      // latest known state per task.
      if (request.method === 'POST') {
        try {
          return json(await syncTaskStatusHistory(env));
        } catch (err) {
          return json({ error: err.message }, 500);
        }
      }
    }

    // Write-once weekly freeze of the pace-hours target/actual figures - see
    // workloadVolumeCache.js's getPaceTargetSnapshot/writePaceTargetSnapshot. Always keyed by the
    // SERVER's own current week (never a client-supplied week), so a stale tab can't write into
    // the wrong week.
    if (url.pathname === '/api/pace-target-snapshot') {
      if (request.method === 'GET') {
        try {
          return json(await getPaceTargetSnapshot(env, currentWeekKey()));
        } catch (err) {
          return json({ error: err.message }, 500);
        }
      }
      if (request.method === 'PUT') {
        try {
          const { entries } = await request.json();
          if (!Array.isArray(entries)) return json({ error: 'entries array is required' }, 400);
          return json(await writePaceTargetSnapshot(env, currentWeekKey(), entries));
        } catch (err) {
          return json({ error: err.message }, 500);
        }
      }
    }
    // Read-only: whatever got frozen for the PREVIOUS week while it was still "current" (see
    // above) - by the time a week becomes "previous" it should already have a row, written during
    // the week it was current, so this never needs a write path of its own. Empty object if none
    // exists yet (e.g. the very first week this feature was live for).
    if (url.pathname === '/api/pace-target-snapshot-previous' && request.method === 'GET') {
      try {
        return json(await getPaceTargetSnapshot(env, currentWeekKey() - 1));
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    if (url.pathname === '/api/expected-volume-data') {
      try {
        return json(await getCurrentWeekSnapshot(env, url.searchParams.get('force') === 'true'));
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }
    if (url.pathname === '/api/workload-week-history') {
      try {
        return json(await getPreviousWeekSnapshot(env));
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }
    // { current: {weekStart,weekEnd}, previous: {...}, next: {...} } - lets the client compute
    // each week's own summary via calculateExpectedVolumeSummary without duplicating the
    // Sunday-07:00 week-anchoring math client-side too.
    if (url.pathname === '/api/expected-volume-week-boundaries') {
      try {
        return json({ previous: getWeekBoundaries(-1), current: getWeekBoundaries(0), next: getWeekBoundaries(1) });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    return json({ error: 'Not found' }, 404);
  },
};
