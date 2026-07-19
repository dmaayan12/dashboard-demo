import { useState } from 'react';
import { Box, VStack, Text, Tooltip, Circle, Portal } from '@chakra-ui/react';
import { Check, Banknote } from 'lucide-react';
import MonthTooltip from './MonthTooltip';
import MonthTasksDrawer from './MonthTasksDrawer';
import { getWorkingDaysInRange } from '../utils/dateUtils';
import { calculateMonthlyPotential } from '../utils/financialCalculations';
import { getMilestoneStatus, calculateHoursOverrun } from '../utils/paymentPolicyCalculations';

const MonthCell = ({
  project,
  monthKey,
  monthLabel,
  isActive
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Round 6, Part C (see PLAN.md) - the note only makes sense on months that are still "open"
  // (not yet frozen, per Part B's same boundary) - a closed month's numbers are locked in and
  // don't reflect whatever changed afterward, so flagging it as "updated on X" would be
  // misleading there.
  const today = new Date();
  const todayMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const scheduleUpdatedAt = monthKey >= todayMonthKey ? project.scheduleUpdatedAt : null;

  const basePlan = project.basePlan.get(monthKey) || 0;
  const credit = project.credits.get(monthKey) || 0;
  const debt = project.debts.get(monthKey) || 0;
  // A month can carry BOTH a real debt share and a real credit share at once now (2026-07-19,
  // sequential debt/credit engine round - see PLAN.md): e.g. a large early-project surplus
  // reserved for the last month can be bigger than that month's own accumulated debt. `debt`/
  // `credit` above stay as the raw components (both shown separately in the tooltip, per the
  // user's explicit request to see the debt line even when it's fully offset) - but every VISUAL
  // warning treatment (red milestone marker, orange dashed ring) must react to the NET position,
  // not the raw debt alone, or a month that's actually fully covered (credit ≥ debt) would still
  // show as "at risk" for no real reason. "קיזוז חזק יותר מחוב" - credit wins visually.
  const netDebt = Math.max(0, debt - credit);
  // Distinguish "this month has no entry at all" (falls back to the baseline-rate estimate
  // below - genuinely missing data, e.g. a schedule-extension month) from "this month has a
  // real, correctly-computed target of exactly 0" (a fully-credited month - nothing left to
  // deliver, a perfectly valid and common state, NOT missing data). The old `|| fallback` used
  // JS truthiness on the retrieved value, so a real 0 (falsy) silently triggered the fallback
  // too - for a milestone project that fallback computes a ₪-scale estimate that then got
  // displayed as if it were a percent, producing nonsense values like "19665%" on a month that
  // was actually simply fully paid off. See PLAN.md for the live repro that caught this.
  const hasTargetData = project.effectiveTargets.has(monthKey);
  const targetData = project.effectiveTargets.get(monthKey) || { value: 0, inSchedule: false };
  const actual = project.actuals.get(monthKey) || 0;

  const [year, month] = monthKey.split('-').map(Number);

  // STANDARDIZED: Always use Dynamic Timeline for working days calculation
  const workingDays = getWorkingDaysInRange(
    year,
    month - 1,
    new Date(project.dynamicStart),
    new Date(project.dynamicEnd)
  );

  const effectiveTarget = hasTargetData
    ? Number(targetData.value || 0)
    : calculateMonthlyPotential(project.totalValue, project.baselineStart, project.baselineEnd, workingDays);

  // Milestones landing this month - tooltip-only info now, doesn't drive the circles (see CLAUDE.md)
  const milestonesThisMonth = (project.milestones || [])
    .map((m) => {
      const status = getMilestoneStatus(m, project.dynamicStart, project.dynamicEnd, project.lastActiveDate);
      return {
        ...m,
        amount: ((Number(m.percent) || 0) / 100) * project.totalValue,
        monthKey: status.monthKey,
        isPendingTimeConfirmation: status.isPendingTimeConfirmation,
      };
    })
    .filter((m) => m.monthKey === monthKey);

  // A milestone whose secondary time-condition fired first still needs explicit user
  // confirmation before it counts toward money - shown as a distinct yellow state.
  const hasPendingMilestone = milestonesThisMonth.some((m) => m.isPendingTimeConfirmation);

  // A milestone is "at risk" whenever there's unresolved debt at this point - no date/month
  // gating at all (deliberately, per the user: the dashboard's job is to keep showing danger
  // for as long as debt is open, since the workflow is "if it's red, extend the schedule or
  // catch up" - it should never silently go green just because a date passed while the debt
  // was still open). debt itself already tracks the live, continuously-recalculated shortfall,
  // so this is correct with zero extra bookkeeping.
  const milestoneAtRisk = project.hasMilestones && netDebt > 0;

  // Milestone marker color: yellow takes priority when its secondary time-condition fired
  // first and still needs user confirmation (see hasPendingMilestone above) - this needs
  // action regardless of the other states; red when there's open NET debt; green otherwise
  // (either already realized with nothing owed, on pace, or fully covered by a bigger credit).
  // No "pending/purple" state - see milestoneAtRisk comment above for why.
  const milestoneColorScheme = hasPendingMilestone ? 'yellow' : (netDebt > 0 ? 'red' : 'green');

  // Hours logged in this month specifically (not cumulative) vs. this month's own pace-target -
  // tooltip-only context, computed per-cell so it reflects the specific month being viewed.
  const hoursOverrun = project.hasMilestones
    ? calculateHoursOverrun(project.relatedActuals, monthKey)
    : null;

  // "(Xh)" fix (see PLAN.md) - direct, already-correct hours values for this specific month,
  // computed in useDashboardData.js from a real "what's left" pool (closed months frozen in
  // hours directly; open months a live share of the real remaining total) - NOT a flat
  // whole-project total multiplied by a percent at render time (the old, drifting approach).
  const basePlanHours = project.monthTargetHoursByMonth?.get(monthKey) || 0;
  const effectiveTargetHours = project.effectiveTargetHoursByMonth?.get(monthKey) || 0;

  // Cost/revenue "hat" - purely additive info layer (see CLAUDE.md), independent of what
  // drives the circles above. Same for every project regardless of hasMilestones.
  const monthRevenue = project.monthlyRevenue?.get(monthKey) || 0;
  const monthRevenueActual = project.monthlyRevenueActual?.get(monthKey) || 0;
  const monthCost = project.monthlyCost?.get(monthKey) || 0;
  // Profit is measured against monthRevenueActual (real work delivered this month, from actual
  // logged hours), NOT monthRevenue (the flat calendar-smoothed share) - cost itself is always
  // real/actual, so comparing it against a smoothed revenue figure produced wildly misleading
  // profitability in months where real work volume diverged a lot from the flat schedule (e.g.
  // a month with heavy real cost but a tiny smoothed share showed -102% "profitability" despite
  // real delivered value comfortably covering the cost - see PLAN.md 2026-07-12 round).
  // monthRevenue itself is untouched and still shown as its own tooltip row.
  const monthProfit = monthRevenueActual - monthCost;
  const monthProfitPercent = monthRevenueActual > 0 ? (monthProfit / monthRevenueActual) * 100 : null;

  // Month is cancelled ONLY if:
  // 1. It was in the Original Baseline (basePlan > 0)
  // 2. It is NO LONGER in the Dynamic Schedule (!targetData.inSchedule)
  // 3. No work was actually done (actual === 0)
  const isCancelled = !targetData.inSchedule && basePlan > 0 && actual === 0;

  // Extension is ONLY if:
  // 1. Within Dynamic Schedule (targetData.inSchedule)
  // 2. NOT in original baseline (basePlan === 0)
  const isExtension = targetData.inSchedule && basePlan === 0;

  // FULLY CREDITED: Month is fully credited if it is:
  // 1. Within Project Schedule (targetData.inSchedule)
  // 2. Has effective target reduced to near-zero (targetData.value <= 0.1)
  // 3. Has credits applied (credit > 0)
  const isFullyCredited = targetData.inSchedule && targetData.value <= 0.1 && credit > 0;

  // --- VISUAL SIZE CALCULATIONS ---
  const BASE_SIZE = 50;
  const MAX_SIZE = 70;
  const MIN_VISIBLE_SIZE = 22; // Ensures even small debt is visible and clickable

  // A. Calculate project average baseline as a reference for "100% capacity"
  const allBaselines = Array.from(project.basePlan.values()).filter(v => v > 0);
  const avgBaseline = allBaselines.length > 0
    ? allBaselines.reduce((a, b) => a + b, 0) / allBaselines.length
    : 0;

  // A2. For milestone (percent-based) projects only: ONE SHARED size-reference scale for BOTH
  // target and actual circles - the strongest value (target OR actual) this exact project has
  // ever had. A first attempt (2026-07-12) sized actual relative to maxActual but left target on
  // its own separate avgBaseline-relative scale - the user caught that this could still render a
  // smaller-% target circle BIGGER than a larger-% actual circle (two different scales
  // disagreeing with the raw percentages themselves, e.g. a 15% target rendering bigger than a
  // 25% actual). Using the same denominator for both guarantees size order always matches value
  // order within this project. Not comparable across different projects (accepted trade-off).
  const allActuals = project.hasMilestones
    ? Array.from(project.actuals.values()).filter((v) => v > 0)
    : [];
  const maxActual = allActuals.length > 0 ? Math.max(...allActuals) : 0;
  const maxTarget = allBaselines.length > 0 ? Math.max(...allBaselines) : 0;
  const maxMilestoneValue = Math.max(maxActual, maxTarget);

  // B. Calculate Target (Glass) Size
  let targetSize = 0;
  if (project.hasMilestones && maxMilestoneValue > 0) {
    if (effectiveTarget > 0) targetSize = (effectiveTarget / maxMilestoneValue) * MAX_SIZE;
    if (targetSize > 0) {
      targetSize = Math.max(targetSize, 12);
      targetSize = Math.min(targetSize, MAX_SIZE);
    }
  } else {
    const referenceValue = basePlan > 0 ? basePlan : avgBaseline;
    if (referenceValue > 0 && effectiveTarget > 0) {
      targetSize = (effectiveTarget / referenceValue) * BASE_SIZE;
    }
    // Apply visual constraints to Target
    if (targetSize > 0) {
      targetSize = Math.max(targetSize, MIN_VISIBLE_SIZE);
      targetSize = Math.min(targetSize, MAX_SIZE);
    }
  }

  // C. Calculate Actual (Liquid) Size
  let actualSize = 0;
  if (actual > 0) {
    if (project.hasMilestones && maxMilestoneValue > 0) {
      // Milestone projects: size relative to the SAME shared scale as target above (maxMilestoneValue).
      actualSize = (actual / maxMilestoneValue) * MAX_SIZE;
    } else if (effectiveTarget > 0) {
      // Scale relative to the target circle
      actualSize = (actual / effectiveTarget) * targetSize;
    } else {
      // Fallback for actuals without target
      actualSize = BASE_SIZE;
    }
    // Ensure actual is visible if it exists, but capped
    actualSize = Math.max(actualSize, 12);
    actualSize = Math.min(actualSize, MAX_SIZE + 5); // Allow slight overflow for over-performance
  }

  // IMPORTANT: If a month is not in schedule and has no data/baseline, return null
  if (!targetData.inSchedule && !isCancelled && actual === 0 && !targetData.value) {
    return <Box minW="100px" h="100px" bg="transparent" />;
  }

  // Round 2026-07-16 (see PLAN.md) - once a project has moved into the "agreed work is done,
  // only hour-bank usage remains" state, an open month with no real hour-bank activity is just
  // noise (always trivially 0%/fully-credited) - skip it the same way an out-of-schedule month
  // already gets skipped above. Recomputed fresh every render (project.emptyHourBankMonths), so
  // the moment real hours land on a bank task this month, it stops being "empty" and reappears.
  if (project.isHourBankOnlyState && project.emptyHourBankMonths?.has(monthKey)) {
    return <Box minW="100px" h="100px" bg="transparent" />;
  }

  // strategy:'fixed' positions relative to the viewport rather than the (transformed,
  // custom-scrolling) table ancestor. fitViewport sets --available-height/--available-width
  // CSS vars on the positioner so a tall tooltip is capped and scrolls internally instead of
  // overflowing past the top of the viewport. slide:true handles the horizontal equivalent -
  // without it, a cell near the left/right edge of the screen (e.g. the last month column)
  // gets its tooltip clipped off the side instead of sliding to stay within the viewport.
  return (
    <Tooltip.Root
      openDelay={200}
      portalled={true}
      interactive={true}
      positioning={{
        placement: 'bottom',
        gutter: 8,
        flip: true,
        slide: true,
        overlap: true,
        overflowPadding: 12,
        fitViewport: true,
        strategy: 'fixed',
      }}
    >
      <Tooltip.Trigger asChild>
        <Box
          minW="100px"
          h="100px"
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          bg="transparent"
          position="relative"
          _hover={{ bg: 'blackAlpha.20' }}
          _dark={{ _hover: { bg: 'whiteAlpha.20' } }}
          transition="all 0.2s"
          cursor="pointer"
          filter={isCancelled ? "grayscale(1)" : "none"}
          opacity={isCancelled ? 0.4 : 1}
          onDoubleClick={() => setDrawerOpen(true)}
        >
          {/* Circle Group Container */}
          <Box
            position="relative"
            w="80px"
            h="80px"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >

            {/* Layer 0: Extension Placeholder (Only show if NO net debt) */}
            {isExtension && netDebt === 0 && (
              <Circle
                position="absolute"
                size={`${BASE_SIZE}px`}
                border="1.5px dashed"
                borderColor="gray.400"
                opacity={0.6}
              />
            )}

            {/* Layer 1: Debt Boundary (Orange Dashed) - net debt only, see netDebt's own comment */}
            {netDebt > 0 && (
              <Circle
                position="absolute"
                size={`${isExtension ? targetSize : MAX_SIZE}px`}
                border="2px dashed"
                borderColor="orange.500"
              />
            )}

            {/* Layer 2: Original Baseline (Green border indicating original intent) */}
            {credit > 0 && (
              <Circle
                position="absolute"
                size={`${BASE_SIZE}px`}
                border="1.5px solid"
                borderColor="green.400"
                opacity={0.6}
              />
            )}

            {/* Layer 3: Effective Target (Blue Fill - ONLY show if within Baseline) */}
            {effectiveTarget > 0 && basePlan > 0 && (
              <Circle
                position="absolute"
                size={`${Math.min(targetSize, MAX_SIZE)}px`}
                bg="blue.400"
                opacity={0.2}
              />
            )}

            {/* Layer 4: Actual Performance (Green Fill) */}
            {isFullyCredited ? (
              <Circle
                position="absolute"
                size={`${BASE_SIZE}px`}
                border="2px solid"
                borderColor="green.500"
                bg="transparent"
                color="green.500"
                display="flex"
                alignItems="center"
                justifyContent="center"
                zIndex={2}
              >
                <Check size={24} strokeWidth={3} />
              </Circle>
            ) : actual > 0 ? (
              <Circle
                position="absolute"
                size={`${actualSize}px`}
                bg="green.500"
                shadow="sm"
                zIndex={1}
              />
            ) : null}
          </Box>

          {/* Percentage Label - Clean Badge in Bottom-Right Corner.
              For milestone projects `actual` is already the monthly task-completion flow
              rate (% of relevant tasks done that month), so it's shown as-is - it is NOT a
              ratio against effectiveTarget like the money case. Always shown (even at 0%) for
              every project - most months legitimately have nothing happen, and hiding the
              badge there made the feature look broken/inconsistent. */}
          {!isFullyCredited && (project.hasMilestones || effectiveTarget > 0) && (
            <Box
              position="absolute"
              bottom="4px"
              right="4px"
              bg="gray.50"
              _dark={{ bg: '#1C1F3B' }}
              px={2.5}
              py={0.5}
              borderRadius="lg"
              boxShadow="md"
              zIndex={15}
            >
              <Text
                fontSize="10px"
                fontWeight="extrabold"
                color="gray.800"
                _dark={{ color: "white" }}
                lineHeight="1"
              >
                {project.hasMilestones ? Math.round(actual) : Math.round((actual / effectiveTarget) * 100)}%
              </Text>
            </Box>
          )}

          {/* Milestone-payment marker - deliberately NOT styled like the percentage badge
              (different shape/color/corner) so the two aren't mistaken for one another.
              Color reflects milestone state (see milestoneColorScheme above): red = at risk,
              green = already realized, purple = still pending. */}
          {milestonesThisMonth.length > 0 && (
            <Circle
              position="absolute"
              top="2px"
              left="2px"
              size="18px"
              bg={`${milestoneColorScheme}.500`}
              boxShadow="md"
              zIndex={15}
            >
              <Banknote size={10} color="white" />
            </Circle>
          )}
        </Box>
      </Tooltip.Trigger>

      <Portal>
        <Tooltip.Positioner zIndex={9999}>
          <Tooltip.Content
            p={0}
            bg="white"
            _dark={{ bg: "#292F4C" }}
            border="none"
            boxShadow="none"
            maxW="820px"
          >
            <MonthTooltip
              projectName={project.name}
              monthLabel={monthLabel}
              workingDays={workingDays}
              basePlan={basePlan}
              credit={credit}
              debt={debt}
              effectiveTarget={effectiveTarget}
              actual={actual}
              isCancelled={isCancelled}
              hourlyRate={project.effectiveHourlyRate}
              milestones={milestonesThisMonth}
              hasMilestones={project.hasMilestones}
              hoursOverrun={hoursOverrun}
              milestoneAtRisk={milestoneAtRisk}
              milestoneColorScheme={milestoneColorScheme}
              basePlanHours={basePlanHours}
              effectiveTargetHours={effectiveTargetHours}
              scheduleUpdatedAt={scheduleUpdatedAt}
              revenue={monthRevenue}
              revenueActual={monthRevenueActual}
              cost={monthCost}
              profit={monthProfit}
              profitPercent={monthProfitPercent}
            />
          </Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>

      <MonthTasksDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        project={project}
        monthKey={monthKey}
        monthLabel={monthLabel}
        monthRevenue={monthRevenue}
      />
    </Tooltip.Root>
  );
};

export default MonthCell;
