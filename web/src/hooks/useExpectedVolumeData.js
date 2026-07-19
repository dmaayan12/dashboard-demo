import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, safeErrorMessage } from '../lib/api';
import {
  buildUsersMap,
  calculateExpectedVolumeSummary,
  calculateWeeklyTaskProgress,
  calculateActualHoursForWeek,
  calculateManagementOnlyProjectIds,
} from '../utils/workloadCalculations';
import { usePaymentPolicies } from './usePaymentPolicies';
import { useTaskStatusHistory } from './useTaskStatusHistory';
import { useProjectMonthHistory } from './useProjectMonthHistory';
import { useProjectScheduleHistory } from './useProjectScheduleHistory';
import { useDashboardData } from './useDashboardData';

const monthKeyOf = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

/**
 * Map<projectId, Map<monthKey, {target, actual}>> - per-month, per-project remaining-target and
 * this-month's-own-actual, reused directly from `useDashboardData` (the Backlog's own
 * `effectiveTargetHoursByMonth`/`monthlyActualHoursByMonth`, already debt/credit-adjusted and
 * already respecting the real dynamic end date) instead of re-deriving the debt/credit engine a
 * second time here.
 *
 * Deliberately kept PER-MONTH, not summed into one flat number - see PLAN.md's month-isolated
 * pace model (2026-07-16 round): a week's pace-hours must be based on the SPECIFIC month it
 * falls in (that month's own locked target, minus that month's own actual-so-far, divided by
 * that month's own remaining working days) - blending it with other open months' targets was
 * tried and explicitly rejected by the user ("if I calculate next week using August's target,
 * I've done nothing with that" - August's target isn't relevant to a week that's still in July).
 */
const buildMonthlyTargetsByProject = (projects, today) => {
  const todayKey = monthKeyOf(today);
  const result = new Map();
  (projects || []).forEach((project) => {
    if (!project.hasMilestones || !project.effectiveTargetHoursByMonth) return;
    const monthly = new Map();
    project.effectiveTargetHoursByMonth.forEach((target, monthKey) => {
      if (monthKey < todayKey) return;
      const actual = monthKey === todayKey ? (project.monthlyActualHoursByMonth?.get(monthKey) || 0) : 0;
      monthly.set(monthKey, { target: target || 0, actual });
    });
    result.set(project.id, monthly);
  });
  return result;
};

async function fetchCurrentWeekSnapshot() {
  const res = await apiFetch('/api/expected-volume-data');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `טעינת נתוני נפח העבודה נכשלה (${res.status})`);
  }
  return res.json(); // { planningItems, actualsItems, users, lastUpdated, weekKey }
}

// Always-fresh, never cached - reuses the same endpoint "עומס עובדים" already relies on for
// live data (getWorkloadData, no weekly snapshot layer at all). Used ONLY to derive "what's
// actually been done this week" (task-completion %) for the CURRENT week - see PLAN.md's
// 2026-07-16 "no manual refresh button" round: the week's PLANNED/assigned side stays locked to
// the weekly snapshot (fetchCurrentWeekSnapshot above), exactly like "previous week" already
// does, but the ACTUAL side must never be stuck on whatever the snapshot happened to capture -
// it needs to reflect hours logged since then, automatically, without a manual "load data" click.
async function fetchFreshActuals() {
  const res = await apiFetch('/api/workload-data');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `טעינת נתונים עדכניים נכשלה (${res.status})`);
  }
  return res.json(); // { planningItems, actualsItems, users }
}

async function fetchPreviousWeekSnapshot() {
  const res = await apiFetch('/api/workload-week-history');
  if (!res.ok) return null;
  return res.json(); // { weekKey, computedAt, data: {planningItems, actualsItems, users}, weekStart } | null
}

