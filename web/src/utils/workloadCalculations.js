/**
 * Workload calculation logic:
 * - Expected volume: forward-looking total hours per project for the next 2 weeks / month.
 * - Employee monthly load: percentage of capacity used, attributed by who really logged
 *   the time (not the task's current assignee), adjustable by manually entered vacation/sick days.
 */
import { getWorkingDaysInMonth, getWorkingDaysBetween, getWorkingDaysInWindow } from './dateUtils';
import { HOUR_TALLY_FINAL_STATUSES, getRelevantTaskIds, resolveCompletionDate } from './paymentPolicyCalculations';

export const UNKNOWN_LOGGER_KEY = 'unknown';
export const UNLINKED_PROJECT_KEY = 'unlinked';
export const FULL_DAY_HOURS = 8.6; // standard 5-day, 43-hour work week

const DEFAULT_DONE_STATUSES = ['בוצע', 'בוטל'];
const COMPLETED_STATUS = 'בוצע';
const CANCELLED_STATUS = 'בוטל';

// Studio owner / non-tracked accounts - excluded from the employee load view, and (see
// ProjectManagementTab.jsx) from the per-employee breakdown rows in "ניהול פרויקט" - verified
// against the real user list (/debug/workload-data), not guessed.
export const EXCLUDED_USER_IDS = ['68169230', '97146911']; // Maayan Davidi, Alon Zayger

/** Build a lookup Map<userId(string), name> from the backend's `users` array. */
export const buildUsersMap = (users) => new Map((users || []).map((u) => [String(u.id), u.name]));

const monthKeyFromDate = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const getOrCreate = (map, key, create) => {
  if (!map.has(key)) map.set(key, create());
  return map.get(key);
};

const sumLoggedHours = (item) =>
  (item.history || []).reduce((sum, h) => sum + h.durationInSeconds / 3600, 0);

const UNSPECIFIED_TASK_TYPE = '(ללא סוג)';

/**
 * Map<taskType, ratio> + a global fallback ratio - "on average, how many times over its own
 * estimate does a task of this type end up costing, once it's actually overrun" - recomputed
 * fresh on every call (never cached/frozen - see PLAN.md), from real board data only.
 *
 * Deliberately scoped to `HOUR_TALLY_FINAL_STATUSES` (בוצע + אישור מומחה תוכן + ממתין לאישור),
 * NOT the stricter `COMPLETION_STATUSES` used for completion-percentage tracking - the user's own
 * call: since this average is always live and never frozen, a task counted here before its hour
 * count is 100% final just self-corrects the next time this runs if more hours land on it later.
 *
 * `taskType` is discovered dynamically from whatever values actually exist in the data - never a
 * hardcoded list, so a brand-new type (e.g. "הפקת וידאו") starts getting its own average the
 * moment it has history, with zero code changes. A type with no qualifying (overrun + finished)
 * samples of its own falls back to `globalAverageRatio` (pooled across every type together).
 */
export function calculateOverrunRatiosByTaskType(actualsItems) {
  const byType = new Map(); // taskType -> { sumRatio, count }
  let globalSumRatio = 0;
  let globalCount = 0;

  (actualsItems || []).forEach((item) => {
    if (!HOUR_TALLY_FINAL_STATUSES.includes(item.status)) return;
    const expectedHours = item.expectedHours || 0;
    if (expectedHours <= 0) return;
    const loggedHours = sumLoggedHours(item);
    if (loggedHours <= expectedHours) return; // only tasks that actually overran feed the average

    const ratio = loggedHours / expectedHours;
    const taskType = item.taskType || UNSPECIFIED_TASK_TYPE;
    const entry = byType.get(taskType) || { sumRatio: 0, count: 0 };
    entry.sumRatio += ratio;
    entry.count += 1;
    byType.set(taskType, entry);

    globalSumRatio += ratio;
    globalCount += 1;
  });

  // No overrun history anywhere at all yet - assume no overrun (ratio 1, i.e. "trust the
  // estimate") rather than an arbitrary guess.
  const globalAverageRatio = globalCount > 0 ? globalSumRatio / globalCount : 1;

  const ratiosByType = new Map();
  byType.forEach((entry, taskType) => ratiosByType.set(taskType, entry.sumRatio / entry.count));

  return { ratiosByType, globalAverageRatio };
}

