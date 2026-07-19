/**
 * Payment-policy calculations: projects billed by milestones (fixed % of totalValue on a
 * trigger date) instead of the default flat proration of totalValue across the baseline
 * timeline.
 *
 * A milestone has no separate "paid" confirmation step - defining it is both its planned
 * target AND its actual for that month, for MONEY purposes only (see CLAUDE.md for why).
 *
 * Money, however, is no longer what drives the month-cell circles for a milestone project:
 * once *any* month is milestone-based, ALL months (including milestone months) track
 * cumulative TASK-COMPLETION PERCENTAGE instead - a milestone amount is just an extra line
 * shown in that month's tooltip, not a circle input. This is because in-between milestones
 * there is no money movement at all, so money can't answer "are we on pace" - but completion
 * percentage always can. See CLAUDE.md for the full reasoning (raw hours were rejected as an
 * input - an estimate is not a reliable target/actual pair; a "no memory" recompute-from-
 * scratch model was also rejected - debt/credit rollover between months is still wanted, just
 * computed on percentages).
 */
import { calculateBaselinePlan, calculateActuals } from './financialCalculations';

const CANCELLED_STATUS = 'בוטל';
// monday's own built-in "Milestone" status marker (in English, distinct from this project's own
// payment-policy milestones) - used for checkpoint/marker rows on a board's timeline (verified
// against real data 2026-07-12: 5 such rows, mostly 0 expectedHours, names like "סיום עריכת
// סרטוני פרזנטור" - not real deliverable work, shouldn't count toward completion tracking or
// the last-active-month check.
const MILESTONE_MARKER_STATUS = 'Milestone';

// Statuses that count as "complete" for task-completion-percentage tracking. STRICT - only
// "בוצע" itself. Reversed from an earlier decision (2026-07-13) that also counted "אישור מומחה
// תוכן" (content-expert approval) as finished - the user explicitly walked that back: a task
// sitting in "אישור מומחה תוכן" is NOT guaranteed to be truly done, it can still come back for
// more work after review. Scoped to payment-policy completion tracking (the overall-progress
// badge, the monthly/weekly completion-flow map, and the milestone auto-shift check) - the
// separate "נפח עבודה צפוי" tab's own done/cancelled filter is untouched, and the historical
// overrun-average calculation (see HOUR_TALLY_FINAL_STATUSES below) deliberately uses a wider,
// separate set for a different reason.
const COMPLETION_STATUSES = ['בוצע'];

// Wider "good enough for a final hour-tally" set, used ONLY by the historical overrun-average
// calculation (calculateAverageOverrunRatio) - NOT the same as COMPLETION_STATUSES above, and
// deliberately so: the user wants "אישור מומחה תוכן" AND "ממתין לאישור" included there too, even
// though neither counts as truly "done" for completion-percentage purposes. Reasoning (the
// user's own): that calculation re-runs fresh every time (never frozen), so a task counted here
// before it's 100% final just self-corrects on the next run if more hours get logged later -
// unlike completion-percentage tracking, a slightly-early data point isn't a real problem here.
export const HOUR_TALLY_FINAL_STATUSES = ['בוצע', 'אישור מומחה תוכן', 'ממתין לאישור'];

const monthKeyFromDate = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const addMonths = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

/**
 * Resolves a milestone's status against the CURRENT dynamic timeline (not the frozen
 * baseline), so a milestone tied to "end" automatically follows the project if it's extended,
 * without needing to be edited manually.
 *
 * A milestone can be pulled EARLIER than its own nominal trigger date by two independent
 * mechanisms: (1) an optional secondary time-condition, `monthsAfterStart` - "or after X
 * months from the project's dynamic start, whichever is earlier than the primary trigger", and
 * (2) for an "end" trigger only, `lastActiveDate` (see calculateLastActiveMonth) pulling the
 * milestone back to the real last-active month once every relevant task is actually done
 * earlier than the raw dynamicEnd. Both represent the SAME real-world situation: the milestone
 * is landing sooner than its plain, nominal date would suggest - and per the user's explicit
 * rule (2026-07-12), ANY such advancement needs a human "אשר" before it counts toward
 * money/target/actual, regardless of which mechanism caused it. So both are unified into one
 * `wasAdvanced` check (resolvedDate earlier than nominalDate, the raw trigger date with neither
 * mechanism applied), gated by the same single `timeConfirmed` flag - not two separate ones.
 * `lastActiveDate` never pushes the milestone LATER than dynamicEnd itself, and doesn't affect
 * the monthsAfterStart secondary condition's own date.
 */
