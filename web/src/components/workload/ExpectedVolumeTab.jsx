import { useState } from 'react';
import { Box, VStack, HStack, Text, Alert, Heading, IconButton } from '@chakra-ui/react';
import { Clock, TrendingUp, ChevronRight, ChevronLeft, AlertTriangle } from 'lucide-react';
import { useExpectedVolumeData } from '../../hooks/useExpectedVolumeData';
import { UNLINKED_PROJECT_KEY } from '../../utils/workloadCalculations';
import { formatCurrency } from '../../utils/financialCalculations';
import { formatDate, formatDayMonth } from '../../utils/dateUtils';
import ProjectTasksDrawer from './ProjectTasksDrawer';
import SplashScreen from '../SplashScreen';

const TAB_BAR_HEIGHT = '41px'; // keep in sync with App.jsx TAB_BAR_HEIGHT

const WEEK_LABELS = { previous: 'שבוע קודם', current: 'שבוע נוכחי', next: 'שבוע הבא' };
const OFFSET_TO_KEY = { [-1]: 'previous', 0: 'current', 1: 'next' };

/** "11-17.7" style range for a real [weekStart, weekEnd) boundary pair. */
const formatWeekRange = (weekStart, weekEnd) => {
  if (!weekStart || !weekEnd) return '';
  const start = new Date(weekStart);
  const end = new Date(weekEnd);
  end.setDate(end.getDate() - 1); // display as an inclusive end day, not the exclusive Sunday boundary
  return `${start.getDate()}-${end.getDate()}.${end.getMonth() + 1}`;
};

// `plain` (used only inside the hero card, under the "מתוכננות בפועל" number) drops the
// bordered/filled pill entirely - a boxed chip there competed visually with the big numbers and
// looked like a clickable element it isn't, plus it broke the symmetry with the plain-text
// caption sitting under "יעד" right next to it. The per-project list keeps the original pill
// (fine there - it's inline next to a project name, not paired against a plain-text sibling).
const OverrunBadge = ({ count, plain = false }) => {
  if (!count) return null;
  if (plain) {
    return (
      <HStack justify="center" gap={1}>
        <AlertTriangle size={12} color="var(--chakra-colors-orange-600)" />
        <Text fontSize="xs" fontWeight="bold" color="orange.600" _dark={{ color: 'orange.300' }}>
          {count} משימות חורגות
        </Text>
      </HStack>
    );
  }
  return (
    <HStack
      gap={1}
      bg="orange.50"
      _dark={{ bg: 'orange.900/30' }}
      border="1px solid"
      borderColor="orange.200"
      px={2}
      py={0.5}
      borderRadius="md"
      flexShrink={0}
    >
      <AlertTriangle size={12} color="var(--chakra-colors-orange-600)" />
      <Text fontSize="xs" fontWeight="bold" color="orange.700" _dark={{ color: 'orange.300' }}>
        {count} משימות חורגות
      </Text>
    </HStack>
  );
};

// Two equal-weight number blocks side by side: "יעד" (the pace target needed to stay on
// schedule across every project) next to whatever's actually planned/worked this week - no
// money line at all (per the user's explicit request, the money value was noise here). The
// second block's label/value switch between "already worked" (previous week, real logged
// hours) and "currently scheduled" (current/next week, assigned-in-monday hours) since those
// are genuinely different questions depending on whether the week is locked yet.
const HeroNumberBlock = ({ label, value, color, caption, extra }) => (
  <Box textAlign="center" w="240px">
    <Text fontSize="md" fontWeight="bold" color={color} mb={1}>{label}</Text>
    <Text fontSize="6xl" fontWeight="extrabold" lineHeight="1" color={color}>
      {Math.round(value)}
    </Text>
    <Text fontSize="md" color="fg.muted">שעות</Text>
    {caption && <Text fontSize="xs" color="fg.muted" mt={1}>{caption}</Text>}
    {extra && <Box mt={2}>{extra}</Box>}
  </Box>
);

// Same blue used for the "assigned/planned" concept everywhere on this screen (this card's own
// second number, each project row's "שעות משוייכות" text below, and the bar's blue segment) -
// per the user's explicit complaint that the hero number used a different shade than the list,
// which read as two unrelated numbers even though they're the same thing at different scopes.
const PLANNED_BLUE = 'blue.600';