/**
 * Map<taskType, { avgHours, sampleCount }> - for the "ניהול פרויקט" info screen (see PLAN.md).
 * DIFFERENT metric from calculateOverrunRatiosByTaskType above: this is "how long does a task of
 * this type typically take, total" (average REAL logged hours across every task already "בוצע"
 * of that type, whether or not it overran its own estimate) - not an overrun ratio. Strictly
 * "בוצע" only (not HOUR_TALLY_FINAL_STATUSES) - per the user's explicit call for this specific
 * screen, since this is a benchmarking reference, not a self-correcting live forecast input.
 * `taskType` discovered dynamically, same as calculateOverrunRatiosByTaskType.
 */
export function calculateAverageTaskDurationByType(actualsItems) {
  const byType = new Map(); // taskType -> { sumHours, count }

  (actualsItems || []).forEach((item) => {
    if (item.status !== COMPLETED_STATUS) return;
    const hours = sumLoggedHours(item);
    if (hours <= 0) return;
    const taskType = item.taskType || UNSPECIFIED_TASK_TYPE;
    const entry = byType.get(taskType) || { sumHours: 0, count: 0 };
    entry.sumHours += hours;
    entry.count += 1;
    byType.set(taskType, entry);
  });

  const result = new Map();
  byType.forEach((entry, taskType) => {
    result.set(taskType, { avgHours: entry.sumHours / entry.count, sampleCount: entry.count });
  });
  return result;
}

// Types the user considers "not real production work" for the purposes of both hiding a project
// from "נפח עבודה צפוי" (below) and excluding rows from the "ניהול פרויקט" average-duration table.
const NON_PRODUCTION_TASK_TYPES = ['פרילאנס', 'ניהול'];

/**
 * Set<projectId> - projects whose every RELEVANT task (getRelevantTaskIds' definition: has a
 * real status, not cancelled, not monday's "Milestone" marker) is exclusively "פרילאנס" and/or
 * "ניהול" - i.e. a project that's pure freelance/management overhead with no real production
 * task type in it at all. Per the user's explicit request, such a project shouldn't appear in
 * "נפח עבודה צפוי" (there's nothing there to plan weekly capacity around). A project with ZERO
 * relevant tasks is a different case (no data yet) and is NOT included here.
 */
export function calculateManagementOnlyProjectIds(actualsItems) {
  const byProject = new Map(); // projectId -> actualsItems[]
  (actualsItems || []).forEach((item) => {
    const projectId = item.linkedItems?.[0]?.id;
    if (!projectId) return;
    getOrCreate(byProject, projectId, () => []).push(item);
  });

  const result = new Set();
  byProject.forEach((items, projectId) => {
    const relevantIds = new Set(getRelevantTaskIds(items));
    const relevantItems = items.filter((item) => relevantIds.has(item.id));
    if (relevantItems.length === 0) return;
    const allNonProduction = relevantItems.every((item) => NON_PRODUCTION_TASK_TYPES.includes(item.taskType));
    if (allNonProduction) result.add(projectId);
  });
  return result;
}

/**
 * Map<userId, {avgHours, taskCount}> - for the per-task-type accordion breakdown in "ניהול
 * פרויקט". DIFFERENT attribution than task-assignment (`assignedUserIds`): per the user's
 * explicit instruction, this counts by who actually LOGGED the hours (`history[].startedUserId`
 * on each individual time-entry), not by who the task is assigned to - a task can have several
 * people log time against it, and each contributes only their own logged hours here. Scoped to
 * the same "בוצע" + taskType condition as calculateAverageTaskDurationByType so the per-employee
 * breakdown always sums back to the same population of tasks as the parent row.
 */