export const getMilestoneStatus = (milestone, dynamicStart, dynamicEnd, lastActiveDate = null) => {
  const nominalDate = milestone.trigger === 'start' ? new Date(dynamicStart)
    : milestone.trigger === 'end' ? new Date(dynamicEnd)
    : milestone.trigger === 'custom' && milestone.customDate ? new Date(milestone.customDate)
    : null;

  const primaryDate = milestone.trigger === 'end' && lastActiveDate && new Date(lastActiveDate) < new Date(dynamicEnd)
    ? new Date(lastActiveDate)
    : nominalDate;

  const secondaryDate = milestone.monthsAfterStart
    ? addMonths(dynamicStart, Number(milestone.monthsAfterStart))
    : null;

  let resolvedDate = primaryDate;
  if (secondaryDate && (!primaryDate || secondaryDate < primaryDate)) {
    resolvedDate = secondaryDate;
  }

  if (!resolvedDate) return { monthKey: null, isPendingTimeConfirmation: false };

  const wasAdvanced = nominalDate && resolvedDate < nominalDate;
  const isPendingTimeConfirmation = wasAdvanced && !milestone.timeConfirmed;

  return { monthKey: monthKeyFromDate(resolvedDate), isPendingTimeConfirmation };
};

export const resolveMilestoneMonth = (milestone, dynamicStart, dynamicEnd, lastActiveDate = null) =>
  getMilestoneStatus(milestone, dynamicStart, dynamicEnd, lastActiveDate).monthKey;

export const totalMilestonePercent = (milestones) =>
  (milestones || []).reduce((sum, m) => sum + (Number(m.percent) || 0), 0);

/**
 * Map<monthKey, amount> - real money tied to milestones, shown in the tooltip only (doesn't
 * drive circles). Milestones still pending time-confirmation are excluded entirely - they're
 * only "shown", not yet "in effect".
 */
export const calculateMilestoneAmounts = (milestones, totalValue, dynamicStart, dynamicEnd, lastActiveDate = null) => {
  const amounts = new Map();
  (milestones || []).forEach((m) => {
    const { monthKey, isPendingTimeConfirmation } = getMilestoneStatus(m, dynamicStart, dynamicEnd, lastActiveDate);
    if (!monthKey || isPendingTimeConfirmation) return;
    const amount = ((Number(m.percent) || 0) / 100) * totalValue;
    amounts.set(monthKey, (amounts.get(monthKey) || 0) + amount);
  });
  return amounts;
};

/** Task ids that count toward completion tracking: excludes tasks with no status, cancelled tasks, and monday's own "Milestone" marker rows (see MILESTONE_MARKER_STATUS). */
export const getRelevantTaskIds = (relatedActuals) =>
  (relatedActuals || [])
    .filter((a) => a.status && a.status !== CANCELLED_STATUS && a.status !== MILESTONE_MARKER_STATUS)
    .map((a) => String(a.id));

