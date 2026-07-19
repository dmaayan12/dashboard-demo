/**
 * Financial calculation logic for baseline planning, actuals, reverse credit, and proportional debt
 */
import { getWorkingDaysInMonth, getWorkingDaysBetween, getMonthsBetween, getWorkingDaysInRange } from './dateUtils';

/**
 * Calculate baseline monthly plan from total value and baseline timeline
 */
export const calculateBaselinePlan = (totalValue, baselineStart, baselineEnd) => {
  const basePlan = new Map();

  if (!totalValue || !baselineStart || !baselineEnd) return basePlan;

  const totalWorkingDays = getWorkingDaysBetween(new Date(baselineStart), new Date(baselineEnd));
  if (totalWorkingDays === 0) return basePlan;

  const dailyRate = totalValue / totalWorkingDays;
  const months = getMonthsBetween(new Date(baselineStart), new Date(baselineEnd));

  months.forEach(({ year, month, key }) => {
    const workingDays = getWorkingDaysInRange(
      year,
      month,
      new Date(baselineStart),
      new Date(baselineEnd)
    );
    basePlan.set(key, dailyRate * workingDays);
  });

  return basePlan;
};

/**
 * Estimate a month's potential value using the project's own baseline rate,
 * for months that fall outside the baseline (e.g. schedule extensions) and
 * therefore have no officially planned or debt-assigned target yet.
 */
export const calculateMonthlyPotential = (totalValue, baselineStart, baselineEnd, workingDaysInMonth) => {
  if (!totalValue || !baselineStart || !baselineEnd || !workingDaysInMonth) return 0;

  const totalWorkingDays = getWorkingDaysBetween(new Date(baselineStart), new Date(baselineEnd));
  if (totalWorkingDays === 0) return 0;

  return (totalValue / totalWorkingDays) * workingDaysInMonth;
};

/**
 * Calculate actual costs from time tracking history
 */
export const calculateActuals = (timeTrackingHistory, hourlyRate) => {
  const actuals = new Map();
  if (!timeTrackingHistory || !hourlyRate) return actuals;

  timeTrackingHistory.forEach(log => {
    // Handling various Monday.com history formats (started_at, startDate, etc.)
    const rawDate = log.started_at || log.startDate || log.startedAt;
    if (!rawDate || !log.durationInSeconds) return;

    const logDate = new Date(rawDate);
    if (isNaN(logDate.getTime())) return; // Skip invalid dates

    // Ensure Key format is ALWAYS YYYY-MM with leading zero
    const monthKey = `${logDate.getFullYear()}-${String(logDate.getMonth() + 1).padStart(2, '0')}`;
    const hours = parseFloat(log.durationInSeconds) / 3600;
    const cost = hours * parseFloat(hourlyRate);

    actuals.set(monthKey, (actuals.get(monthKey) || 0) + cost);
  });
  return actuals;
};

/**
 * Unified Financial Engine: "Net Gap Calculation"
 * Prevents double-counting by calculating a single net balance for the remainder of the project.
 */