export function calculateEmployeeAveragesByTaskType(actualsItems, taskType) {
  const byUser = new Map(); // userId -> { sumHours, taskIds: Set }

  (actualsItems || []).forEach((item) => {
    if (item.status !== COMPLETED_STATUS) return;
    if ((item.taskType || UNSPECIFIED_TASK_TYPE) !== taskType) return;

    (item.history || []).forEach((log) => {
      const userId = log.startedUserId;
      if (!userId) return;
      const hours = (log.durationInSeconds || 0) / 3600;
      if (hours <= 0) return;
      const entry = getOrCreate(byUser, userId, () => ({ sumHours: 0, taskIds: new Set() }));
      entry.sumHours += hours;
      entry.taskIds.add(item.id);
    });
  });

  const result = new Map();
  byUser.forEach((entry, userId) => {
    result.set(userId, { avgHours: entry.sumHours / entry.taskIds.size, taskCount: entry.taskIds.size });
  });
  return result;
}

/**
 * The most recent date (as an ISO string, or null if the user has never logged anything) any
 * work-hour log entry attributes to this user, across EVERY task regardless of type or status -
 * used to detect an "inactive" employee (see PLAN.md: no hours logged by them anywhere in the
 * last 30 days) for hiding stale rows from the per-employee breakdown.
 */
export function getMostRecentLogDate(actualsItems, userId) {
  let latest = null;
  (actualsItems || []).forEach((item) => {
    (item.history || []).forEach((log) => {
      if (log.startedUserId !== userId || !log.startDate) return;
      if (!latest || new Date(log.startDate) > new Date(latest)) latest = log.startDate;
    });
  });
  return latest;
}

/**
 * Per-project weekly task-completion progress, in TASK COUNT - not hours (see PLAN.md: hours
 * estimates can be wrong, task-count is a real countable fact). Map<projectId, {
 *   remainingCount, plannedCount, actualCount, plannedPercent, actualPercent
 * }>.
 *
 * Denominator ("how many tasks are still left"): every relevant task (getRelevantTaskIds' own
 * definition - excludes no-status, cancelled, and monday's "Milestone" marker) MINUS tasks
 * already "בוצע" (the strict completion status - see COMPLETION_STATUSES in
 * paymentPolicyCalculations.js). "אישור מומחה תוכן" and "ממתין לאישור" both still count as
 * "remaining" here, per the user's explicit call (2026-07-13) - neither guarantees the real work
 * is actually finished.
 *
 * `plannedCount` = how many of the remaining tasks have a `weeklyTimeline` overlapping this
 * specific week. `actualCount` = how many tasks genuinely transitioned to "בוצע" (via
 * resolveCompletionDate/taskDoneDates - the same real-transition-date machinery already built
 * for the Backlog tab) during this specific week - note this looks at ALL relevant tasks, not
 * just the "remaining" subset, since a task that completed THIS week was by definition still
 * remaining at the start of the week.
 */
export function calculateWeeklyTaskProgress(actualsItems, weekStart, weekEnd, taskDoneDates) {
  const byProject = new Map(); // projectId -> actualsItems[]
  (actualsItems || []).forEach((item) => {
    const projectId = item.linkedItems?.[0]?.id || UNLINKED_PROJECT_KEY;
    getOrCreate(byProject, projectId, () => []).push(item);
  });

  const start = new Date(weekStart);
  const end = new Date(weekEnd);
  const result = new Map();

  byProject.forEach((projectItems, projectId) => {
    const relevantIds = new Set(getRelevantTaskIds(projectItems));
    const relevantTasks = projectItems.filter((t) => relevantIds.has(String(t.id)));
    const remainingTasks = relevantTasks.filter((t) => t.status !== COMPLETED_STATUS);
    const remainingCount = remainingTasks.length;

    const plannedCount = remainingTasks.filter((t) => {
      if (!t.weeklyTimeline?.from || !t.weeklyTimeline?.to) return false;
      const from = new Date(t.weeklyTimeline.from);
      const to = new Date(t.weeklyTimeline.to);
      return from < end && to >= start;
    }).length;

    // "בפועל" counts a task the moment it reaches "בוצע", "אישור מומחה תוכן", OR "ממתין לאישור" -
    // per the user's explicit request, moving into either of the two approval-pending statuses
    // still represents real forward progress worth crediting THIS week, even though (elsewhere,
    // e.g. COMPLETION_STATUSES/getRelevantTaskIds' denominator here) those statuses are NOT
    // treated as fully "done" - a task can count as progress once, then keep appearing in
    // remainingCount every week after until it's genuinely "בוצע".
    const actualCount = relevantTasks.filter((t) => {
      if (!HOUR_TALLY_FINAL_STATUSES.includes(t.status)) return false;
      const date = resolveCompletionDate(t, taskDoneDates);
      return date && date >= start && date < end;
    }).length;

    result.set(projectId, {
      remainingCount,
      plannedCount,
      actualCount,
      plannedPercent: remainingCount > 0 ? (plannedCount / remainingCount) * 100 : 0,
      actualPercent: remainingCount > 0 ? (actualCount / remainingCount) * 100 : 0,
    });
  });

  return result;
}

