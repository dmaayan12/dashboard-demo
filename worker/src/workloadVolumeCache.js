// D1-backed cache for "נפח עבודה צפוי" - moved from a 14-day cycle to a WEEKLY cycle (see
// PLAN.md's weekly-navigation round). Weeks are anchored to Sunday 12:00 noon **Israel local
// time, real DST-aware** (2026-07-19: user's explicit choice - not a fixed UTC offset, which
// would silently drift to 11:00 or 13:00 local once Israel switches between IDT/IST across the
// year). Computed via Intl's real Asia/Jerusalem timezone data (supported natively by the
// Workers runtime), not hand-rolled offset math. Same `workload_volume_cache` table/columns as
// before (cycle_key is now a WEEK key, not a 14-day key - same INTEGER column, just a different
// meaning).
import { getWorkloadData } from './workloadService.js';

const JERUSALEM_TZ = 'Asia/Jerusalem';

// A real, verified Sunday (see conversation, 2026-07-19) that the currently-live system already
// calls "week 2949" (under the OLD fixed-UTC-offset anchor scheme) - pinning the new DST-aware
// scheme's numbering to reproduce the SAME weekKey for the week containing this date is what lets
// already-written rows (workload_volume_cache cycle_key=2949, pace_target_snapshot week_key=2949,
// both written earlier the same day this change was made) stay correctly attached to "this week"
// instead of being silently orphaned by a renumbering.
const REFERENCE_WEEK_KEY = 2949;
const REFERENCE_SUNDAY_UTC_DATE = Date.UTC(2026, 6, 12); // 2026-07-12, verified Sunday

/** { year, month, day } as seen in Israel local time for a given UTC instant. */
function getIsraeliDateParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: JERUSALEM_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** Israel's real UTC offset, in minutes, for the given UTC instant (180 in summer/IDT, 120 in winter/IST). */
function getIsraeliUtcOffsetMinutes(date) {
  const part = new Intl.DateTimeFormat('en-US', {
    timeZone: JERUSALEM_TZ, timeZoneName: 'shortOffset',
  }).formatToParts(date).find((p) => p.type === 'timeZoneName').value; // e.g. "GMT+3"
  const match = part.match(/GMT([+-]\d+)/);
  return match ? Number(match[1]) * 60 : 0;
}

/**
 * The UTC instant of 12:00:00 Israel-local time on the given Y-M-D. Resolves the REAL offset for
 * that specific date (not just "now"), so this stays correct across the DST transition weeks
 * themselves, not only within a single season.
 */
function israeliNoonToUtc(year, month, day) {
  // Same-day UTC guess first (Israel's offset from UTC is always a small number of hours, so this
  // guess and the real answer always fall on the same calendar day) - then look up the REAL
  // offset Intl reports for that guess and correct against it.
  const guessUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const offsetMin = getIsraeliUtcOffsetMinutes(guessUtc);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0) - offsetMin * 60000);
}

/** The most recent Sunday-noon-Israel-time instant at or before `date` (a Sunday's own noon is its own week's start). */
function currentWeekStartFor(date) {
  const { year, month, day } = getIsraeliDateParts(date);
  // Pure calendar-date arithmetic, built with Date.UTC so it's never ambiguous regardless of the
  // server's own timezone - getUTCDay() on a date built purely from Y-M-D always gives the
  // correct ISO weekday for that calendar date.
  const asUtcDate = Date.UTC(year, month - 1, day);
  const weekday = new Date(asUtcDate).getUTCDay(); // 0 = Sunday
  let sundayUtcDate = new Date(asUtcDate - weekday * 86400000);
  let candidate = israeliNoonToUtc(sundayUtcDate.getUTCFullYear(), sundayUtcDate.getUTCMonth() + 1, sundayUtcDate.getUTCDate());
  if (candidate.getTime() > date.getTime()) {
    // `date` falls on the Sunday itself but BEFORE that day's own noon cutoff (e.g. Sunday 2 AM
    // Israel time) - naively taking "today's" Sunday would jump the boundary a half-day too
    // early. Caught in testing (2026-07-19): "now" was Sunday 00:12 Israel time, and without this
    // check the code resolved to a weekKey one week ahead of the already-seeded rows, orphaning
    // them. The real current week hasn't started yet at that hour - its boundary is 7 days earlier.
    sundayUtcDate = new Date(sundayUtcDate.getTime() - 7 * 86400000);
    candidate = israeliNoonToUtc(sundayUtcDate.getUTCFullYear(), sundayUtcDate.getUTCMonth() + 1, sundayUtcDate.getUTCDate());
  }
  return candidate;
}

export function currentWeekKey(date = new Date()) {
  const weekStart = currentWeekStartFor(date);
  const { year, month, day } = getIsraeliDateParts(weekStart);
  const thisSundayUtcDate = Date.UTC(year, month - 1, day);
  // Calendar-day difference (always an exact multiple of 7, by construction) - NOT millisecond
  // difference, which would be off during any week that straddles a DST transition.
  const dayDiff = Math.round((thisSundayUtcDate - REFERENCE_SUNDAY_UTC_DATE) / 86400000);
  return REFERENCE_WEEK_KEY + Math.round(dayDiff / 7);
}

/** Start instant (Sunday 12:00 noon Israel local time, real DST-aware) of the given week key, as a Date. */
function weekKeyToStart(weekKey) {
  const dayOffset = (weekKey - REFERENCE_WEEK_KEY) * 7;
  const targetSundayUtcDate = new Date(REFERENCE_SUNDAY_UTC_DATE + dayOffset * 86400000);
  return israeliNoonToUtc(targetSundayUtcDate.getUTCFullYear(), targetSundayUtcDate.getUTCMonth() + 1, targetSundayUtcDate.getUTCDate());
}