export const calculateNetFinancials = (basePlan, actuals, totalValue, dynamicStart, dynamicEnd, currentDate = new Date()) => {
  const credits = new Map();
  const debts = new Map();

  const dStart = new Date(dynamicStart);
  const dEnd = new Date(dynamicEnd);
  const currentMonthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

  // 1. Get Dynamic Schedule Months
  const dynamicMonths = getMonthsBetween(dStart, dEnd).map(m => ({
    ...m,
    workingDays: getWorkingDaysInRange(m.year, m.month, dStart, dEnd),
    isExtension: (basePlan.get(m.key) || 0) === 0
  }));

  if (dynamicMonths.length === 0) return { credits, debts };

  // 2. Determine the Pivot Month (Target months start here)
  let targetMonths = dynamicMonths.filter(m => m.key > currentMonthKey);

  // LAST STAND FALLBACK: If no future months exist, force targets to the final month
  if (targetMonths.length === 0) {
    targetMonths = [dynamicMonths[dynamicMonths.length - 1]];
  }

  const pivotMonthKey = targetMonths[0].key;

  // 3. Calculate "Performed to Date" (Strictly BEFORE pivot)
  let performedToDate = 0;
  actuals.forEach((amount, monthKey) => {
    if (monthKey < pivotMonthKey) {
      performedToDate += amount;
    }
  });

  // 4. Calculate "Planned in Targets"
  let plannedInTargets = 0;
  targetMonths.forEach(m => {
    plannedInTargets += (basePlan.get(m.key) || 0);
  });

  // 5. Calculate the NET GAP
  // Formula: Remaining money needed vs. What is originally planned in the remaining timeline
  const remainingValue = Math.max(0, totalValue - performedToDate);
  const netGap = remainingValue - plannedInTargets;

  // 6. Distribute as EITHER Debt OR Credit (Mutually Exclusive)
  if (netGap > 0) {
    // --- PURE DEBT ---
    const extensionMonths = targetMonths.filter(m => m.isExtension && m.workingDays > 0);
    const finalTargets = extensionMonths.length > 0 ? extensionMonths : targetMonths;
    const totalTargetDays = finalTargets.reduce((sum, m) => sum + m.workingDays, 0);

    if (totalTargetDays > 0) {
      const debtPerDay = netGap / totalTargetDays;
      finalTargets.forEach(({ key, workingDays }) => {
        debts.set(key, debtPerDay * workingDays);
      });
    }
  } else if (netGap < 0) {
    // --- PURE CREDIT ---
    let remainingCredit = Math.abs(netGap);
    // Apply backwards from the last target month
    const reversedTargets = [...targetMonths].reverse();

    reversedTargets.forEach(({ key }) => {
      if (remainingCredit <= 0) return;
      const planned = basePlan.get(key) || 0;
      const creditToApply = Math.min(remainingCredit, planned);
      credits.set(key, creditToApply);
      remainingCredit -= creditToApply;
    });
  }

  return { credits, debts };
};

/**
 * Calculate effective target after applying credits and debts, natively supporting timeline extensions
 */
export const calculateEffectiveTarget = (basePlan, credits, debts, dynamicStart, dynamicEnd) => {
  const effective = new Map();

  // 1. Create string-based boundaries (YYYY-MM)
  const dStart = new Date(dynamicStart);
  const dEnd = new Date(dynamicEnd);
  const startKey = `${dStart.getFullYear()}-${String(dStart.getMonth() + 1).padStart(2, '0')}`;
  const endKey = `${dEnd.getFullYear()}-${String(dEnd.getMonth() + 1).padStart(2, '0')}`;

  // 2. Generate the EXACT list of months in the Dynamic Schedule
  const dynamicMonths = getMonthsBetween(dStart, dEnd).map(m => m.key);

  // 3. The SCOPE is ONLY current Baseline keys + current Dynamic keys
  // This prevents "ghost" months from showing up
  const currentScope = new Set([...basePlan.keys(), ...dynamicMonths]);

  currentScope.forEach(monthKey => {
    // String comparison for "inSchedule" - prevents timezone/date mismatches
    const inSchedule = monthKey >= startKey && monthKey <= endKey;

    const planned = basePlan.get(monthKey) || 0;
    const credit = credits.get(monthKey) || 0;
    const debt = debts.get(monthKey) || 0;
    const value = planned - credit + debt;

    // Only add to map if it's in the current schedule OR has a baseline plan
    // This cleans up any "ghost" debts from previous calculations
    effective.set(monthKey, { value, inSchedule });
  });

  return effective;
};