/**
 * Map<projectId, hours> - real hours logged within [weekStart, weekEnd), from CURRENT live data
 * (never frozen/cached) - the "בפועל" half of the "previous week" planned-vs-actual comparison
 * (see PLAN.md). Deliberately NOT the frozen raw snapshot - hours can be logged retroactively
 * after the week already locked, so re-summing from live data on every read is what makes this
 * stay accurate over time, unlike the frozen "מתוכנן" side which is a genuine point-in-time
 * snapshot of what was planned back when the week was still current.
 */
export function calculateActualHoursForWeek(actualsItems, weekStart, weekEnd) {
  const start = new Date(weekStart);
  const end = new Date(weekEnd);
  const result = new Map();

  (actualsItems || []).forEach((item) => {
    const projectId = item.linkedItems?.[0]?.id || UNLINKED_PROJECT_KEY;
    let hours = 0;
    (item.history || []).forEach((h) => {
      if (!h.durationInSeconds || !h.startDate) return;
      const d = new Date(h.startDate);
      if (d >= start && d < end) hours += h.durationInSeconds / 3600;
    });
    if (hours > 0) result.set(projectId, (result.get(projectId) || 0) + hours);
  });

  return result;
}

/**
 * Forward-looking hours/money contribution of one still-open task to the next-2-weeks window.
 *
 * Inclusion is decided ONLY by whether the task's own `weeklyTimeline` overlaps the window -
 * regardless of whether it's overrun. An earlier version ignored the timeline entirely once a
 * task went overrun (projecting forward from its own overrun rate instead), on the theory that
 * "nobody re-dates a task every time it slips" - but that let old, abandoned overrun tasks
 * (no timeline overlap AND no recent logging) keep showing up in the forecast forever. Per the
 * user's explicit call: trust the weeklyTimeline as set in monday, same as any other task - a
 * task that's overrun but still legitimately scheduled in the window is flagged via `isOverrun`
 * (see ProjectTasksDrawer.jsx). Inclusion is NEVER extrapolated from pace - only the AMOUNT an
 * already-included overrun task contributes now comes from `overrunRatios` (see
 * calculateOverrunRatiosByTaskType above) instead of clamping straight to 0.
 */
