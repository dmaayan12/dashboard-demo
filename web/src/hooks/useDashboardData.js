import { useState, useEffect, useMemo } from 'react';
import { apiFetch, safeErrorMessage } from '../lib/api';
import { getMonthsBetween } from '../utils/dateUtils';
import {
  calculateBaselinePlan,
  calculateActuals,
  calculateSequentialEffectiveTargets
} from '../utils/financialCalculations';
import {
  calculateMilestoneAmounts,
  getRelevantTaskIds,
  calculateCompletionPaceTarget,
  calculateMonthlyCompletionMap,
  calculateOverallCompletion,
  calculateMonthlyCost,
  calculateMonthlyRevenueFromActualHours,
  calculateLastActiveMonth,
  calculateHourBankUsage,
  getMilestoneStatus,
  isHourBankOnlyProject,
  calculateEmptyHourBankMonths,
} from '../utils/paymentPolicyCalculations';

async function fetchDashboardData() {
  const res = await apiFetch('/api/dashboard-data');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `טעינת נתוני לוח הבקרה נכשלה (${res.status})`);
  }
  return res.json(); // { planningItems, actualsItems }
}

// policies: { [projectId]: { reviewed, milestones } } from usePaymentPolicies - passed in so
// projects with a milestone-based payment policy get recalculated whenever it changes,
// without needing to refetch monday.com data.
// history/recordHistory: from useProjectMonthHistory (Round 6, Part B - see PLAN.md) - frozen
// "יעד חודשי" values for closed months of hasMilestones projects, keyed by project+month.
// lastScheduleChanges: from useProjectScheduleHistory (Round 6, Part C) - { projectId: ISO date
// of the most recent real schedule change }, attached onto each project as-is (the "which months
// are open" filtering happens in MonthCell.jsx, right next to where it renders the note).
// taskDoneDates: from useTaskStatusHistory (see PLAN.md's task-status-history round) - { taskId:
// ISO date last transitioned to a completion status }, the third-tier fallback resolveCompletionDate
// uses for tasks with no logged hours and no weeklyTimeline.to.
// upstreamInputsLoading: true while ANY of policies/history/lastScheduleChanges/taskDoneDates'
// OWN async fetches are still in flight (see PLAN.md, 2026-07-19 sequential-debt round) - gates
// the freeze-write effect below. Without this, the very FIRST render(s) of this hook - before
// `policies` has actually loaded - see an EMPTY policies object, so `hasMilestones` computes as
// false for every project, routes it through the wrong (regular-financial) branch, and can
// PERMANENTLY freeze a garbage value the instant it round-trips (freezing is write-once by
// design - a later, correct render's write is then silently discarded by the server's own
// COALESCE-keep-existing logic). Caught live: a fresh reset of the sequential-debt fields
// immediately re-locked back to a stale/wrong number on the very next load, the same class of
// race already fixed once before in useExpectedVolumeData.js via loadIdRef - this is the
// equivalent fix for this hook's freeze-write side effect specifically.
export const useDashboardData = (policies = {}, history = {}, recordHistory, lastScheduleChanges = {}, taskDoneDates = {}, upstreamInputsLoading = false) => {
  const [rawData, setRawData] = useState(null); // { planningItems, actualsItems } | null
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      setRawData(null); // Zero-memory sync: clear previous state
      setLoading(true);
      setError(null);
      setRawData(await fetchDashboardData());
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
      setError(safeErrorMessage(err, 'טעינת נתוני לוח הבקרה נכשלה'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const { projects, monthColumns, totals, pendingFreezeWrites } = useMemo(() => {
    if (!rawData) return { projects: [], monthColumns: [], totals: new Map(), pendingFreezeWrites: [] };

    const { planningItems: allPlanningItems, actualsItems: allActualsItems } = rawData;

    // Real calendar "today" - NOT tied to any project's own schedule - used to decide which
    // months are closed (frozen forever) vs still open (always live) for Part B/C below.
    const todayDate = new Date();
    const todayMonthKey = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}`;
    const startOfMonthISO = (monthKey) => `${monthKey}-01`;

    // Collected during the project map below, dispatched via a useEffect after render (a
    // useMemo body should stay side-effect-free) - one entry per project that has newly-closed
    // months needing their frozen value written for the first time.
    const freezeWritesAccumulator = [];

    // Process projects
    const processedProjects = allPlanningItems
      .filter(p => p.dynamicTimeline?.from && p.baselineTimeline?.from && p.totalValue)
      .map(project => {
        const dynamicTimeline = project.dynamicTimeline;
        const baselineTimeline = project.baselineTimeline;
        const totalValue = project.totalValue;

        // Get related actuals - robust ID comparison
        const relatedActuals = allActualsItems.filter(actual => {
          const linkedIds = (actual.linkedItems || []).map(link => String(link.id));
          return linkedIds.includes(String(project.id));
        });

        // Profitability badge (Backlog) - per the user's explicit formula: project value minus
        // the real internal cost actually incurred (hours logged × cost-per-hour, summed across
        // every task linked to this project), as a percentage of the project value. monday's own
        // "עלות בפועל" column can't be read through the API (it's a formula column - confirmed
        // live, always comes back empty) so this replicates it directly from the same raw
        // ingredients (`history`/`hourlyRate`) calculateActuals already uses elsewhere
        // (calculateMonthlyCost) for the exact same "hours × rate" cost concept.
        let totalActualCostIncurred = 0;
        relatedActuals.forEach((task) => {
          calculateActuals(task.history, task.hourlyRate || 0).forEach((cost) => { totalActualCostIncurred += cost; });
        });
        const profitabilityPercent = totalValue > 0
          ? ((totalValue - totalActualCostIncurred) / totalValue) * 100
          : null;

        const policy = policies[project.id];
        const hasMilestones = policy?.milestones?.length > 0;
        // Pure monitoring guardrail, parallel to every other calculation here - "בנק שעות"-named
        // tasks are ordinary work and already count normally everywhere else (see
        // calculateHourBankUsage's own comment for why an earlier draft excluding them was wrong).
        const hourBankUsage = calculateHourBankUsage(relatedActuals, policy?.hourBankSize);

        // Real hourly rate for this project: cost divided by all planned hours across its tasks
        let totalPlannedHours = 0;
        relatedActuals.forEach(actual => { totalPlannedHours += actual.expectedHours || 0; });
        const effectiveHourlyRate = totalPlannedHours > 0 ? totalValue / totalPlannedHours : null;

        let basePlan;
        let aggregatedActuals;
        let circleTotal; // the "100%" ceiling fed into calculateNetFinancials/calculateEffectiveTarget
        let overallCompletion = null;
        let milestoneAmounts = new Map();
        let monthlyCost; // ₪, real internal studio cost - parallel/additive, doesn't feed the circles
        let monthlyRevenue; // ₪, work-volume smoothed across the schedule - parallel/additive, doesn't feed the circles
        let monthlyRevenueActual; // ₪, work-volume from REAL hours logged this month (milestone projects only)
        // Map<monthKey, hours> - this SPECIFIC month's own hours-equivalent of its target % (not
        // a shared whole-project denominator - see the "(Xh) fix" note below). Closed months:
        // frozen directly, in hours, the moment they first close. Open months: a live share of
        // "what's actually left" (milestone projects only).
        let monthTargetHoursByMonth;
        let hoursPerPercentPoint = 0; // rate used to convert effectiveTarget (with debt/credit) to hours for OPEN months only

        // Computed for EVERY project regardless of hasMilestones (not just inside the branch
        // below, where it used to live) - Part C (see PLAN.md) needs it as a gate for whether the
        // project has "really started" yet, independent of payment policy type: a task with a
        // real status (not null/not "בוטל") means someone has actually worked on it.
        const relevantTaskIds = getRelevantTaskIds(relatedActuals);
        // Same reasoning - computed for every project so an "end"-triggered milestone can pull
        // itself back from a stale dynamicEnd regardless of payment-policy type (see
        // calculateLastActiveMonth/getMilestoneStatus for the full rationale).
        const lastActiveDate = calculateLastActiveMonth(relatedActuals, relevantTaskIds, taskDoneDates);
        // Round 2026-07-16: agreed work fully delivered, only ad-hoc hour-bank usage remains -
        // moves the project into its own Backlog section (see PLAN.md). Only meaningful for
        // milestone projects with a bank configured; `false` otherwise.
        const isHourBankOnlyState = isHourBankOnlyProject(relatedActuals, relevantTaskIds, policy?.hourBankSize);
        let emptyHourBankMonths = new Set();

        if (hasMilestones) {
          // Milestones no longer drive the circles (money doesn't move between milestones,
          // so it can't answer "are we on pace"). Instead ALL months track cumulative
          // task-completion percentage; milestone amounts become tooltip-only info.
          circleTotal = 100;
          overallCompletion = calculateOverallCompletion(relatedActuals, relevantTaskIds);
          milestoneAmounts = calculateMilestoneAmounts(
            policy.milestones,
            totalValue,
            dynamicTimeline.from,
            dynamicTimeline.to,
            lastActiveDate
          );

          // Cost - real internal studio cost, unaffected by any of the freezing below (it's
          // already a permanent record of hours actually logged - see calculateMonthlyCost's
          // own comment on why it's deliberately not filtered by task status).
          monthlyCost = calculateMonthlyCost(relatedActuals);
          // Real ₪ actually delivered this month, from real hours logged against each task's own
          // budget - a permanent historical fact, same idea as monthlyCost, never touched below.
          monthlyRevenueActual = calculateMonthlyRevenueFromActualHours(relatedActuals, totalValue);

          // --- Round 6, Part B: freeze "יעד חודשי" for closed months (see PLAN.md) ---
          // Live, full-range calendar-pace % - used only as the fallback value for a closed
          // month that's never been frozen before (the first time it's ever observed as closed,
          // this IS what gets frozen going forward).
          const liveFullRangePercent = calculateCompletionPaceTarget(totalPlannedHours, dynamicTimeline.from, dynamicTimeline.to);
          const projectHistory = history[project.id] || {};

          basePlan = new Map();
          monthTargetHoursByMonth = new Map();
          const toFreeze = [];
          let closedPercentSum = 0;
          let closedHoursSum = 0;
          let closedRevenueActualSum = 0;
          const openMonthKeys = [];

          liveFullRangePercent.forEach((livePercent, monthKey) => {
            if (monthKey < todayMonthKey) {
              // Closed - already frozen, or freezing for the first time right now.
              //
              // "(Xh)" FIX (see PLAN.md): this now freezes the month's OWN computed hours-
              // equivalent directly (percent-at-freeze-time × totalPlannedHours-at-freeze-time,
              // computed ONCE), not the whole-project totalPlannedHours as a shared denominator
              // like before. The old approach re-multiplied a live, drifting "whole project
              // total" against each month's percent at render time - so the "(Xh)" shown next to
              // a CLOSED month could still silently change if the project's live total estimated
              // hours changed later (new tasks added, estimates revised) - freezing the raw
              // ingredient wasn't enough, only freezing the actual OUTCOME is.
              const existingFrozenPercent = projectHistory[monthKey]?.frozenTargetPercent;
              const existingFrozenHours = projectHistory[monthKey]?.frozenTotalPlannedHours;
              const frozenPercent = existingFrozenPercent != null ? existingFrozenPercent : livePercent;
              const frozenHours = existingFrozenHours != null ? existingFrozenHours : (livePercent / 100) * totalPlannedHours;
              if (existingFrozenPercent == null || existingFrozenHours == null) {
                toFreeze.push({ monthKey, frozenTargetPercent: livePercent, frozenTotalPlannedHours: (livePercent / 100) * totalPlannedHours });
              }
              basePlan.set(monthKey, frozenPercent);
              monthTargetHoursByMonth.set(monthKey, frozenHours);
              closedPercentSum += frozenPercent;
              closedHoursSum += frozenHours;
              closedRevenueActualSum += monthlyRevenueActual.get(monthKey) || 0;
            } else {
              openMonthKeys.push(monthKey);
            }
          });

          if (toFreeze.length > 0) {
            freezeWritesAccumulator.push({ projectId: project.id, entries: toFreeze });
          }

          // Open months (current + future) - NOT a fresh "100% over the whole range" recompute
          // (that would double-count what's already locked into the closed months and no longer
          // sum to the real total - see PLAN.md's worked example). Instead, spread only what's
          // LEFT (100% minus what's already frozen) over the open date range.
          if (openMonthKeys.length > 0) {
            const remainingPercent = 100 - closedPercentSum;
            const openPercentMap = calculateBaselinePlan(remainingPercent, startOfMonthISO(todayMonthKey), dynamicTimeline.to);
            openMonthKeys.forEach((monthKey) => basePlan.set(monthKey, openPercentMap.get(monthKey) || 0));

            // Same "(Xh)" fix, hours side: what's LEFT in real hours (live current total minus
            // what's already locked into closed months), spread the same way as the percent
            // above - a genuinely separate pool, not `remainingPercent × totalPlannedHours`
            // (which would just reintroduce the old drifting-denominator bug).
            const remainingHours = Math.max(0, totalPlannedHours - closedHoursSum);
            const openHoursMap = calculateBaselinePlan(remainingHours, startOfMonthISO(todayMonthKey), dynamicTimeline.to);
            openMonthKeys.forEach((monthKey) => monthTargetHoursByMonth.set(monthKey, openHoursMap.get(monthKey) || 0));
            // "Hours per percentage point" for open months - the rate used to convert
            // effectiveTarget (basePlan adjusted by debt/credit) to hours, WITHOUT building a
            // second debt/credit engine in hours-space (see PLAN.md). Guards against div-by-zero
            // for the edge case where literally 100% is already closed/frozen.
            hoursPerPercentPoint = remainingPercent > 0 ? remainingHours / remainingPercent : 0;
          }

          // Only relevant once the project is already confirmed hour-bank-only - which open
          // months to skip rendering in the row (see PLAN.md: "כאשר זה עובר לשם, אפשר לוותר על
          // חודשים ריקים" - but ONLY once it's actually in this state; a normal in-progress
          // project's open months always render, even at 0%).
          if (isHourBankOnlyState) {
            emptyHourBankMonths = calculateEmptyHourBankMonths(relatedActuals, openMonthKeys);
          }

          // Work-volume (₪) - a PARALLEL calculation, not just basePlan converted to ₪ (see
          // PLAN.md's "תיקון קריטי"): "יעד וביצוע" already has its own "חוב" row to reconcile
          // real performance against plan, so basePlan above stays purely calendar-theoretical.
          // "נפח עבודה" has no such row, so the correction has to live here directly, or this
          // number would drift further from reality every time the project is extended.
          monthlyRevenue = new Map();
          basePlan.forEach((percent, monthKey) => {
            if (monthKey < todayMonthKey) monthlyRevenue.set(monthKey, (percent / 100) * totalValue);
          });
          if (openMonthKeys.length > 0) {
            const remainingRevenueValue = totalValue - closedRevenueActualSum;
            const openRevenueMap = calculateBaselinePlan(remainingRevenueValue, startOfMonthISO(todayMonthKey), dynamicTimeline.to);
            openMonthKeys.forEach((monthKey) => monthlyRevenue.set(monthKey, openRevenueMap.get(monthKey) || 0));
          }

          aggregatedActuals = calculateMonthlyCompletionMap(relatedActuals, relevantTaskIds, taskDoneDates);
        } else {
          // Calculate baseline plan
          basePlan = calculateBaselinePlan(
            totalValue,
            baselineTimeline.from,
            baselineTimeline.to
          );
          circleTotal = totalValue;

          // Aggregate actuals from all related items
          aggregatedActuals = new Map();
          relatedActuals.forEach(actual => {
            const rate = actual.hourlyRate || 0;

            if (actual.history?.length) {
              const itemActuals = calculateActuals(actual.history, rate);
              itemActuals.forEach((amount, monthKey) => {
                aggregatedActuals.set(monthKey, (aggregatedActuals.get(monthKey) || 0) + amount);
              });
            }
          });

          // For a regular financial project, "יעד"/"בפועל" already ARE revenue/cost (the task
          // rate field is internal studio cost, not client price - confirmed with the user) -
          // no new computation needed, just reused directly under these names.
          monthlyRevenue = basePlan;
          monthlyCost = aggregatedActuals;
          // "לפי משימות שבוצעו בפועל" row - previously milestone-only purely because this call
          // only lived in the branch above; the function itself has no hasMilestones assumption.
          monthlyRevenueActual = calculateMonthlyRevenueFromActualHours(relatedActuals, totalValue);
        }

        // Sequential (month-by-month, lock-on-start) debt/credit engine - see PLAN.md's
        // 2026-07-19 round and calculateSequentialEffectiveTargets's own comment for the full
        // reasoning. Replaces the old single-shot calculateNetFinancials/calculateEffectiveTarget
        // pair (still used internally by the new function, unchanged, just called once per real
        // month boundary instead of once for "today").
        const financialHistory = history[project.id] || {};
        const { credits, debts, effectiveTargets, effectiveTargetHours, toFreeze: financeToFreeze } = calculateSequentialEffectiveTargets(
          basePlan,
          aggregatedActuals,
          financialHistory,
          circleTotal,
          dynamicTimeline.from,
          dynamicTimeline.to,
          todayMonthKey,
          totalPlannedHours
        );
        if (financeToFreeze.length > 0) {
          freezeWritesAccumulator.push({ projectId: project.id, entries: financeToFreeze });
        }

        // "(Xh)" fix (see PLAN.md) - "יעד עדכני" (effectiveTarget, already includes debt/credit)
        // converted to hours. Closed months AND the current month: use the LOCKED hours-equivalent
        // calculateSequentialEffectiveTargets already froze alongside the percent (2026-07-19
        // follow-up fix - converting a debt-inflated percent via the plain "remaining pool" ratio
        // below produced an inflated, inconsistent hours number the moment a month's locked target
        // exceeded what was actually left in that pool; freezing the hours conversion at the same
        // moment as the percent, using totalPlannedHours AS IT STOOD then, fixes both problems at
        // once). Only genuinely FUTURE months (not started yet, nothing to lock) still use the
        // live project-wide hoursPerPercentPoint rate, unchanged.
        let effectiveTargetHoursByMonth;
        // Hours-equivalent of aggregatedActuals (the monthly task-completion %) for OPEN months
        // only, using the same hoursPerPercentPoint conversion as effectiveTargetHoursByMonth -
        // lets a consumer (the weekly pace-hours calc, workloadCalculations.js) subtract "what's
        // already been done this month" from "what this month's target is", without needing to
        // reconstruct the debt/credit engine's own hours-per-percent-point ratio itself. Only
        // meaningful for the CURRENT open month in practice (aggregatedActuals has no entries yet
        // for future months that haven't started - .get() on those is simply undefined/0). This
        // one stays live/unfrozen on purpose - it's real, still-changing actual progress, not a
        // target - matches the original design.
        let monthlyActualHoursByMonth;
        if (hasMilestones) {
          effectiveTargetHoursByMonth = new Map();
          monthlyActualHoursByMonth = new Map();
          effectiveTargets.forEach((data, monthKey) => {
            const isFuture = monthKey > todayMonthKey;
            const hours = isFuture
              ? (data.value || 0) * hoursPerPercentPoint
              : (effectiveTargetHours.get(monthKey) || 0);
            effectiveTargetHoursByMonth.set(monthKey, hours);
            if (monthKey >= todayMonthKey) {
              monthlyActualHoursByMonth.set(monthKey, (aggregatedActuals.get(monthKey) || 0) * hoursPerPercentPoint);
            }
          });
        }

        return {
          id: project.id,
          name: project.name,
          baselineStart: baselineTimeline.from,
          baselineEnd: baselineTimeline.to,
          dynamicStart: dynamicTimeline.from,
          dynamicEnd: dynamicTimeline.to,
          lastActiveDate,
          // Round 6, Part C refinement (see PLAN.md) - per the user's explicit rule: as long as no
          // task under this project has ever moved to a real status (בוצע/בתהליך/לביצוע/etc, i.e.
          // anything relevantTaskIds counts), the project "hasn't really started" yet, so a
          // schedule edit before that point isn't worth flagging - even a genuine one, not just
          // the creation event (that's filtered separately, server-side, in
          // scheduleHistoryService.js). Gated here rather than server-side because relevantTaskIds
          // is already computed per-project on the client from the same data that drives the
          // circles - no need to duplicate task-status logic into the Worker.
          scheduleUpdatedAt: relevantTaskIds.length > 0 ? (lastScheduleChanges[project.id] || null) : null,
          totalValue,
          profitabilityPercent,
          basePlan,
          actuals: aggregatedActuals,
          credits,
          debts,
          effectiveTargets,
          effectiveHourlyRate,
          hasMilestones,
          milestones: hasMilestones ? policy.milestones : [],
          milestoneAmounts,
          overallCompletion,
          relatedActuals, // needed for the month-tasks drawer on every project, not just milestone ones
          monthlyCost,
          monthlyRevenue,
          monthlyRevenueActual,
          monthTargetHoursByMonth,
          effectiveTargetHoursByMonth,
          monthlyActualHoursByMonth,
          hourBankUsage,
          isHourBankOnlyState,
          emptyHourBankMonths,
        };
      });

    // Determine the global continuous timeline range (Rolling Gantt)
    const today = new Date();
    // Default Gantt window: Start of last year to the end of 3 years from now
    let globalStart = new Date(today.getFullYear() - 1, 0, 1);
    let globalEnd = new Date(today.getFullYear() + 3, 11, 31);

    // Expand boundaries if any project falls outside the default rolling window
    processedProjects.forEach(p => {
      const pStart = new Date(Math.min(new Date(p.dynamicStart), new Date(p.baselineStart)));
      const pEnd = new Date(Math.max(new Date(p.dynamicEnd), new Date(p.baselineEnd)));

      if (pStart < globalStart) {
        globalStart = new Date(pStart.getFullYear(), pStart.getMonth(), 1);
      }
      if (pEnd > globalEnd) {
        globalEnd = new Date(pEnd.getFullYear(), pEnd.getMonth() + 1, 0);
      }
    });

    // Generate a continuous array of months
    const continuousMonths = getMonthsBetween(globalStart, globalEnd);
    const sortedMonths = continuousMonths.map(m => ({
      key: m.key,
      label: m.label
    }));

    // Calculate totals per month
    const monthTotals = new Map();
    sortedMonths.forEach(({ key }) => {
      let totalTarget = 0; // Pure target (baseline - credit)
      let totalDebt = 0;   // Pure debt
      let totalActual = 0; // Pure actual
      let milestoneAtRisk = false; // any milestone-billed project's last month, still in debt
      let atRiskAmount = 0; // sum of the real money tied to at-risk milestones landing this month
      let totalRevenue = 0; // work-volume value (₪) across every project, additive info layer
      let totalRevenueActual = 0; // real work-volume (₪) from actual logged hours - drives profitPercent below, NOT totalRevenue (see PLAN.md 2026-07-12 round)
      let totalCost = 0;    // real internal studio cost (₪) across every project
      let hasPendingMilestone = false; // any project has a milestone pending time-confirmation this month

      processedProjects.forEach(p => {
        // Cost/revenue "hats" - computed uniformly for every project regardless of
        // hasMilestones (see monthlyCost/monthlyRevenue above), purely additive to the
        // existing target/debt/actual totals below - doesn't replace or affect them.
        totalRevenue += p.monthlyRevenue?.get(key) || 0;
        totalRevenueActual += p.monthlyRevenueActual?.get(key) || 0;
        totalCost += p.monthlyCost?.get(key) || 0;

        // Milestone projects track % completion internally now (not money) - their only
        // real money contribution to the portfolio totals is the milestone amount itself,
        // in the specific month it lands on.
        if (p.hasMilestones) {
          const milestoneMoney = p.milestoneAmounts.get(key) || 0;
          totalTarget += milestoneMoney;
          totalActual += milestoneMoney;

          // Same "at risk" condition as MonthCell.jsx: any month with a milestone landing on it
          // and open debt at that point, no date/month gating (a project can have more than one
          // future milestone at risk at once - each counted independently). The money-at-risk is
          // the milestone's FULL amount, not the debt percentage converted to money - per the
          // user's explicit instruction, since the milestone is genuinely all riding on hitting
          // its completion trigger, not just the shortfall sliver.
          const debtThisMonth = p.debts.get(key) || 0;
          if (milestoneMoney > 0 && debtThisMonth > 0) {
            milestoneAtRisk = true;
            atRiskAmount += milestoneMoney;
          }

          // Surface a pending-confirmation milestone at the portfolio level too (not just on
          // the project's own settings button/cell) - a "+" and a yellow icon, no text (see
          // TotalsRow.jsx).
          (p.milestones || []).forEach((m) => {
            const status = getMilestoneStatus(m, p.dynamicStart, p.dynamicEnd, p.lastActiveDate);
            if (status.monthKey === key && status.isPendingTimeConfirmation) hasPendingMilestone = true;
          });
          return;
        }

        const targetData = p.effectiveTargets.get(key);
        const isDynamic = targetData?.inSchedule || false;

        const base = p.basePlan.get(key) || 0;
        const credit = p.credits.get(key) || 0;
        const debt = p.debts.get(key) || 0;
        const actual = p.actuals.get(key) || 0;

        // 1. Target: Baseline minus credit, ONLY if it's still in the dynamic schedule
        if (isDynamic) {
          totalTarget += Math.max(0, base - credit);
          // 2. Debt: Only sum up pure debts
          totalDebt += debt;
        }

        // 3. Actual: Always sum up actuals, regardless of schedule changes
        totalActual += actual;
      });

      monthTotals.set(key, {
        target: totalTarget,
        debt: totalDebt,
        actual: totalActual,
        milestoneAtRisk,
        atRiskAmount,
        hasPendingMilestone,
        totalRevenue,
        totalCost,
        totalProfit: totalRevenueActual - totalCost,
        // Only a meaningful percentage once real work has actually started (cost > 0) - a
        // future month with a planned revenue share but zero cost logged yet would otherwise
        // read as "100% profitable", which is misleading (nothing has happened yet).
        profitPercent: (totalRevenueActual > 0 && totalCost > 0) ? ((totalRevenueActual - totalCost) / totalRevenueActual) * 100 : null,
      });
    });

    return { projects: processedProjects, monthColumns: sortedMonths, totals: monthTotals, pendingFreezeWrites: freezeWritesAccumulator };
  }, [rawData, policies, history, lastScheduleChanges, taskDoneDates]);

  // Dispatched after render, not during the useMemo above - each entry only ever contains
  // months that don't already have a frozen value in `history`, so once the write round-trips
  // and `history` updates, the same months won't be collected again on the next recompute.
  // Skipped entirely while any upstream input is still loading (see upstreamInputsLoading's own
  // comment above) - a freeze computed from incomplete inputs must never reach the server, since
  // it would lock in permanently.
  useEffect(() => {
    if (!recordHistory || upstreamInputsLoading) return;
    pendingFreezeWrites.forEach(({ projectId, entries }) => {
      if (entries.length > 0) recordHistory(projectId, entries);
    });
  }, [pendingFreezeWrites, recordHistory, upstreamInputsLoading]);

  return { projects, monthColumns, totals, loading, error, refetch: fetchData };
};