/**
 * Fetches/caches the raw board snapshot for the CURRENT week only (previous week's snapshot is
 * read separately, frozen, via getPreviousWeekSnapshot - never re-fetched once the week has
 * passed). A manual force-refresh within the same week just re-pulls monday data for that same
 * week's row; it never deletes the previous week's row (only crossing a real week boundary - a
 * fresh INSERT - triggers the prune below).
 */
export async function getCurrentWeekSnapshot(env, forceRefresh = false) {
  const weekKey = currentWeekKey();

  if (!forceRefresh) {
    const row = await env.DB.prepare(
      'SELECT computed_at, data_json FROM workload_volume_cache WHERE cycle_key = ?'
    ).bind(weekKey).first();
    if (row) {
      return { ...JSON.parse(row.data_json), lastUpdated: row.computed_at, weekKey };
    }
  }

  const data = await getWorkloadData(env);
  const computedAt = new Date().toISOString();

  await env.DB.prepare(
    'INSERT INTO workload_volume_cache (cycle_key, computed_at, data_json) VALUES (?, ?, ?) ' +
    'ON CONFLICT(cycle_key) DO UPDATE SET computed_at = excluded.computed_at, data_json = excluded.data_json'
  ).bind(weekKey, computedAt, JSON.stringify(data)).run();

  // Keep only the current + previous week's row - prune anything older.
  await env.DB.prepare('DELETE FROM workload_volume_cache WHERE cycle_key < ?').bind(weekKey - 1).run();

  return { ...data, lastUpdated: computedAt, weekKey };
}

/** The frozen raw snapshot of the previous (already-locked) week, or null if none exists yet. */
export async function getPreviousWeekSnapshot(env) {
  const weekKey = currentWeekKey();
  const row = await env.DB.prepare(
    'SELECT cycle_key, computed_at, data_json FROM workload_volume_cache WHERE cycle_key = ?'
  ).bind(weekKey - 1).first();
  if (!row) return null;

  return {
    weekKey: row.cycle_key,
    computedAt: row.computed_at,
    data: JSON.parse(row.data_json),
    weekStart: weekKeyToStart(row.cycle_key).toISOString(),
  };
}

/** { weekStart, weekEnd } ISO instants for the current/previous/next week, all Sunday-noon-Israel-time-anchored. */
export function getWeekBoundaries(offset = 0) {
  const weekKey = currentWeekKey() + offset;
  const weekStart = weekKeyToStart(weekKey);
  const weekEnd = weekKeyToStart(weekKey + 1);
  return { weekStart: weekStart.toISOString(), weekEnd: weekEnd.toISOString() };
}

// --- Write-once weekly freeze of "נפח עבודה צפוי"'s monthly target/actual figures (see PLAN.md) ---
// The current week's pace-hours target ("יעד קצב לעמידה בלוז") is meant to reflect what the
// monthly target/actual looked like at the START of the week, exactly like the raw
// planningItems/actualsItems above are already frozen for the week - not a continuously-live
// recompute, which was the actual bug: hours logged mid-week were eating into "remaining" and
// visibly shrinking the target throughout the week even though nothing about the plan itself had
// changed (a project could log enough hours mid-week to already exceed its monthly target,
// driving its pace-hours contribution to 0 - correct given a live recompute, but not what a
// frozen-at-week-start figure should show).
//
// The Worker can't compute this itself - the underlying figures (effectiveTargetHoursByMonth /
// monthlyActualHoursByMonth) come from the client's full payment-policy/debt-credit pipeline
// (useDashboardData), which isn't ported here. So the CLIENT computes it live (as it always has)
// and the Worker just persists the FIRST value seen for a given week - the same "client computes,
// server freezes" pattern already used by projectMonthHistoryStore.js/scheduleHistoryService.js.
//
// True write-once (unlike project_month_history's COALESCE backfill case - there's no legacy data
// to backfill here): a (week, project, month) row, once written, is NEVER updated again. Plain
// DO NOTHING makes repeat PUTs from multiple tabs/re-renders/devices harmless no-ops instead of
// clobbering the frozen value with a later, already-live-drifted one - and, per the lesson from
// the earlier quota-crisis incident (see PLAN.md), an idempotent no-op write is safe even if the
// client ends up calling this more than once.

export async function getPaceTargetSnapshot(env, weekKey) {
  const { results } = await env.DB.prepare(
    'SELECT project_id, month_key, target, actual FROM pace_target_snapshot WHERE week_key = ?'
  ).bind(weekKey).all();

  const byProject = {};
  for (const row of results) {
    if (!byProject[row.project_id]) byProject[row.project_id] = {};
    byProject[row.project_id][row.month_key] = { target: row.target, actual: row.actual };
  }
  return byProject;
}

// entries: [{ projectId, monthKey, target, actual }]
export async function writePaceTargetSnapshot(env, weekKey, entries) {
  if (!entries?.length) return getPaceTargetSnapshot(env, weekKey);

  const statements = entries.map(({ projectId, monthKey, target, actual }) =>
    env.DB.prepare(
      `INSERT INTO pace_target_snapshot (week_key, project_id, month_key, target, actual)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(week_key, project_id, month_key) DO NOTHING`
    ).bind(weekKey, projectId, monthKey, target, actual)
  );

  await env.DB.batch(statements);
  return getPaceTargetSnapshot(env, weekKey);
}