function calculateTaskWindowContribution(item, { today, windowEnd, overrunRatios }) {
  const expectedHours = item.expectedHours || 0;
  if (expectedHours <= 0) return null;
  if (!item.weeklyTimeline?.from || !item.weeklyTimeline?.to) return null;

  const taskFrom = new Date(item.weeklyTimeline.from);
  const taskTo = new Date(item.weeklyTimeline.to);
  if (taskFrom > windowEnd || taskTo < today) return null;

  const loggedHours = sumLoggedHours(item);
  const isOverrun = loggedHours >= expectedHours;

  let remainingHours;
  if (isOverrun && overrunRatios) {
    // "Projected total" = this task's own estimate × the historical overrun ratio for its type
    // (or the global fallback) - NOT the full original estimate again (would overstate a task
    // that's 90% done), and NOT 0 (would understate a task that's genuinely still active).
    const ratio = overrunRatios.ratiosByType.get(item.taskType) ?? overrunRatios.globalAverageRatio;
    const projectedTotalHours = expectedHours * ratio;
    remainingHours = Math.max(0, projectedTotalHours - loggedHours);
  } else {
    remainingHours = Math.max(0, expectedHours - loggedHours);
  }

  const effectiveStart = taskFrom > today ? taskFrom : today;
  const totalRemainingDays = getWorkingDaysBetween(effectiveStart, taskTo);
  const overlapEnd = taskTo < windowEnd ? taskTo : windowEnd;
  const overlapDays = Math.max(0, getWorkingDaysBetween(effectiveStart, overlapEnd));
  const share = totalRemainingDays > 0 ? overlapDays / totalRemainingDays : 1;

  return { hours: remainingHours * share, isOverrun, loggedHours, expectedHours };
}

/**
 * Total expected hours/money per project (and studio-wide) for the next 2 weeks, plus
 * per-project task-count progress (how much of the whole project this window represents).
 * Excludes done/cancelled tasks from the window sum.
 *
 * opts.policies (payment policies keyed by project id) and planningItems' dynamicTimeline
 * are used, for milestone-billed projects only, to compute a second forward-looking figure:
 * how many hours need to be "pushed" into the next 2 weeks to stay on pace for the deadline
 * (byProjectPaceHours) - since task assignment only ever happens 1-2 days ahead, this is
 * the one actionable staffing signal available, shown alongside (not replacing) byProject.
 */