/**
 * Sequential, month-by-month debt/credit engine (see PLAN.md, 2026-07-19 round) - replaces
 * calculateNetFinancials's "always recompute from today's live cumulative position" model for
 * closed months and the current month.
 *
 * TWO INDEPENDENT, NON-NETTING pools (this is the key correction after an earlier single-signed-
 * balance version was rejected - see PLAN.md for the full back-and-forth): a `debtPool` and a
 * `creditPool`, tracked separately, that do NOT automatically cancel each other out:
 *   - A month that underperforms its OWN locked target always ADDS to `debtPool` - regardless of
 *     whether `creditPool` already has a balance sitting in it. An earlier version let a later
 *     deficit silently "eat into" an already-banked EARLIER surplus - the user explicitly rejected
 *     this ("העודף של מרץ לא צריך להתבטא באפריל... הוא צריך להתבטא בחודש האחרון"): a surplus
 *     banked from an earlier month must stay reserved for the LAST month untouched, not get
 *     quietly consumed by an unrelated later shortfall.
 *   - A month that OVERperforms its own locked target first pays down any OUTSTANDING `debtPool`
 *     (up to full equality - "המקסימום שאפשר להגיע אליו זה שוויון בין שורת הקיזוז לשורת החוב").
 *     Only the LEFTOVER surplus beyond that adds to `creditPool`.
 *   - `debtPool` always spreads across ALL remaining open months (proportional to working days,
 *     preferring schedule-extension months if any exist - same rule as the original
 *     calculateNetFinancials debt branch). `creditPool` always lands on the LAST month of the
 *     schedule only (with the existing backward-fill-from-last logic as an overflow safety net if
 *     it's larger than the last month's own calendar share).
 *
 * Each month's locked target = basePlan(month) + its share of debtPool - its share of creditPool
 * (only nonzero for the last month) - computed ONCE, the moment that month is first observed as
 * started (current) or closed, and NEVER recalculated again once frozen. The pools themselves are
 * never separately persisted - they're always fully reconstructed by replaying every ALREADY-
 * FROZEN month's own (frozenEffectiveTarget, frozenActualValue) pair in chronological order,
 * applying the same two rules above - so no new schema is needed beyond what's already frozen.
 *
 * @param basePlan Map<monthKey, value> - calendar-only target (already frozen for closed months
 *   elsewhere, same as before this change)
 * @param liveActuals Map<monthKey, value> - CURRENT/live real performance (used for the
 *   in-progress current month's display, and as the source for a closed month's actual the FIRST
 *   time that month gets locked - permanent from that point on)
 * @param frozenHistory { [monthKey]: { frozenEffectiveTarget?, frozenActualValue?,
 *   frozenEffectiveTargetHours? } } - whatever's already been locked in a prior pass
 *   (project_month_history)
 * @param circleTotal, dynamicStart, dynamicEnd - same meaning as calculateNetFinancials
 * @param todayMonthKey - "YYYY-MM" of the real current month
 * @param totalPlannedHoursNow - the project's CURRENT total estimated hours across all tasks,
 *   used ONLY to convert a month's locked percent into an hours-equivalent AT THE MOMENT IT'S
 *   LOCKED (2026-07-19 follow-up fix - see PLAN.md's "(Xh) fix" note for why this must be frozen
 *   alongside the percent rather than converted later with a live ratio).
 * @returns {
 *   effectiveTargets: Map<monthKey, {value, inSchedule}> - same shape as calculateEffectiveTarget
 *   effectiveTargetHours: Map<monthKey, hours> - locked hours-equivalent for closed+current
 *     months only (future months are left for the caller to fill in with the existing live
 *     hoursPerPercentPoint conversion, unchanged)
 *   credits: Map<monthKey, value>, debts: Map<monthKey, value> - the RAW debtShare/creditShare
 *     baked into each month (NOT mutually exclusive - see 2026-07-19 second follow-up above: a
 *     month can carry both at once, e.g. a large credit that more than offsets a smaller debt -
 *     both get listed so the debt line stays visible even when it's fully covered)
 *   toFreeze: [{ monthKey, frozenEffectiveTarget?, frozenEffectiveTargetHours?, frozenActualValue?,
 *     frozenDebtShare?, frozenCreditShare? }] - entries locked for the FIRST time this pass, to be
 *     persisted (frozenActualValue omitted for the current month, since its real performance
 *     isn't final yet)
 * }
 */