const HeroCard = ({ hours, actualHours, dateRange, paceHours, overrunCount }) => {
  const isPreviousWeek = actualHours != null;
  const secondLabel = isPreviousWeek ? 'בפועל' : 'שעות מתוכננות בפועל';
  const secondValue = isPreviousWeek ? actualHours : hours;

  return (
    <Box
      p={8}
      borderRadius="xl"
      bg="blue.50"
      _dark={{ bg: "blue.900/20", borderColor: "blue.800" }}
      border="1px solid"
      borderColor="blue.100"
    >
      <HStack justify="center" gap={12} align="flex-start">
        <HeroNumberBlock
          label="יעד"
          value={paceHours}
          color="purple.600"
          caption="סך השעות הנדרש עבור כלל הפרויקטים, כדי לעמוד בלוז של כולן יחד"
        />
        <Box w="1px" alignSelf="stretch" bg="blue.200" _dark={{ bg: 'blue.800' }} />
        {/* The overrun badge sits under THIS number specifically (not floating above the whole
            card, disconnected from either side) - it's a property of the assigned/planned work,
            not of the pace target next to it. */}
        <HeroNumberBlock
          label={secondLabel}
          value={secondValue}
          color={isPreviousWeek ? 'green.600' : PLANNED_BLUE}
          extra={overrunCount ? <OverrunBadge count={overrunCount} plain /> : null}
        />
      </HStack>
    </Box>
  );
};

const ProjectBar = ({ name, hours, money, plannedPercent, actualPercent, hasMilestones, paceHours, overrunCount, isOverdue, overdueDate, hideCompletionLine, onClick }) => (
  <Box cursor="pointer" onClick={onClick}>
    <HStack justify="space-between" mb={1}>
      <HStack gap={2} minW={0}>
        <Text fontSize="sm" fontWeight="medium" noOfLines={1}>{name}</Text>
        <OverrunBadge count={overrunCount} />
      </HStack>
      <VStack align="end" gap={0} flexShrink={0}>
        <Text fontSize="sm" fontWeight="bold" color={PLANNED_BLUE} _dark={{ color: "blue.300" }}>
          {Math.round(hours)} שעות משוייכות{!hasMilestones ? ` · ${formatCurrency(money)} ₪` : ''}
        </Text>
        {hasMilestones && paceHours != null && (
          <Text fontSize="xs" color="purple.600" _dark={{ color: "purple.300" }}>
            יעד קצב לעמידה בלוז: {Math.round(paceHours)} שעות
          </Text>
        )}
        {/* The pace-hours number above keeps showing even once the project's own dynamic
            deadline has passed (per the user's explicit call - the remaining work doesn't
            disappear just because the schedule ran out) - but that's exactly why it needs a
            visible flag here, so it doesn't read as a normal, on-track number. */}
        {isOverdue && (
          <Text fontSize="xs" color="orange.600" _dark={{ color: 'orange.300' }} fontWeight="bold">
            ⚠ לו"ז הפרויקט הסתיים ב-{overdueDate} - יש לעדכן במאנדי
          </Text>
        )}
      </VStack>
    </HStack>
    {/* Only relevant for weeks that have already started - "next week" has no "actual" yet
        (it's pure planning), so the whole bar+line would just show a misleading "0% actual". */}
    {!hideCompletionLine && (
      <>
        <HStack h="8px" borderRadius="full" bg="gray.100" _dark={{ bg: "whiteAlpha.100" }} overflow="hidden" gap={0} mb={1}>
          <Box h="100%" bg="green.500" width={`${Math.min(100, actualPercent)}%`} flexShrink={0} />
          <Box h="100%" bg="blue.400" width={`${Math.max(0, Math.min(100 - actualPercent, plannedPercent))}%`} flexShrink={0} />
        </HStack>
        <Text fontSize="xs" color="fg.muted">
          השלמת משימות: {Math.round(actualPercent)}% בפועל מתוך {Math.round(plannedPercent)}% מתוכנן לשבוע
        </Text>
      </>
    )}
  </Box>
);