/**
 * Latest Date at which the project genuinely finished ALL its work - used to pull an
 * "end"-triggered milestone back from a stale dynamicEnd (see getMilestoneStatus), but ONLY when
 * there is truly nothing left to do.
 *
 * Status-based, not date-based (see the bug this replaced, 2026-07-12 fix - PLAN.md): a first
 * version keyed off whichever task had the latest date (logged hours or weeklyTimeline.to), but
 * a relevant task that's simply not yet been given a planned date in monday (weeklyTimeline.to
 * null, no hours logged yet - a completely normal state for a live project that hasn't
 * scheduled its tail end yet) would silently vanish from that calculation, making the function
 * think the project had less work left than it really does. Verified against 3 real projects
 * where this happened (`דיווח המשתמש 2026-07-12`).
 *
 * Correct rule: if ANY relevant task isn't done yet (not in COMPLETION_STATUSES) - there is
 * still real work, full stop, regardless of whether that task happens to have a date yet.
 * Returns null in that case, so getMilestoneStatus falls back to the raw dynamicEnd (no pull-back
 * at all). Only once EVERY relevant task is done does this return a real date - the latest
 * completion date among them (resolveCompletionDate, below - reused, not reimplemented).
 */
export const calculateLastActiveMonth = (relatedActuals, relevantTaskIds, taskDoneDates) => {
  const relevantSet = new Set(relevantTaskIds);
  const relevantTasks = (relatedActuals || []).filter((task) => relevantSet.has(String(task.id)));
  if (relevantTasks.length === 0) return null;

  const hasPendingWork = relevantTasks.some((task) => !COMPLETION_STATUSES.includes(task.status));
  if (hasPendingWork) return null;

  let latest = null;
  relevantTasks.forEach((task) => {
    const date = resolveCompletionDate(task, taskDoneDates);
    if (date && (!latest || date > latest)) latest = date;
  });
  return latest;
};

/**
 * Daily-pace completion target: distributes 100% of scope proportionally across working days
 * in the DYNAMIC (not baseline) timeline - same shape as calculateBaselinePlan, but expressed
 * as % of total scope instead of money, and following the live schedule so the target
 * re-tracks automatically if the deadline moves. totalPlannedHours only gates the empty case
 * (no hours estimated at all); the pace itself is purely calendar-proportional.
 */
export const calculateCompletionPaceTarget = (totalPlannedHours, dynamicStart, dynamicEnd) => {
  if (!totalPlannedHours) return new Map();
  return calculateBaselinePlan(100, dynamicStart, dynamicEnd);
};

export const FREELANCE_TASK_TYPE = 'פרילאנס';

/**
 * A completed task is attributed to the month real work actually happened in, NOT the month
 * someone happened to flip its status - the two can be far apart (e.g. hours logged in March,
 * but status only updated to "בוצע" in June because nobody remembered sooner). Uses the LATEST
 * logged-hours date on the task; if no hours were ever logged, falls back to the end of its own
 * weekly schedule (`weeklyTimeline.to`). If NEITHER is available - a task marked done with no
 * hours logged and no weekly schedule ever set - falls back to the real date it transitioned to a
 * completion status in monday, from `taskDoneDates` (see statusHistoryService.js/PLAN.md's
 * task-status-history round - these are genuinely "orphan" tasks that would otherwise silently
 * vanish from monthly target/debt tracking despite counting toward the overall completion badge).
 * Returns null only if none of the three sources have anything.
 *
 * Freelance tasks ("סוג משימה" = "פרילאנס") skip the hours-log check entirely and always use
 * their weekly schedule - freelancers' hours aren't tracked the same way internal staff's are,
 * so a logged-hours date on a freelance task isn't a reliable "when was this really done" signal.
 */
export const resolveCompletionDate = (task, taskDoneDates) => {
  if (task.taskType !== FREELANCE_TASK_TYPE) {
    const history = task.history || [];
    let latest = null;
    history.forEach((h) => {
      if (!h.startDate) return;
      const d = new Date(h.startDate);
      if (!latest || d > latest) latest = d;
    });
    if (latest) return latest;
  }
  if (task.weeklyTimeline?.to) return new Date(task.weeklyTimeline.to);
  const doneAt = taskDoneDates?.[String(task.id)];
  if (doneAt) return new Date(doneAt);
  return null;
};