// Read-only counterpart of fetchPaceTargetSnapshot (below) - whatever got frozen for the week
// while it was still "current" (see workloadVolumeCache.js on the Worker side). Empty object if
// this week never went through a "current" freeze (e.g. the very first week this feature existed).
async function fetchPreviousPaceTargetSnapshot() {
  const res = await apiFetch('/api/pace-target-snapshot-previous');
  if (!res.ok) return {};
  return res.json();
}

// Write-once weekly freeze of the pace-hours target/actual figures - see
// paceTargetSnapshotStore.js on the Worker side for the full reasoning. Empty object means no
// snapshot exists yet for this week (first load since the week rolled over).
async function fetchPaceTargetSnapshot() {
  const res = await apiFetch('/api/pace-target-snapshot');
  if (!res.ok) return {}; // best-effort - a failed GET just falls back to a live (unfrozen) figure
  return res.json(); // { [projectId]: { [monthKey]: {target, actual} } }
}

// Best-effort, fire-and-forget - if this fails (network hiccup, quota), the NEXT load simply
// finds no snapshot yet and retries. The server-side write is idempotent (DO NOTHING on conflict)
// so calling this more than once for the same week is always harmless.
async function writePaceTargetSnapshot(entries) {
  if (!entries.length) return;
  await apiFetch('/api/pace-target-snapshot', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries }),
  }).catch(() => {});
}

async function fetchWeekBoundaries() {
  const res = await apiFetch('/api/expected-volume-week-boundaries');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `טעינת גבולות השבוע נכשלה (${res.status})`);
  }
  return res.json(); // { previous: {weekStart, weekEnd}, current: {...}, next: {...} }
}

const collectTaskIds = (byProjectTasks) => {
  const ids = new Set();
  byProjectTasks.forEach((tasks) => tasks.forEach((t) => ids.add(t.id)));
  return ids;
};

/** Merges hours/money summary (calculateExpectedVolumeSummary) with task-progress (%) into one
 * per-project row map, keyed the same way buildRows in ExpectedVolumeTab.jsx expects.
 * `managementOnlyProjectIds` computed from this SAME week's own actualsItems (frozen for
 * "previous", live for current/next) - a project entirely "פרילאנס"/"ניהול" per the user's
 * explicit request shouldn't appear in this tab at all, in any week view. */
const buildWeekView = (summary, taskProgress, weekLabel, actualsItems) => ({
  summary, taskProgress, weekLabel, managementOnlyProjectIds: calculateManagementOnlyProjectIds(actualsItems),
});