const buildRows = (weekView) => {
  if (!weekView) return [];
  const { summary, taskProgress, managementOnlyProjectIds } = weekView;
  // Milestone projects need to show up even with 0 currently-assigned hours - that gap (pace
  // required vs. nothing assigned yet) is exactly the signal this view exists for. Projects with
  // task-progress data but no hours entry (e.g. nothing scheduled this week) also need to show up.
  const projectIds = new Set([
    ...summary.byProject.keys(),
    ...(summary.byProjectPaceHours?.keys() || []),
    ...taskProgress.keys(),
  ]);

  return [...projectIds]
    .filter((projectId) => !managementOnlyProjectIds?.has(projectId))
    .map((projectId) => {
      const hours = summary.byProject.get(projectId) || 0;
      const progress = taskProgress.get(projectId) || { plannedPercent: 0, actualPercent: 0 };
      const tasks = summary.byProjectTasks.get(projectId) || [];
      return {
        projectId,
        hours,
        money: summary.byProjectMoney.get(projectId) || 0,
        name: projectId === UNLINKED_PROJECT_KEY ? 'ללא פרויקט מקושר' : (summary.projectNames.get(projectId) || projectId),
        plannedPercent: progress.plannedPercent,
        actualPercent: progress.actualPercent,
        hasMilestones: summary.milestoneProjectIds?.has(projectId) || false,
        paceHours: summary.byProjectPaceHours?.get(projectId),
        overrunCount: tasks.filter((t) => t.isOverrun).length,
        isOverdue: summary.overdueProjectIds?.has(projectId) || false,
        overdueDate: summary.overdueDynamicTo?.get(projectId) ? formatDayMonth(summary.overdueDynamicTo.get(projectId)) : null,
      };
    })
    .sort((a, b) => (b.paceHours || b.hours) - (a.paceHours || a.hours));
};

const countOverrunTasks = (weekView) => {
  if (!weekView) return 0;
  let count = 0;
  weekView.summary.byProjectTasks.forEach((tasks, projectId) => {
    if (weekView.managementOnlyProjectIds?.has(projectId)) return;
    count += tasks.filter((t) => t.isOverrun).length;
  });
  return count;
};