/**
 * Map<monthKey, percent> - % of relevant tasks whose completion date (see
 * resolveCompletionDate) falls in that month specifically (monthly delta, not cumulative).
 * Feeds BOTH the circle engine's "actual" (as monthly deltas, exactly like calculateActuals
 * does for money) and the per-cell percentage badge (looked up directly per month).
 */
export const calculateMonthlyCompletionMap = (relatedActuals, relevantTaskIds, taskDoneDates) => {
  const map = new Map();
  const relevantSet = new Set(relevantTaskIds);
  if (relevantSet.size === 0) return map;

  (relatedActuals || [])
    .filter((task) => relevantSet.has(String(task.id)) && COMPLETION_STATUSES.includes(task.status))
    .forEach((task) => {
      const date = resolveCompletionDate(task, taskDoneDates);
      if (!date) return;
      const monthKey = monthKeyFromDate(date);
      map.set(monthKey, (map.get(monthKey) || 0) + 1);
    });

  map.forEach((count, key) => map.set(key, (count / relevantSet.size) * 100));
  return map;
};

/** Single-month lookup of the monthly (non-cumulative) task-completion flow rate, for the small percentage badge. */
export const calculateMonthlyTaskFlowPercent = (monthlyCompletionMap, monthKey) =>
  Math.round(monthlyCompletionMap.get(monthKey) || 0);

/** Cumulative completion % across the whole project's history - for the project-row badge. */
export const calculateOverallCompletion = (relatedActuals, relevantTaskIds) => {
  const relevantSet = new Set(relevantTaskIds);
  if (relevantSet.size === 0) return 0;
  const doneCount = (relatedActuals || []).filter(
    (task) => relevantSet.has(String(task.id)) && COMPLETION_STATUSES.includes(task.status)
  ).length;
  return Math.round((doneCount / relevantSet.size) * 100);
};

/**
 * Map<monthKey, cost> - real internal studio cost (hours logged × each task's own "עלות
 * סטודיו" rate), summed across EVERY task linked to the project - deliberately NOT filtered by
 * status. This is the SAME formula `calculateActuals` already applies per task for regular
 * money-tracked projects (confirmed with the user: that field is internal cost, not client
 * price) - just run here for milestone projects too, since their tasks don't otherwise pass
 * through `calculateActuals` at all (their circles are driven by completion % instead). Purely
 * additive/informational - does not feed the circles or any existing calculation.
 *
 * Verified against monday.com's own "רווח בפועל" formula column for a real project: summing
 * this function's output across every month landed EXACTLY on monday's own number, but only
 * when including status-less tasks too. Those tasks turned out to be real one-off costs
 * (e.g. external vendor fees) logged via the same hours mechanism without a task-workflow
 * status - not junk, despite an earlier (wrong) attempt to filter them out via
 * `getRelevantTaskIds`. Task-completion-% tracking (`calculateMonthlyCompletionMap`) is a
 * different concern and correctly keeps its own status filter - only money calculations here
 * must stay unfiltered to match monday's ground truth.
 */
export const calculateMonthlyCost = (relatedActuals) => {
  const cost = new Map();
  (relatedActuals || []).forEach((task) => {
    const itemCost = calculateActuals(task.history, task.hourlyRate || 0);
    itemCost.forEach((amount, monthKey) => {
      cost.set(monthKey, (cost.get(monthKey) || 0) + amount);
    });
  });
  return cost;
};

/**
 * Map<monthKey, revenue> - real (not smoothed) work-volume estimate: each task's own share of
 * totalValue (weighted by expectedHours × hourlyRate, same weighting as the money-vs-hours
 * split elsewhere) is distributed across whichever months hours were actually logged on it,
 * proportional to how much of ITS OWN budget was consumed that month - not tied to when (or
 * whether) the task got marked "done". A task budgeted 10h that gets 4h logged this month
 * contributes 40% of its own value to this month, regardless of status. Deliberately NOT
 * filtered by status, for the same reason as `calculateMonthlyCost` (matches monday's own
 * ground truth, which doesn't care about task-workflow status for money purposes).
 *
 * Freelance-type tasks (round 2026-07-16, see PLAN.md) are excluded entirely - both from the
 * weight pool AND from ever getting a revenue share of their own. Per the user's explicit
 * instruction: freelance work is money paid to an external supplier, not something the studio
 * can count as its own delivered value/profit - it should only ever show up as cost
 * (`calculateMonthlyCost`, unaffected by this exclusion), never as revenue.
 */