export function calculateExpectedVolumeSummary(actualsItems, planningItems, opts = {}) {
  const doneStatuses = opts.doneStatuses || DEFAULT_DONE_STATUSES;
  const policies = opts.policies || {};
  const today = opts.today ? new Date(opts.today) : new Date();
  if (!opts.keepTimeOfDay) today.setHours(0, 0, 0, 0);

  // opts.windowEnd lets a caller pass an exact boundary (e.g. a Sunday-07:00 week edge) instead
  // of the default "today + 14 days" - used by the weekly current/previous/next views (see
  // PLAN.md). The planned/target side of a week is meant to work at WEEKLY granularity, not
  // daily - `today` is pinned by the caller to the week's own start (exactly like next/previous
  // week already do), so a task assigned earlier in the week doesn't silently drop out of
  // "this week" just because a few of its days have already gone by. An earlier version pinned
  // `today` to the real current moment for the current-week case specifically ("so a task whose
  // days already elapsed earlier this week correctly stop counting") - the user explicitly
  // rejected this: the planned side must stay frozen to the week's own start, exactly like the
  // planned side of "previous week" is frozen to when that week began; only the separately-live
  // ACTUAL/logged-hours figures (calculateWeeklyTaskProgress, computed elsewhere from a
  // always-fresh fetch) are meant to move throughout the week.
  const windowEnd = opts.windowEnd ? new Date(opts.windowEnd) : new Date(today.getTime() + 14 * 86400000);

  // "יעד קצב לעמידה בלוז" (byProjectPaceHours, below) is anchored to the week's own real start
  // (opts.paceWindowStart - the Sunday the week began), NOT `today` (which stays real "now" for
  // the task-inclusion logic below, on purpose - a task whose days already elapsed earlier this
  // week correctly stops counting there). Falls back to `today` for callers that don't pass it
  // (next-week/previous-week views, where `today` already IS that week's own start). windowEnd is
  // an EXCLUSIVE boundary (the next Sunday 07:00 that starts the following week - see
  // getWeekStart/formatWeekRange, which already treats it the same way when displaying the date
  // range) - subtracted a day below wherever it needs treating as the week's real inclusive last
  // day (getWorkingDaysBetween/getWorkingDaysInWindow are both inclusive of both ends).
  const paceWindowStart = opts.paceWindowStart ? new Date(opts.paceWindowStart) : today;

  const byProject = new Map();
  const byProjectMoney = new Map();
  const byProjectProgress = new Map();
  const byProjectTasks = new Map();
  const projectPlannedHoursTotal = new Map(); // projectId -> sum of expectedHours across ALL its non-cancelled tasks
  let total = 0;
  let totalMoney = 0;

  // Pass 1: task-count progress per project - every non-cancelled task counts toward
  // the project's total, regardless of timeline/window, so the bar reflects real completion.
  actualsItems.forEach((item) => {
    if (item.status === CANCELLED_STATUS) return;
    const projectId = item.linkedItems?.[0]?.id || UNLINKED_PROJECT_KEY;
    const progress = getOrCreate(byProjectProgress, projectId, () => ({ totalTasks: 0, doneTasks: 0, windowTasks: 0 }));
    progress.totalTasks += 1;
    if (item.status === COMPLETED_STATUS) progress.doneTasks += 1;
    projectPlannedHoursTotal.set(projectId, (projectPlannedHoursTotal.get(projectId) || 0) + (item.expectedHours || 0));
  });

  // Computed once per call, from the WHOLE board (pooled across every project) - see
  // calculateOverrunRatiosByTaskType's own comment for why this is never cached/frozen.
  const overrunRatios = calculateOverrunRatiosByTaskType(actualsItems);

  // Pass 2: forward-looking hours/money + task detail, for open tasks relevant to the window.
  actualsItems
    .filter((item) => !doneStatuses.includes(item.status))
    .forEach((item) => {
      const contribution = calculateTaskWindowContribution(item, { today, windowEnd, overrunRatios });
      if (!contribution) return;
      // Zero-hour overrun tasks still surface (flagged) so an over-budget-but-in-window task
      // isn't silently hidden - but a zero-hour non-overrun task carries no signal.
      if (contribution.hours <= 0 && !contribution.isOverrun) return;

      const projectId = item.linkedItems?.[0]?.id || UNLINKED_PROJECT_KEY;
      const money = contribution.hours * (item.hourlyRate || 0);

      byProject.set(projectId, (byProject.get(projectId) || 0) + contribution.hours);
      byProjectMoney.set(projectId, (byProjectMoney.get(projectId) || 0) + money);
      total += contribution.hours;
      totalMoney += money;

      const progress = getOrCreate(byProjectProgress, projectId, () => ({ totalTasks: 0, doneTasks: 0, windowTasks: 0 }));
      progress.windowTasks += 1;

      const taskList = getOrCreate(byProjectTasks, projectId, () => []);
      taskList.push({
        id: item.id,
        name: item.name,
        hours: contribution.hours,
        money,
        assignedUserIds: item.assignedUserIds || [],
        isOverrun: contribution.isOverrun,
        loggedHours: contribution.loggedHours,
        expectedHours: contribution.expectedHours,
      });
    });

  const projectNames = new Map((planningItems || []).map((p) => [p.id, p.name]));
  const planningById = new Map((planningItems || []).map((p) => [p.id, p]));

  // Milestone-billed projects: pace-required hours for the window - what's REALLY still needed
  // THIS WEEK, based on the SPECIFIC calendar month(s) the week falls in. See PLAN.md's
  // 2026-07-16 "month-isolated pace model" round for the full reasoning (including two rejected
  // alternatives) - the short version: the Backlog's own "יעד עדכני" for a month is LOCKED once
  // that month starts (debt/credit only ever gets assigned to FUTURE months, never the current
  // one - see calculateNetFinancials), so a week's pace-hours must be driven by whichever
  // month it actually falls in, not a blended average across the whole rest of the project.
  // Using a FUTURE month's already-debt-adjusted target for a week that's still in the current
  // month was tried and explicitly rejected by the user - the future month's target isn't
  // relevant yet to "how many hours to work this week".
  //
  // For each open month: that month's own locked target (monthlyTargetsByProject, from the
  // Backlog's effectiveTargetHoursByMonth) minus whatever's ALREADY been done in that month
  // specifically (0 for a future month that hasn't started - it naturally has no actual yet),
  // divided by that month's own remaining working days (today, or the month's own start if
  // later, through the earlier of the month's end or the project's real dynamicTo). Then only
  // the portion of the window that overlaps THAT month contributes to this week's figure -
  // summed across months for a week that happens to straddle a month boundary.
  const byProjectPaceHours = new Map();
  const milestoneProjectIds = new Set();
  // A project whose own dynamic deadline already passed BEFORE this week even starts (e.g.
  // dynamicTo = 16.7, viewing the week of 19-25.7) still needs a pace-hours number shown - per
  // the user's explicit call, the work doesn't disappear just because the schedule ran out, it
  // necessarily spills into whatever week comes next since the project isn't actually finished.
  // What's needed instead is a visible warning (see ProjectBar/OverdueBadge) that the project's
  // own timeline needs extending in monday - silently hiding the number would hide the problem,
  // not solve it. `overdueProjectIds` flags which projects are in this state for this window.
  const overdueProjectIds = new Set();
  const overdueDynamicTo = new Map();
  const monthlyTargetsByProject = opts.monthlyTargetsByProject || new Map();
  // "How much is really left" is asked relative to opts.paceRealNow if the caller pins one,
  // otherwise the actual current moment. For "next week", the caller intentionally leaves this
  // as real "now" (independent of `today`/`paceWindowStart` above, which are pinned to the
  // future week's own start) - a future week's pace-target should reflect today's real progress
  // against the deadline. For "current week", the caller pins this to the week's own start (same
  // reasoning as the `today`/windowEnd change above): the target must work at weekly, not daily,
  // granularity - it shouldn't keep shrinking as days elapse within the week. Pinning it to real
  // "now" for the current week was the bug: by Thursday/Friday/Saturday, "days remaining in this
  // month as of right now" collapses toward zero even though the week's own target hasn't
  // actually changed, dragging the whole week's pace-hours figure down to 0 alongside it.
  const realNow = opts.paceRealNow ? new Date(opts.paceRealNow) : new Date();
  realNow.setHours(0, 0, 0, 0);
  const weekEndInclusive = new Date(windowEnd.getTime() - 86400000);
  projectPlannedHoursTotal.forEach((totalPlannedHours, projectId) => {
    const policy = policies[projectId];
    if (!policy?.milestones?.length) return;
    milestoneProjectIds.add(projectId);

    const planning = planningById.get(projectId);
    const dynamicTo = planning?.dynamicTimeline?.to;
    if (!dynamicTo) return;
    const dynamicToDate = new Date(dynamicTo);

    const isOverdueForThisWeek = dynamicToDate < paceWindowStart;
    if (isOverdueForThisWeek) {
      overdueProjectIds.add(projectId);
      overdueDynamicTo.set(projectId, dynamicTo);
    }

    const monthlyTargets = monthlyTargetsByProject.get(projectId);
    if (!monthlyTargets) return; // not loaded yet - no number rather than a stale/wrong one

    if (isOverdueForThisWeek) {
      // No calendar left to spread this over for THIS week - show the full remaining amount
      // (summed across every still-open month) as a lump sum (still owed), alongside the
      // warning, rather than a per-week rate.
      let totalRemaining = 0;
      monthlyTargets.forEach(({ target, actual }) => { totalRemaining += Math.max(0, target - actual); });
      byProjectPaceHours.set(projectId, totalRemaining);
      return;
    }

    let paceHoursThisWeek = 0;
    monthlyTargets.forEach(({ target, actual }, monthKey) => {
      const [y, m] = monthKey.split('-').map(Number);
      const monthStartNatural = new Date(y, m - 1, 1);
      const monthStart = monthStartNatural > realNow ? monthStartNatural : realNow;
      const monthEndNatural = new Date(y, m, 0); // last calendar day of the month
      const monthEnd = monthEndNatural < dynamicToDate ? monthEndNatural : dynamicToDate;
      if (monthStart > monthEnd) return;

      const remainingHoursThisMonth = Math.max(0, target - actual);
      const monthOwnRemainingDays = getWorkingDaysBetween(monthStart, monthEnd);
      if (monthOwnRemainingDays <= 0) return;
      const monthDailyRate = remainingHoursThisMonth / monthOwnRemainingDays;

      const overlapWorkingDays = getWorkingDaysInWindow(paceWindowStart, weekEndInclusive, monthStart, monthEnd);
      if (overlapWorkingDays > 0) paceHoursThisWeek += monthDailyRate * overlapWorkingDays;
    });
    byProjectPaceHours.set(projectId, paceHoursThisWeek);
  });

  return {
    total, totalMoney, byProject, byProjectMoney, byProjectProgress, byProjectTasks, projectNames,
    byProjectPaceHours, milestoneProjectIds, overdueProjectIds, overdueDynamicTo,
  };
}