const ExpectedVolumeTab = () => {
  const {
    weeks, boundaries, usersById, lastUpdated, recurringTaskIds, loading, error,
  } = useExpectedVolumeData();
  const [viewOffset, setViewOffset] = useState(0); // -1 = previous, 0 = current (default), 1 = next
  const [selectedTarget, setSelectedTarget] = useState(null); // { weekKey, projectId } | null

  if (loading) {
    return <SplashScreen minHeight={`calc(100vh - ${TAB_BAR_HEIGHT})`} />;
  }

  if (error) {
    return (
      <Box p={6}>
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Title>טעינת נתוני העומס נכשלה</Alert.Title>
          <Alert.Description>{error}</Alert.Description>
        </Alert.Root>
      </Box>
    );
  }

  const weekKey = OFFSET_TO_KEY[viewOffset];
  const activeWeek = weeks[weekKey];
  const activeBoundaries = boundaries?.[weekKey];
  const rows = buildRows(activeWeek);
  const globalOverrunCount = countOverrunTasks(activeWeek);

  // Every hero-card total excludes management-only projects (calculateManagementOnlyProjectIds) -
  // same set `buildRows` already filters the per-project list by, so the aggregate numbers stay
  // consistent with what's actually listed below them.
  const managementOnlyIds = activeWeek?.managementOnlyProjectIds || new Set();
  const sumExcludingManagementOnly = (map) =>
    [...(map?.entries() || [])].reduce((sum, [projectId, val]) => (managementOnlyIds.has(projectId) ? sum : sum + val), 0);
  const totalHours = activeWeek ? sumExcludingManagementOnly(activeWeek.summary.byProject) : 0;
  const totalPaceHours = activeWeek ? sumExcludingManagementOnly(activeWeek.summary.byProjectPaceHours) : 0;
  const totalActualHours = activeWeek?.summary.actualHoursByProject
    ? sumExcludingManagementOnly(activeWeek.summary.actualHoursByProject)
    : null;

  const selectedProject = rows.find((r) => r.projectId === selectedTarget?.projectId);

  return (
    <Box minH="100vh" bg="white" _dark={{ bg: "#1C1F3B", color: "white" }} p={6}>
      <HStack justify="space-between" mb={6}>
        <HStack gap={3}>
          <Clock size={28} />
          <VStack align="start" gap={0}>
            <Heading size="xl">נפח עבודה צפוי</Heading>
            <Text color="fg.muted" fontSize="sm">התפלגות שעות העבודה הצפויות, לפי פרויקט</Text>
          </VStack>
        </HStack>
        {lastUpdated && (
          <Text fontSize="xs" color="fg.muted">עודכן לאחרונה: {formatDate(lastUpdated)}</Text>
        )}
      </HStack>

      <VStack align="stretch" gap={6} maxW="760px" mx="auto">
        <HStack justify="center" gap={5}>
          <IconButton
            size="lg"
            variant="ghost"
            aria-label="שבוע קודם"
            onClick={() => setViewOffset((v) => Math.max(-1, v - 1))}
            disabled={viewOffset <= -1}
          >
            <ChevronRight size={26} />
          </IconButton>
          <VStack gap={0} minW="220px" align="center">
            <Heading size="2xl" lineHeight="1.1">{WEEK_LABELS[weekKey]}</Heading>
            <Text fontSize="lg" fontWeight="semibold" color="blue.600" _dark={{ color: 'blue.300' }}>
              {formatWeekRange(activeBoundaries?.weekStart, activeBoundaries?.weekEnd)}
            </Text>
          </VStack>
          <IconButton
            size="lg"
            variant="ghost"
            aria-label="שבוע הבא"
            onClick={() => setViewOffset((v) => Math.min(1, v + 1))}
            disabled={viewOffset >= 1}
          >
            <ChevronLeft size={26} />
          </IconButton>
        </HStack>

        {!activeWeek ? (
          <Alert.Root status="info">
            <Alert.Indicator />
            <Alert.Title fontSize="sm">אין עדיין נתונים לשבוע הקודם - יופיעו אחרי שהשבוע הנוכחי ייעל.</Alert.Title>
          </Alert.Root>
        ) : (
          <>
            <HeroCard
              hours={totalHours}
              actualHours={totalActualHours}
              dateRange={formatWeekRange(activeBoundaries?.weekStart, activeBoundaries?.weekEnd)}
              paceHours={totalPaceHours}
              overrunCount={globalOverrunCount}
            />

            <Box>
              <HStack justify="space-between" mb={3}>
                <Text fontSize="sm" fontWeight="bold" color="fg.muted">
                  לפי פרויקט
                </Text>
                <HStack gap={4}>
                  <HStack gap={1.5}>
                    <Box w="10px" h="10px" borderRadius="full" bg="green.500" />
                    <Text fontSize="xs" color="fg.muted">משימות שהושלמו השבוע</Text>
                  </HStack>
                  <HStack gap={1.5}>
                    <Box w="10px" h="10px" borderRadius="full" bg="blue.400" />
                    <Text fontSize="xs" color="fg.muted">משימות מתוכננות לשבוע</Text>
                  </HStack>
                </HStack>
              </HStack>
              <VStack align="stretch" gap={4}>
                {rows.map((row) => (
                  <ProjectBar
                    key={row.projectId}
                    name={row.name}
                    hours={row.hours}
                    money={row.money}
                    plannedPercent={row.plannedPercent}
                    actualPercent={row.actualPercent}
                    hasMilestones={row.hasMilestones}
                    paceHours={row.paceHours}
                    overrunCount={row.overrunCount}
                    isOverdue={row.isOverdue}
                    overdueDate={row.overdueDate}
                    hideCompletionLine={weekKey === 'next'}
                    onClick={() => setSelectedTarget({ weekKey, projectId: row.projectId })}
                  />
                ))}
                {rows.length === 0 && (
                  <Text color="fg.muted" fontSize="sm">אין משימות מתוזמנות לשבוע הזה</Text>
                )}
              </VStack>
            </Box>
          </>
        )}
      </VStack>

      <ProjectTasksDrawer
        open={selectedTarget !== null}
        onClose={() => setSelectedTarget(null)}
        projectName={selectedProject?.name || ''}
        tasks={selectedTarget ? activeWeek?.summary.byProjectTasks.get(selectedTarget.projectId) : []}
        usersById={usersById}
        recurringTaskIds={recurringTaskIds}
      />
    </Box>
  );
};

export default ExpectedVolumeTab;