export const calculateSequentialEffectiveTargets = (
  basePlan, liveActuals, frozenHistory, circleTotal, dynamicStart, dynamicEnd, todayMonthKey, totalPlannedHoursNow
) => {
  const dStart = new Date(dynamicStart);
  const dEnd = new Date(dynamicEnd);
  const startKey = `${dStart.getFullYear()}-${String(dStart.getMonth() + 1).padStart(2, '0')}`;
  const endKey = `${dEnd.getFullYear()}-${String(dEnd.getMonth() + 1).padStart(2, '0')}`;
  const dynamicMonths = getMonthsBetween(dStart, dEnd).map((m) => ({
    ...m,
    workingDays: getWorkingDaysInRange(m.year, m.month, dStart, dEnd),
    isExtension: (basePlan.get(m.key) || 0) === 0,
  }));
  const dynamicMonthKeys = dynamicMonths.map((m) => m.key);
  const currentScope = [...new Set([...basePlan.keys(), ...dynamicMonthKeys])].sort();

  const effectiveTargets = new Map();
  const effectiveTargetHours = new Map();
  const credits = new Map();
  const debts = new Map();
  const toFreeze = [];

  // Spreads `amount` across `months` proportional to working days, preferring schedule-extension
  // months if any exist - identical rule to calculateNetFinancials's original PURE DEBT branch.
  const spreadProportionally = (amount, months) => {
    const result = new Map();
    if (amount <= 0) return result;
    const extensionMonths = months.filter((m) => m.isExtension && m.workingDays > 0);
    const finalTargets = extensionMonths.length > 0 ? extensionMonths : months;
    const totalDays = finalTargets.reduce((sum, m) => sum + m.workingDays, 0);
    if (totalDays <= 0) return result;
    const perDay = amount / totalDays;
    finalTargets.forEach(({ key, workingDays }) => result.set(key, perDay * workingDays));
    return result;
  };

  // Fills `amount` backward starting from the LAST month in `months`, capped at each month's own
  // basePlan share - identical rule to calculateNetFinancials's original PURE CREDIT branch. This
  // is credit's ONLY distribution rule (never proportional-across-all-months like debt) - the
  // backward-spill is purely an overflow safety net for when the pool is bigger than the last
  // month alone can hold, not a general spreading mechanism.
  const fillBackwardFromLast = (amount, months) => {
    const result = new Map();
    if (amount <= 0) return result;
    let remaining = amount;
    [...months].reverse().forEach(({ key }) => {
      if (remaining <= 0) return;
      const capacity = basePlan.get(key) || 0;
      const applied = Math.min(remaining, capacity);
      if (applied > 0) result.set(key, applied);
      remaining -= applied;
    });
    return result;
  };

  const pastAndPresentKeys = currentScope.filter((k) => k <= todayMonthKey);
  let debtPool = 0;
  let creditPool = 0;
  const EPSILON = 1e-9;

  pastAndPresentKeys.forEach((monthKey) => {
    const isClosed = monthKey < todayMonthKey;
    const planned = basePlan.get(monthKey) || 0;
    const frozen = frozenHistory[monthKey];
    let lockedValue, debtShare, creditShare;

    if (frozen?.frozenEffectiveTarget != null) {
      // Already locked in a prior pass - permanent, never recomputed regardless of what's
      // happened in any month since.
      lockedValue = frozen.frozenEffectiveTarget;
      if (frozen.frozenDebtShare != null || frozen.frozenCreditShare != null) {
        // Real, separately-frozen components (2026-07-19 second follow-up) - needed because a
        // month can carry BOTH a real debt share AND a real credit share at once (e.g. a large
        // early-project surplus reserved for the last month can be bigger than that month's own
        // accumulated debt, netting to a small locked value that would otherwise hide the fact
        // that a real debt was also being paid down there) - the NET value alone can't tell them
        // apart from a plain small credit with no debt underneath it at all.
        debtShare = frozen.frozenDebtShare || 0;
        creditShare = frozen.frozenCreditShare || 0;
      } else {
        // One-time backfill for rows frozen before this distinction existed - best-effort
        // reconstruction from the net value alone (can't recover a simultaneous debt+credit that
        // was never separately recorded, but every row from this point forward will have both).
        debtShare = lockedValue > planned ? lockedValue - planned : 0;
        creditShare = lockedValue < planned ? planned - lockedValue : 0;
        toFreeze.push({ monthKey, frozenDebtShare: debtShare, frozenCreditShare: creditShare });
      }
      if (frozen.frozenEffectiveTargetHours != null) {
        effectiveTargetHours.set(monthKey, frozen.frozenEffectiveTargetHours);
      } else {
        // One-time backfill (2026-07-19 follow-up fix): this month's PERCENT was already locked
        // before the hours-freeze existed - compute the hours-equivalent now, from the percent
        // that's ALREADY permanent (never touching it), and freeze just this missing piece.
        const backfillHours = circleTotal > 0 ? (lockedValue / circleTotal) * (totalPlannedHoursNow || 0) : 0;
        effectiveTargetHours.set(monthKey, backfillHours);
        toFreeze.push({ monthKey, frozenEffectiveTargetHours: backfillHours });
      }
    } else {
      // First time locking this month - use whichever pools stand right now, already updated by
      // replaying every earlier month's own real gap (below).
      const remainingMonths = dynamicMonths.filter((m) => m.key >= monthKey);
      debtShare = spreadProportionally(debtPool, remainingMonths).get(monthKey) || 0;
      creditShare = fillBackwardFromLast(creditPool, remainingMonths).get(monthKey) || 0;
      lockedValue = planned + debtShare - creditShare;

      const lockedHours = circleTotal > 0 ? (lockedValue / circleTotal) * (totalPlannedHoursNow || 0) : 0;
      effectiveTargetHours.set(monthKey, lockedHours);

      const freezeEntry = {
        monthKey, frozenEffectiveTarget: lockedValue, frozenEffectiveTargetHours: lockedHours,
        frozenDebtShare: debtShare, frozenCreditShare: creditShare,
      };
      if (isClosed) freezeEntry.frozenActualValue = liveActuals.get(monthKey) || 0;
      toFreeze.push(freezeEntry);
    }

    effectiveTargets.set(monthKey, { value: lockedValue, inSchedule: monthKey >= startKey && monthKey <= endKey });
    // Both can be set SIMULTANEOUSLY (not mutually exclusive like a plain net-value comparison
    // would give) - see the frozen-branch comment above for why that distinction matters.
    if (debtShare > 0) debts.set(monthKey, debtShare);
    if (creditShare > 0) credits.set(monthKey, creditShare);

    // The moment a month's share of either pool gets LOCKED into its target (whether just now or
    // in an earlier pass), that share is "spent" - it's this specific month's responsibility from
    // here on, not still-floating-and-unassigned pool value. Removing the REAL shares (not just
    // the net difference) is what prevents the replay step below from re-counting the SAME value
    // twice: once when it was assigned here, and again via the full actual-vs-lockedValue gap if
    // this month then also falls short (caught in testing, 2026-07-19: without this, a month that
    // inherited a debt-share and THEN also missed its own pace independently produced a debt
    // figure inflated by the already-counted share).
    debtPool = Math.max(0, debtPool - debtShare);
    creditPool = Math.max(0, creditPool - creditShare);

    // Replay this month's real gap (once it's closed) to update the two pools for whatever comes
    // next - a deficit ALWAYS adds to debtPool (never reduces creditPool); a surplus ALWAYS pays
    // down debtPool first, and only the leftover becomes new creditPool. Runs regardless of
    // whether this month was JUST locked this pass or was already frozen from before, so the
    // pools stay correctly reconstructed purely from permanent historical facts.
    if (isClosed) {
      const actualValue = frozen?.frozenActualValue != null ? frozen.frozenActualValue : (liveActuals.get(monthKey) || 0);
      const gap = actualValue - lockedValue;
      if (gap < -EPSILON) {
        debtPool += -gap;
      } else if (gap > EPSILON) {
        const payoff = Math.min(gap, debtPool);
        debtPool -= payoff;
        creditPool += (gap - payoff);
      }
    }
  });

  // Future months (not started yet) - live, forward-looking best-estimate, exactly like the old
  // behavior (can't lock what hasn't begun yet). Plain one-shot calculateNetFinancials/
  // calculateEffectiveTarget, anchored to the real current moment.
  const futureCalc = calculateNetFinancials(basePlan, liveActuals, circleTotal, dynamicStart, dynamicEnd, new Date());
  const futureEffective = calculateEffectiveTarget(basePlan, futureCalc.credits, futureCalc.debts, dynamicStart, dynamicEnd);
  currentScope.forEach((monthKey) => {
    if (monthKey <= todayMonthKey) return;
    effectiveTargets.set(monthKey, futureEffective.get(monthKey) || { value: basePlan.get(monthKey) || 0, inSchedule: false });
    const c = futureCalc.credits.get(monthKey) || 0;
    const d = futureCalc.debts.get(monthKey) || 0;
    if (c > 0) credits.set(monthKey, c);
    if (d > 0) debts.set(monthKey, d);
  });

  return { effectiveTargets, effectiveTargetHours, credits, debts, toFreeze };
};

/**
 * Format currency for display (120000 → "120.0K", 11500 → "11.5K")
 */
export const formatCurrency = (value) => {
  if (!value || value === 0) return '0';
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return Math.round(value).toString();
};

/**
 * Format currency with symbol for tooltips (1500 → "1,500 ₪")
 */
export const formatCurrencyDetailed = (value) => {
  if (!value || value === 0) return '0 ₪';
  return `${Math.round(value).toLocaleString('en-US')} ₪`;
};