/**
 * Actual hours already worked, attributed by the REAL logging user
 * (history[].startedUserId, falling back to endedUserId, falling back to
 * UNKNOWN_LOGGER_KEY) - never by the `person` column.
 * Returns: Map<loggerId, Map<monthKey, Map<projectId, Map<taskId, {name, hours}>>>>
 */
function buildActualHoursDetail(actualsItems) {
  const detail = new Map();

  actualsItems.forEach((item) => {
    const projectId = item.linkedItems?.[0]?.id || UNLINKED_PROJECT_KEY;

    (item.history || []).forEach((entry) => {
      const loggerId = entry.startedUserId || entry.endedUserId || UNKNOWN_LOGGER_KEY;
      const monthKey = monthKeyFromDate(entry.startDate);
      const hours = entry.durationInSeconds / 3600;

      const byMonth = getOrCreate(detail, loggerId, () => new Map());
      const byProject = getOrCreate(byMonth, monthKey, () => new Map());
      const byTask = getOrCreate(byProject, projectId, () => new Map());

      const taskEntry = byTask.get(item.id) || { name: item.name, hours: 0 };
      taskEntry.hours += hours;
      byTask.set(item.id, taskEntry);
    });
  });

  return detail;
}

/**
 * Per-employee, per-month workload: actual hours vs. capacity (working days in the
 * calendar month, minus manually entered vacation/sick days, times FULL_DAY_HOURS).
 * `overrides` is the raw shape returned by GET /api/attendance-overrides:
 * { [userId]: { [monthKey]: { vacationDays, sickDays } } }
 * Returns: Map<loggerId, Map<monthKey, {
 *   actualHours, workingDays, vacationDays, sickDays, capacityHours,
 *   loadPercent (null if capacityHours <= 0), byProject: Map<projectId, Map<taskId, {name, hours}>>
 * }>>
 */