export const useExpectedVolumeData = () => {
  const { policies, loading: policiesLoading } = usePaymentPolicies();
  const { taskDoneDates, loading: taskStatusLoading } = useTaskStatusHistory();
  // Only needed to get useDashboardData's already-correct effectiveTargetHoursByMonth/
  // monthlyActualHoursByMonth per project (see buildMonthlyTargetsByProject above) - not
  // otherwise used on this tab.
  const { history, loading: historyLoading } = useProjectMonthHistory();
  const { lastChanges: lastScheduleChanges, loading: scheduleHistoryLoading } = useProjectScheduleHistory();
  const { projects: dashboardProjects, loading: dashboardLoading } = useDashboardData(
    policies, history, undefined, lastScheduleChanges, taskDoneDates
  );

  const [weeks, setWeeks] = useState({ previous: null, current: null, next: null }); // each: buildWeekView(...) | null
  const [boundaries, setBoundaries] = useState(null); // { previous: {weekStart,weekEnd}, current: {...}, next: {...} } | null
  const [usersById, setUsersById] = useState(new Map());
  const [lastUpdated, setLastUpdated] = useState(null);
  const [recurringTaskIds, setRecurringTaskIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // `load` gets a new identity (via its useCallback deps) every time any upstream hook
  // (policies/history/schedule-history/task-status/dashboardProjects) resolves, which can fire
  // several times in quick succession as each dependency settles on its own render. Without this
  // guard, an EARLIER call (still in flight with a stale, empty dashboardProjects) can finish
  // AFTER a newer call and clobber its correct results with stale ones (setWeeks/setLoading(false)
  // firing out of order) - caught live: pace-hours briefly showed 0 for several seconds even
  // after every hook's own `loading` flag had already gone false. Only the most-recently-STARTED
  // call is allowed to commit its results.
  const loadIdRef = useRef(0);
  // Guards against firing the (harmless but pointless) freeze-write more than once per week per
  // session - see the write's own comment for why a repeat write is safe either way, this is
  // just to avoid spamming the endpoint every time `load()` re-fires.
  const paceSnapshotWriteAttemptedForWeekRef = useRef(null);

  const load = useCallback(async () => {
    const myLoadId = ++loadIdRef.current;
    try {
      setLoading(true);
      setError(null);

      const [boundaries, currentSnap, previousSnap, freshActuals, paceSnapshot, previousPaceSnapshot] = await Promise.all([
        fetchWeekBoundaries(),
        fetchCurrentWeekSnapshot(),
        fetchPreviousWeekSnapshot(),
        fetchFreshActuals(),
        fetchPaceTargetSnapshot(),
        fetchPreviousPaceTargetSnapshot(),
      ]);
      // A newer call already started (some upstream hook resolved again in the meantime) - let
      // THAT one commit the final result instead, so a slow/stale call can't clobber it.
      if (loadIdRef.current !== myLoadId) return;

      const { planningItems, actualsItems, users, lastUpdated: updatedAt } = currentSnap;
      setUsersById(buildUsersMap(users));
      setLastUpdated(updatedAt);
      setBoundaries(boundaries);

      const now = new Date();
      // Live, real-time - reflects whatever's actually been logged as of right now. Used for
      // "next week" (a future week's target should reflect today's real progress against the
      // deadline - see calculateExpectedVolumeSummary's own comment on opts.paceRealNow).
      const liveMonthlyTargetsByProject = buildMonthlyTargetsByProject(dashboardProjects, now);

      // Current week's target must be a FROZEN weekly figure, not a live recompute - the user
      // explicitly rejected the live version: a project could already log enough hours mid-week
      // to exceed its monthly target, which ate the live "remaining" down to 0 and made the
      // week's pace-hours target visibly shrink day by day even though nothing about the actual
      // PLAN had changed - the target is supposed to answer "what did we need to push
      // this week, as of when the week began", not "what's still missing right this second".
      // Mirrors the exact same freeze-on-first-access pattern workloadVolumeCache.js already uses
      // for the raw planningItems/actualsItems (getCurrentWeekSnapshot) - here the WORKER can't
      // compute the figure itself (it needs the client's full payment-policy/debt-credit
      // pipeline), so the client computes it live once and the server just persists whichever
      // value it saw FIRST for this week (see paceTargetSnapshotStore.js).
      const hasFrozenSnapshot = Object.keys(paceSnapshot).length > 0;
      let currentWeekMonthlyTargets;
      if (hasFrozenSnapshot) {
        currentWeekMonthlyTargets = new Map();
        Object.entries(paceSnapshot).forEach(([projectId, monthly]) => {
          currentWeekMonthlyTargets.set(projectId, new Map(Object.entries(monthly)));
        });
      } else {
        currentWeekMonthlyTargets = liveMonthlyTargetsByProject;
        if (paceSnapshotWriteAttemptedForWeekRef.current !== boundaries.current.weekStart) {
          paceSnapshotWriteAttemptedForWeekRef.current = boundaries.current.weekStart;
          const entries = [];
          liveMonthlyTargetsByProject.forEach((monthly, projectId) => {
            monthly.forEach(({ target, actual }, monthKey) => entries.push({ projectId, monthKey, target, actual }));
          });
          writePaceTargetSnapshot(entries);
        }
      }

      // The PLANNED/target side must work at weekly granularity, not daily: it's pinned to the
      // week's own start (boundaries.current.weekStart), exactly like "next week" already anchors
      // to its own start, and exactly like "previous week"'s planned side stays frozen to when
      // that week began. An earlier version used real "now" as `today` here so that "days already
      // elapsed this week stop counting" - the user explicitly rejected this (2026-07-18): it made
      // both assigned-hours and pace-hours collapse toward 0 by the tail end of every week, since
      // a task/day that already passed within the CURRENT week isn't supposed to "expire" - the
      // whole week's plan is meant to stay one fixed picture from Sunday through Saturday, only
      // the separately-live ACTUAL data (currentProgress, below) is supposed to move day by day.
      const currentSummary = calculateExpectedVolumeSummary(actualsItems, planningItems, {
        today: boundaries.current.weekStart, keepTimeOfDay: true, windowEnd: boundaries.current.weekEnd,
        policies, paceRealNow: boundaries.current.weekStart, monthlyTargetsByProject: currentWeekMonthlyTargets,
      });
      // "בפועל" for the current week must never be stuck on the weekly snapshot (see
      // fetchFreshActuals's own comment) - always computed from the always-fresh fetch, so hours
      // logged a minute ago already show up here without any manual refresh.
      const currentProgress = calculateWeeklyTaskProgress(
        freshActuals.actualsItems, boundaries.current.weekStart, boundaries.current.weekEnd, taskDoneDates
      );

      // Next week - hasn't started yet, so scheduling can (and does) change up until the moment
      // it begins - per the user's own explicit rule ("שבוע הבא: הכל מתעדכן אוטומטית"), this must
      // read from the always-fresh fetch, NOT the weekly-cached snapshot (`actualsItems`/
      // `planningItems` above) - that cache only refreshes once a week, so a task rescheduled
      // into next week THIS SAME WEEK would otherwise stay invisible until the cache happened to
      // rotate. Caught live: the user rescheduled a real task into next week and it didn't show
      // up. `today` = the week's own start (nothing "already elapsed" within a future week).
      // monthlyTargetsByProject is still anchored to the REAL current moment (`now`, not the
      // future week's start) - it answers "how much is really left, as of right now".
      const nextSummary = calculateExpectedVolumeSummary(freshActuals.actualsItems, freshActuals.planningItems, {
        today: boundaries.next.weekStart, windowEnd: boundaries.next.weekEnd, policies, keepTimeOfDay: true,
        monthlyTargetsByProject: liveMonthlyTargetsByProject,
      });
      const nextProgress = calculateWeeklyTaskProgress(
        freshActuals.actualsItems, boundaries.next.weekStart, boundaries.next.weekEnd, taskDoneDates
      );

      const nextWeeks = {
        current: buildWeekView(currentSummary, currentProgress, 'current', freshActuals.actualsItems),
        next: buildWeekView(nextSummary, nextProgress, 'next', freshActuals.actualsItems),
        previous: null,
      };

      if (previousSnap?.data) {
        const frozenActuals = previousSnap.data.actualsItems;
        const frozenPlanning = previousSnap.data.planningItems;
        // "מתוכנן" (planned) - frozen replay, exactly as it looked when the week was still
        // current (same technique as the old "previous cycle" replay). The pace-hours target uses
        // the SAME frozen-at-week-start snapshot this week itself was seeded with while it was
        // still "current" (previousPaceSnapshot, fetched above) - by definition, a week that's
        // already "previous" was ALWAYS "current" at some point, so its snapshot row should
        // already exist (written then) unless this feature didn't exist yet for that week, in
        // which case this falls back to the live map (best-effort, matches pre-existing behavior).
        const hasFrozenPreviousSnapshot = Object.keys(previousPaceSnapshot).length > 0;
        let previousWeekMonthlyTargets = liveMonthlyTargetsByProject;
        if (hasFrozenPreviousSnapshot) {
          previousWeekMonthlyTargets = new Map();
          Object.entries(previousPaceSnapshot).forEach(([projectId, monthly]) => {
            previousWeekMonthlyTargets.set(projectId, new Map(Object.entries(monthly)));
          });
        }
        const plannedSummary = calculateExpectedVolumeSummary(frozenActuals, frozenPlanning, {
          today: previousSnap.computedAt, windowEnd: boundaries.previous.weekEnd, policies, keepTimeOfDay: true,
          paceRealNow: boundaries.previous.weekStart, monthlyTargetsByProject: previousWeekMonthlyTargets,
        });
        const plannedProgress = calculateWeeklyTaskProgress(
          frozenActuals, boundaries.previous.weekStart, boundaries.previous.weekEnd, taskDoneDates
        );
        // "בפועל" (actual) - LIVE data, re-summed fresh every load from the always-fresh fetch
        // (see fetchFreshActuals's own comment on why this must never be frozen, and never even
        // rely on the weekly-cached snapshot either - now that there's no manual refresh button,
        // `actualsItems` above can go a whole week without updating) - hours logged retroactively
        // after the week locked still show up here.
        const actualHoursByProject = calculateActualHoursForWeek(
          freshActuals.actualsItems, boundaries.previous.weekStart, boundaries.previous.weekEnd
        );
        const actualProgress = calculateWeeklyTaskProgress(
          freshActuals.actualsItems, boundaries.previous.weekStart, boundaries.previous.weekEnd, taskDoneDates
        );
        // Merge: planned side from the frozen replay, actual side from live data.
        const mergedProgress = new Map();
        new Set([...plannedProgress.keys(), ...actualProgress.keys()]).forEach((projectId) => {
          const planned = plannedProgress.get(projectId) || { remainingCount: 0, plannedCount: 0, plannedPercent: 0 };
          const actual = actualProgress.get(projectId) || { remainingCount: 0, actualCount: 0, actualPercent: 0 };
          mergedProgress.set(projectId, {
            remainingCount: planned.remainingCount,
            plannedCount: planned.plannedCount,
            plannedPercent: planned.plannedPercent,
            actualCount: actual.actualCount,
            actualPercent: planned.remainingCount > 0 ? (actual.actualCount / planned.remainingCount) * 100 : 0,
          });
        });

        nextWeeks.previous = buildWeekView(
          { ...plannedSummary, actualHoursByProject },
          mergedProgress,
          'previous',
          frozenActuals
        );

        const currentTaskIds = collectTaskIds(currentSummary.byProjectTasks);
        const recurring = new Set(
          [...collectTaskIds(plannedSummary.byProjectTasks)].filter((id) => currentTaskIds.has(id))
        );
        setRecurringTaskIds(recurring);
      } else {
        setRecurringTaskIds(new Set());
      }

      setWeeks(nextWeeks);
    } catch (err) {
      if (loadIdRef.current !== myLoadId) return;
      console.error('Failed to fetch expected volume data:', err);
      setError(safeErrorMessage(err, 'טעינת נתוני נפח העבודה נכשלה'));
    } finally {
      if (loadIdRef.current === myLoadId) setLoading(false);
    }
  }, [policies, taskDoneDates, dashboardProjects]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    weeks, // { previous: {summary, taskProgress, weekLabel} | null, current: {...}, next: {...} }
    boundaries, // { previous: {weekStart,weekEnd}, current: {...}, next: {...} } | null
    usersById,
    lastUpdated,
    recurringTaskIds,
    // Also waits on EVERY input that feeds monthlyTargetsByProject (dashboard-data itself, plus
    // policies/history/schedule-history/task-status - all of which useDashboardData depends on
    // as arguments, not just its own internal fetch) - without this, the tab could briefly render
    // pace-hours as 0 while dashboardProjects is still an empty placeholder mid-load (caught live:
    // dashboardLoading alone went false several renders before dashboardProjects actually had real
    // milestone data, since it only tracks the dashboard-data fetch itself, not these inputs).
    // Same "flash of wrong data" class of bug already found and fixed once on the Backlog tab.
    loading: loading || dashboardLoading || policiesLoading || historyLoading || scheduleHistoryLoading || taskStatusLoading,
    error,
  };
};