export const calculateMonthlyRevenueFromActualHours = (relatedActuals, totalValue) => {
  const revenue = new Map();
  if (!totalValue) return revenue;

  let totalWeight = 0;
  (relatedActuals || []).forEach((task) => {
    if (task.taskType === FREELANCE_TASK_TYPE) return;
    totalWeight += (task.expectedHours || 0) * (task.hourlyRate || 0);
  });
  if (totalWeight === 0) return revenue;

  (relatedActuals || []).forEach((task) => {
    if (task.taskType === FREELANCE_TASK_TYPE) return;
    if (!task.expectedHours) return;
    const taskWeight = task.expectedHours * (task.hourlyRate || 0);
    if (taskWeight === 0) return;
    const taskValue = (taskWeight / totalWeight) * totalValue;

    (task.history || []).forEach((h) => {
      if (!h.durationInSeconds || !h.startDate) return;
      const d = new Date(h.startDate);
      const monthKey = monthKeyFromDate(d);
      const hours = h.durationInSeconds / 3600;
      const contribution = taskValue * (hours / task.expectedHours);
      revenue.set(monthKey, (revenue.get(monthKey) || 0) + contribution);
    });
  });

  return revenue;
};

/**
 * Hours logged in `monthKey` ITSELF (not cumulative) vs. the REMAINING budget each individual
 * task had going into that month (its own expectedHours minus whatever was already logged on
 * it before this month) - not a project-wide average pace. A task budgeted 10h, with 5h logged
 * before this month and 8h logged this month, contributes 8 "logged" hours and its remaining
 * budget was only 5h, so it overran by 3h this month specifically. Tasks untouched this month
 * don't enter the calculation at all (matches `calculateMonthlyCompletionMap`'s own behavior -
 * a task not completed this month doesn't affect this month's %, either). Deliberately NOT
 * filtered by status, for the same reason as `calculateMonthlyCost`.
 */
export const calculateHoursOverrun = (relatedActuals, monthKey) => {
  const monthStart = new Date(`${monthKey}-01`);
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1); // exclusive upper bound

  let loggedHours = 0;
  let plannedHours = 0;
  let totalPlannedHours = 0;

  (relatedActuals || []).forEach((task) => {
    totalPlannedHours += task.expectedHours || 0;

    let loggedThisMonth = 0;
    let loggedBeforeThisMonth = 0;
    (task.history || []).forEach((h) => {
      if (!h.durationInSeconds || !h.startDate) return;
      const d = new Date(h.startDate);
      const hours = h.durationInSeconds / 3600;
      if (d >= monthStart && d < monthEnd) loggedThisMonth += hours;
      else if (d < monthStart) loggedBeforeThisMonth += hours;
    });

    if (loggedThisMonth === 0) return; // task untouched this month - excluded entirely

    loggedHours += loggedThisMonth;
    plannedHours += Math.max(0, (task.expectedHours || 0) - loggedBeforeThisMonth);
  });

  const overrunPercent = plannedHours > 0 ? Math.round(((loggedHours - plannedHours) / plannedHours) * 100) : 0;
  return { plannedHours, loggedHours, overrunPercent, totalPlannedHours };
};