export function calculateEmployeeMonthlyLoad(actualsItems, monthKeys, overrides = {}) {
  const detail = buildActualHoursDetail(actualsItems);
  const result = new Map();

  detail.forEach((byMonth, loggerId) => {
    if (EXCLUDED_USER_IDS.includes(loggerId)) return;

    const monthMap = new Map();

    monthKeys.forEach((monthKey) => {
      const byProject = byMonth.get(monthKey) || new Map();
      let actualHours = 0;
      byProject.forEach((byTask) => byTask.forEach((t) => { actualHours += t.hours; }));

      const [year, month] = monthKey.split('-').map(Number);
      const workingDays = getWorkingDaysInMonth(year, month - 1);

      const override = overrides?.[loggerId]?.[monthKey] || {};
      const vacationDays = override.vacationDays || 0;
      const sickDays = override.sickDays || 0;
      const availableDays = Math.max(0, workingDays - vacationDays - sickDays);
      const capacityHours = availableDays * FULL_DAY_HOURS;
      const loadPercent = capacityHours > 0 ? (actualHours / capacityHours) * 100 : null;

      monthMap.set(monthKey, {
        actualHours,
        workingDays,
        vacationDays,
        sickDays,
        capacityHours,
        loadPercent,
        byProject,
      });
    });

    result.set(loggerId, monthMap);
  });

  return result;
}

/** The last `count` months (current first), as "YYYY-MM" keys. */
export function getRecentMonthKeys(count, today = new Date()) {
  const keys = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}