// Identifies ad-hoc "hour bank" work within a milestone project's already-fixed price (e.g. a
// 140h allowance folded into one of the milestone amounts) - real, individually-estimated tasks
// created as needed, named starting with this prefix. Deliberately NOT a status/type marker like
// MILESTONE_MARKER_STATUS above - these ARE ordinary work and should count normally everywhere
// else (target/actual circles, נפח עבודה, cost, the end-milestone auto-shift) - see PLAN.md's
// 2026-07-12 hour-bank round for why an earlier draft that excluded them was wrong.
const HOUR_BANK_TASK_PREFIX = 'בנק שעות';

/**
 * { size, used, remaining } | null - a pure monitoring guardrail, parallel to (not a replacement
 * for) every other calculation in this file. `hourBankSize` is a contractual detail set once in
 * PaymentPolicyDialog.jsx (not derived from monday - a fake placeholder task holding the ceiling
 * would both pollute planning-cost math and clutter the real board). `used` sums real logged
 * hours across every task whose name starts with HOUR_BANK_TASK_PREFIX.
 */
export const calculateHourBankUsage = (relatedActuals, hourBankSize) => {
  if (!hourBankSize) return null;

  const bankTasks = (relatedActuals || []).filter((t) => t.name?.trim().startsWith(HOUR_BANK_TASK_PREFIX));
  let used = 0;
  bankTasks.forEach((task) => {
    (task.history || []).forEach((h) => {
      if (h.durationInSeconds) used += h.durationInSeconds / 3600;
    });
  });

  return { size: hourBankSize, used, remaining: hourBankSize - used };
};

/**
 * True once a milestone project's agreed, committed work is fully delivered and all that's left
 * is ad-hoc hour-bank usage - every relevant task EXCEPT hour-bank-prefixed ones is already
 * "בוצע". Hour-bank tasks themselves (done or not) never affect this check - deliberately, per
 * the user's own words (PLAN.md's 2026-07-16 round): "כל מי שיש לו משימות שנמצאות בבוצע ולא
 * מתחילות ב'בנק שעות' וכאלה שמוגדר להן בנק שעות בהגדרות בדאשבורד" - a project shouldn't bounce
 * back out of this state just because a brand-new ad-hoc hour-bank task hasn't been marked done
 * yet (that's the whole point of the state - ordinary milestone tracking is "closed", only the
 * hour-bank guardrail keeps mattering).
 */
export const isHourBankOnlyProject = (relatedActuals, relevantTaskIds, hourBankSize) => {
  if (!hourBankSize) return false;
  const relevantSet = new Set(relevantTaskIds);
  const nonBankRelevantTasks = (relatedActuals || []).filter(
    (task) => relevantSet.has(String(task.id)) && !task.name?.trim().startsWith(HOUR_BANK_TASK_PREFIX)
  );
  // No real committed work at all (e.g. a brand-new project) is a different situation, not "done".
  if (nonBankRelevantTasks.length === 0) return false;
  return nonBankRelevantTasks.every((task) => COMPLETION_STATUSES.includes(task.status));
};

/**
 * Set<monthKey> - which of the given OPEN months have no real hour-bank activity at all (no
 * logged hours on any hour-bank-prefixed task that month) - used only once a project is already
 * confirmed isHourBankOnlyProject, to skip rendering an endless run of trivially-empty "0%,
 * fully credited" months once the agreed work is done. A month regains its circle automatically
 * the moment real hours land on a bank task within it (see PLAN.md: "עוד 3 שבועות פתאום 30 שעות"
 * scenario) - this is recomputed fresh from live data every render, nothing is cached/frozen.
 */
export const calculateEmptyHourBankMonths = (relatedActuals, openMonthKeys) => {
  const bankTasks = (relatedActuals || []).filter((t) => t.name?.trim().startsWith(HOUR_BANK_TASK_PREFIX));
  const monthsWithActivity = new Set();
  bankTasks.forEach((task) => {
    (task.history || []).forEach((h) => {
      if (!h.durationInSeconds || !h.startDate) return;
      monthsWithActivity.add(monthKeyFromDate(new Date(h.startDate)));
    });
  });
  return new Set((openMonthKeys || []).filter((monthKey) => !monthsWithActivity.has(monthKey)));
};
