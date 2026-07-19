import { useRef, useEffect, useState, useCallback } from 'react';
import { Box, VStack, HStack, Text, Alert, Heading, Circle, Button, useTabsContext } from '@chakra-ui/react';
import { DollarSign, TrendingUp, Check, RefreshCw, AlertCircle, HelpCircle } from 'lucide-react';
import { useDashboardData } from '../hooks/useDashboardData';
import { usePaymentPolicies } from '../hooks/usePaymentPolicies';
import { useProjectMonthHistory } from '../hooks/useProjectMonthHistory';
import { useProjectScheduleHistory } from '../hooks/useProjectScheduleHistory';
import { useTaskStatusHistory } from '../hooks/useTaskStatusHistory';
import ProjectRow from './ProjectRow';
import TotalsRow from './TotalsRow';
import PaymentPolicyDialog from './PaymentPolicyDialog';
import HelpDialog from './HelpDialog';
import SplashScreen from './SplashScreen';

const TAB_BAR_HEIGHT = '41px'; // keep in sync with App.jsx TAB_BAR_HEIGHT

// --- Legend Component ---
const DashboardLegend = () => (
  <HStack gap={6} bg="white" _dark={{ bg: "#292F4C", borderColor: "whiteAlpha.200" }} p={3} borderRadius="lg" shadow="sm" border="1px solid" borderColor="border.subtle">
    {/* Target */}
    <HStack gap={2}>
      <Circle size="16px" bg="blue.400" opacity={0.3} />
      <Text fontSize="xs" fontWeight="medium" color="fg.muted">יעד</Text>
    </HStack>

    {/* Actual */}
    <HStack gap={2}>
      <Circle size="16px" bg="green.500" />
      <Text fontSize="xs" fontWeight="medium" color="fg.muted">בפועל</Text>
    </HStack>

    {/* Debt */}
    <HStack gap={2}>
      <Circle size="16px" border="1.5px dashed" borderColor="orange.500" bg="transparent" />
      <Text fontSize="xs" fontWeight="medium" color="fg.muted">חוב</Text>
    </HStack>

    {/* Fully Credited / Completed */}
    <HStack gap={2}>
      <Circle size="16px" border="1.5px solid" borderColor="green.500" bg="transparent" display="flex" alignItems="center" justifyContent="center">
        <Check size={10} strokeWidth={3} color="var(--chakra-colors-green-500)" />
      </Circle>
      <Text fontSize="xs" fontWeight="medium" color="fg.muted">הושלם</Text>
    </HStack>

    {/* Extension */}
    <HStack gap={2}>
      <Circle size="16px" border="1.5px dashed" borderColor="gray.400" _dark={{ borderColor: "gray.600" }} bg="transparent" />
      <Text fontSize="xs" fontWeight="medium" color="fg.muted">הרחבה</Text>
    </HStack>

    {/* Cancelled */}
    <HStack gap={2}>
      <Box w="16px" h="16px" bg="gray.200" _dark={{ bg: "gray.600" }} borderRadius="sm" opacity={0.6} />
      <Text fontSize="xs" fontWeight="medium" color="fg.muted">בוטל</Text>
    </HStack>
  </HStack>
);
// ------------------------

// Groups projects by tracking type (payment-policy/milestones vs. regular money tracking) so
// they're easy to scan together instead of interleaved. position="sticky" left={0} w="100vw"
// on the outer box keeps it pinned during horizontal scroll (same pattern as the new-project
// banner above); the 250px spacer inside keeps the colored label bar from covering the
// project-list column, which sits at that same fixed width everywhere else in this file.
const ProjectSectionHeader = ({ label }) => (
  <Box position="sticky" left={0} w="100vw" display="flex" flexShrink={0}>
    <Box minW="250px" maxW="250px" flexShrink={0} borderBottom="1px solid" borderColor="border.subtle" />
    <Box
      flex={1}
      bg="gray.50"
      _dark={{ bg: "whiteAlpha.50", borderColor: "whiteAlpha.200" }}
      borderBottom="1px solid"
      borderColor="border.subtle"
      px={6}
      py={2}
    >
      <Text fontSize="xs" fontWeight="bold" color="fg.muted" dir="rtl">{label}</Text>
    </Box>
  </Box>
);

const FinancialTab = ({ onReady }) => {
  const { policies, loading: policiesLoading, savePolicy } = usePaymentPolicies();
  const { history, loading: historyLoading, recordHistory } = useProjectMonthHistory();
  const { lastChanges: lastScheduleChanges, loading: scheduleHistoryLoading } = useProjectScheduleHistory();
  const { taskDoneDates, loading: taskStatusLoading } = useTaskStatusHistory();
  // See useDashboardData.js's own comment on upstreamInputsLoading - must stay true until every
  // one of these has resolved at least once, or a freeze-write can permanently lock a value
  // computed from incomplete inputs (e.g. policies still {} on the very first render).
  const upstreamInputsLoading = policiesLoading || historyLoading || scheduleHistoryLoading || taskStatusLoading;
  const { projects, monthColumns, totals, loading, error, refetch } = useDashboardData(policies, history, recordHistory, lastScheduleChanges, taskDoneDates, upstreamInputsLoading);
  const [editingProject, setEditingProject] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const currentMonthRef = useRef(null);
  const scrollPaneRef = useRef(null);
  const mainHeaderRef = useRef(null); // measures "1. Main Dashboard Header", now frozen (sticky)
  const bannerRef = useRef(null); // measures the new-project banner, when rendered (also frozen)
  const monthHeaderRef = useRef(null); // measures "2. Sticky Month Headers Row" so the vertical
  // scrollbar (below) can start right underneath it instead of overlapping the header area.
  const dragStateRef = useRef(null); // { startX, startScrollLeft } while dragging the custom bar
  const tabsApi = useTabsContext();
  const isActiveTab = tabsApi.value === 'financial';

  // Notifies App.jsx once the very first load finishes, so it can dismiss the splash screen.
  // Must wait for taskStatusLoading/scheduleHistoryLoading too, not just the main dashboard
  // fetch - both re-scan monday's real activity logs on every mount and take a few real seconds
  // (see useTaskStatusHistory.js/useProjectScheduleHistory.js), and both feed numbers that
  // useDashboardData depends on (taskDoneDates affects completion-status resolution, which
  // affects debt/credit). Without waiting for them, the dashboard briefly rendered with empty
  // taskDoneDates - showing debt instead of credit, for example - then "corrected itself" a few
  // seconds later once the real data landed (found live, not from reading code - a project's
  // month circle would flash a debt ring that flipped to credit moments after every load).
  useEffect(() => {
    if (!loading && !policiesLoading && !taskStatusLoading && !scheduleHistoryLoading) onReady?.();
  }, [loading, policiesLoading, taskStatusLoading, scheduleHistoryLoading, onReady]);

  // Custom drag bar: mirrors scrollPaneRef's horizontal scroll state. Built as a plain,
  // fully custom element (not a native scrollbar) because native OS scrollbars proved
  // unreliable to grab with a plain mouse on this RTL-document setup.
  const [scrollMetrics, setScrollMetrics] = useState({
    scrollLeft: 0, scrollWidth: 1, clientWidth: 1,
    scrollTop: 0, scrollHeight: 1, clientHeight: 1,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isVDragging, setIsVDragging] = useState(false);
  const [mainHeaderHeight, setMainHeaderHeight] = useState(0);
  const [bannerHeight, setBannerHeight] = useState(0);
  const [monthHeaderHeight, setMonthHeaderHeight] = useState(0);
  const vDragStateRef = useRef(null); // { startY, startScrollTop } while dragging the vertical bar

  const readScrollMetrics = useCallback(() => {
    const el = scrollPaneRef.current;
    if (!el) return;
    setScrollMetrics({
      scrollLeft: el.scrollLeft, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
      scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
    });
    if (mainHeaderRef.current) setMainHeaderHeight(mainHeaderRef.current.offsetHeight);
    setBannerHeight(bannerRef.current ? bannerRef.current.offsetHeight : 0);
    if (monthHeaderRef.current) setMonthHeaderHeight(monthHeaderRef.current.offsetHeight);
  }, []);

  useEffect(() => {
    readScrollMetrics();
  }, [loading, monthColumns, readScrollMetrics]);

  const handleThumbPointerDown = (e) => {
    e.preventDefault();
    dragStateRef.current = { startX: e.clientX, startScrollLeft: scrollPaneRef.current.scrollLeft };
    setIsDragging(true);
    window.addEventListener('pointermove', handleThumbPointerMove);
    window.addEventListener('pointerup', handleThumbPointerUp);
  };

  const handleThumbPointerMove = (e) => {
    const el = scrollPaneRef.current;
    const drag = dragStateRef.current;
    if (!el || !drag) return;
    const trackWidth = el.clientWidth;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const thumbWidth = Math.max(30, (el.clientWidth / el.scrollWidth) * trackWidth);
    const availableTrack = trackWidth - thumbWidth;
    if (availableTrack <= 0 || maxScroll <= 0) return;
    const deltaScreen = e.clientX - drag.startX;
    const deltaScroll = (deltaScreen / availableTrack) * maxScroll;
    el.scrollLeft = Math.min(maxScroll, Math.max(0, drag.startScrollLeft + deltaScroll));
    readScrollMetrics();
  };

  const handleThumbPointerUp = () => {
    dragStateRef.current = null;
    setIsDragging(false);
    window.removeEventListener('pointermove', handleThumbPointerMove);
    window.removeEventListener('pointerup', handleThumbPointerUp);
  };

  // Vertical counterpart of the drag bar above - needed because a plain laptop touchpad with no
  // scroll-wheel/gesture support has no other way to reach project rows below the fold, now that
  // the native scrollbar is hidden (see .financial-scroll-pane in index.css).
  const handleVThumbPointerDown = (e) => {
    e.preventDefault();
    vDragStateRef.current = { startY: e.clientY, startScrollTop: scrollPaneRef.current.scrollTop };
    setIsVDragging(true);
    window.addEventListener('pointermove', handleVThumbPointerMove);
    window.addEventListener('pointerup', handleVThumbPointerUp);
  };

  const handleVThumbPointerMove = (e) => {
    const el = scrollPaneRef.current;
    const drag = vDragStateRef.current;
    if (!el || !drag) return;
    const trackHeight = el.clientHeight;
    const maxScroll = el.scrollHeight - el.clientHeight;
    const thumbHeight = Math.max(30, (el.clientHeight / el.scrollHeight) * trackHeight);
    const availableTrack = trackHeight - thumbHeight;
    if (availableTrack <= 0 || maxScroll <= 0) return;
    const deltaScreen = e.clientY - drag.startY;
    const deltaScroll = (deltaScreen / availableTrack) * maxScroll;
    el.scrollTop = Math.min(maxScroll, Math.max(0, drag.startScrollTop + deltaScroll));
    readScrollMetrics();
  };

  const handleVThumbPointerUp = () => {
    vDragStateRef.current = null;
    setIsVDragging(false);
    window.removeEventListener('pointermove', handleVThumbPointerMove);
    window.removeEventListener('pointerup', handleVThumbPointerUp);
  };

  // Calculate current month key in 'YYYY-MM' format
  const currentDate = new Date();
  const currentMonthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

  // Scroll to current month when loading completes, and again every time this tab becomes active
  useEffect(() => {
    if (!loading && monthColumns.length > 0 && isActiveTab && currentMonthRef.current) {
      // Use setTimeout to ensure the DOM has fully painted the wide layout
      setTimeout(() => {
        currentMonthRef.current.scrollIntoView({
          behavior: 'smooth',
          inline: 'center', // Centers the month horizontally
          block: 'nearest'
        });
        readScrollMetrics();
      }, 500);
    }
  }, [loading, monthColumns, isActiveTab, readScrollMetrics]);

  if (loading || policiesLoading || taskStatusLoading || scheduleHistoryLoading) {
    return <SplashScreen minHeight={`calc(100vh - ${TAB_BAR_HEIGHT})`} />;
  }

  if (error) {
    return (
      <Box p={6} dir="rtl">
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Title>טעינת לוח הבקרה נכשלה</Alert.Title>
          <Alert.Description>{error}</Alert.Description>
        </Alert.Root>
      </Box>
    );
  }

  if (projects.length === 0) {
    return (
      <Box p={6} dir="rtl">
        <VStack gap={4} py={12} color="fg.muted">
          <DollarSign size={48} />
          <Heading size="lg">לא נמצאו פרויקטים</Heading>
          <Text>הוסיפו פרויקטים עם ציר זמן בייסליין ודינמי כדי לראות את לוח הבקרה הפיננסי.</Text>
        </VStack>
      </Box>
    );
  }

  const projectsNeedingReview = projects.filter((p) => !policies[p.id]?.reviewed);
  // Third section (see PLAN.md's 2026-07-16 round) - a milestone project whose agreed work is
  // fully delivered and only ad-hoc hour-bank usage remains gets pulled out of the regular
  // milestone-projects list into its own group, so it doesn't sit mixed in among projects still
  // actively being delivered.
  const milestoneProjects = projects.filter((p) => p.hasMilestones && !p.isHourBankOnlyState);
  const hourBankOnlyProjects = projects.filter((p) => p.hasMilestones && p.isHourBankOnlyState);
  const regularProjects = projects.filter((p) => !p.hasMilestones);

  // Custom drag-bar geometry (see handleThumbPointerDown/Move above for the drag math)
  const thumbWidthPercent = Math.min(100, (scrollMetrics.clientWidth / scrollMetrics.scrollWidth) * 100);
  const maxScroll = Math.max(1, scrollMetrics.scrollWidth - scrollMetrics.clientWidth);
  const thumbLeftPercent = (scrollMetrics.scrollLeft / maxScroll) * (100 - thumbWidthPercent);

  // Vertical drag-bar geometry (see handleVThumbPointerDown/Move above for the drag math)
  const thumbHeightPercent = Math.min(100, (scrollMetrics.clientHeight / scrollMetrics.scrollHeight) * 100);
  const maxVScroll = Math.max(1, scrollMetrics.scrollHeight - scrollMetrics.clientHeight);
  const thumbTopPercent = (scrollMetrics.scrollTop / maxVScroll) * (100 - thumbHeightPercent);
  const showVScrollbar = scrollMetrics.scrollHeight > scrollMetrics.clientHeight + 1;

  return (
    <Box h={`calc(100vh - ${TAB_BAR_HEIGHT})`} minW="100%" overflow="hidden" bg="white" _dark={{ bg: "#1C1F3B", color: "white" }} position="relative">
      {/* Single scroll pane: dir="ltr" so native drag/wheel scrolling behaves normally,
          and it owns both axes together so position:sticky descendants stay pinned to it. */}
      <Box
        ref={scrollPaneRef}
        onScroll={readScrollMetrics}
        className="financial-scroll-pane"
        dir="ltr"
        overflow="auto"
        h="100%"
        w="100%"
        display="flex"
        flexDirection="column"
        alignItems="flex-start"
      >
        {/* 1. Main Dashboard Header - Tightened Padding. Frozen (sticky top=0) per user request -
            it used to scroll away with the rest of the content; now it, the banner below it (if
            shown), and the month-headers row all stay pinned together while only the project
            rows scroll underneath. */}
        <Box
          ref={mainHeaderRef}
          bg="white"
          _dark={{ bg: "#292F4C", borderColor: "whiteAlpha.200" }}
          borderBottom="1px solid"
          borderColor="border"
          pt={4}
          pb={4}
          px={6}
          position="sticky"
          top={0}
          left={0}
          zIndex={50}
          w="100vw"
          flexShrink={0}
        >
          <HStack w="100%" justifyContent="space-between" alignItems="center" dir="rtl">
            {/* Title */}
            <HStack gap={3}>
              <TrendingUp size={28} />
              <VStack align="start" gap={0}>
                <Heading size="xl">לוח בקרה פיננסי – באקלוג</Heading>
              </VStack>
            </HStack>

            {/* Legend & Refresh */}
            <HStack gap={4}>
              <DashboardLegend />
              <Button
                onClick={() => setHelpOpen(true)}
                size="sm"
                variant="outline"
                bg="white"
                _dark={{ bg: "#292F4C", borderColor: "whiteAlpha.200", color: "white" }}
              >
                <HelpCircle size={14} />
                הסבר
              </Button>
              <Button
                onClick={refetch}
                disabled={loading}
                size="sm"
                variant="outline"
                bg="white"
                _dark={{ bg: "#292F4C", borderColor: "whiteAlpha.200", color: "white" }}
              >
                <RefreshCw size={14} className={loading ? "spin" : ""} />
                {loading ? 'מרענן...' : 'רענן'}
              </Button>
            </HStack>
          </HStack>
        </Box>

        {/* New-project banner - non-blocking, invites setting up a payment policy. Also frozen,
            stacked right below the main header (top uses its measured height) so it doesn't
            overlap it once both are pinned. */}
        {projectsNeedingReview.length > 0 && (
          <Box ref={bannerRef} position="sticky" top={`${mainHeaderHeight}px`} zIndex={49} left={0} w="100vw" flexShrink={0}>
            <Alert.Root status="info" dir="rtl">
              <Alert.Indicator><AlertCircle size={16} /></Alert.Indicator>
              <Alert.Title fontSize="sm">
                {projectsNeedingReview.length === 1
                  ? `לפרויקט "${projectsNeedingReview[0].name}" אין מדיניות תשלום מוגדרת עדיין`
                  : `יש ${projectsNeedingReview.length} פרויקטים בלי מדיניות תשלום מוגדרת`}
              </Alert.Title>
              <Button size="xs" variant="outline" onClick={() => setEditingProject(projectsNeedingReview[0])}>
                הגדר עכשיו
              </Button>
            </Alert.Root>
          </Box>
        )}

        {/* 2. Sticky Month Headers Row - stacks right below the frozen header/banner above it. */}
        <Box
          ref={monthHeaderRef}
          position="sticky"
          top={`${mainHeaderHeight + bannerHeight}px`}
          zIndex={40}
          bg="gray.50"
          _dark={{ bg: "#292F4C", borderColor: "whiteAlpha.200" }}
          borderBottom="2px solid"
          borderColor="border.emphasized"
          display="flex"
          flexDirection="column"
          shadow="md"
        >
          <Box display="flex">
            {/* Top-Left Corner Cell (Sticky in both directions) */}
            <Box
              position="sticky"
              left={0}
              zIndex={45}
              bg="gray.50"
              _dark={{ bg: "#292F4C", borderColor: "whiteAlpha.200" }}
              borderRight="2px solid"
              borderColor="border.emphasized"
              minW="250px"
              maxW="250px"
              p={3}
              display="flex"
              alignItems="center"
              dir="rtl"
            >
              <Text fontWeight="bold" fontSize="sm" color="fg.muted">
                רשימת פרויקטים
              </Text>
            </Box>

            {/* Months List */}
            <HStack gap={0} flex={1}>
              {monthColumns.map((month) => {
                const isCurrentMonth = month.key === currentMonthKey;

                return (
                  <Box
                    key={month.key}
                    ref={isCurrentMonth ? currentMonthRef : null}
                    minW="100px"
                    p={3}
                    textAlign="center"
                    borderRight="1px solid"
                    borderColor="border.subtle"
                    bg={isCurrentMonth ? 'yellow.50' : 'transparent'}
                    _dark={{ bg: isCurrentMonth ? 'yellow.900/30' : 'transparent' }}
                  >
                    <Text
                      fontSize="xs"
                      fontWeight="bold"
                      whiteSpace="nowrap"
                      color={isCurrentMonth ? 'yellow.700' : 'inherit'}
                      _dark={{ color: isCurrentMonth ? 'yellow.300' : 'inherit' }}
                    >
                      {month.label}
                    </Text>
                  </Box>
                );
              })}
            </HStack>
          </Box>

          {/* Custom horizontal drag bar - sits right under the month labels, always visible while
              scrolling vertically (part of this sticky-top section). position="sticky" left={0}
              w="100vw" keeps it pinned to the viewport horizontally too (same pattern as the main
              header above), otherwise it would scroll away sideways along with the wide content.
              Plain DOM drag (not a native scrollbar), since native OS scrollbars proved unreliable
              to grab with a plain mouse on this RTL-document setup. */}
          <Box display="flex" px={2} pb={2} position="sticky" left={0} w="100vw">
            <Box minW="250px" maxW="250px" flexShrink={0} />
            <Box
              data-testid="financial-drag-track"
              dir="ltr"
              position="relative"
              flex={1}
              h="10px"
              bg="blackAlpha.100"
              _dark={{ bg: "whiteAlpha.200" }}
              borderRadius="full"
            >
              <Box
                data-testid="financial-drag-thumb"
                position="absolute"
                top={0}
                bottom={0}
                left={`${thumbLeftPercent}%`}
                w={`${thumbWidthPercent}%`}
                minW="40px"
                bg={isDragging ? "blue.500" : "gray.400"}
                _dark={{ bg: isDragging ? "blue.400" : "whiteAlpha.500" }}
                borderRadius="full"
                cursor="grab"
                _active={{ cursor: "grabbing" }}
                onPointerDown={handleThumbPointerDown}
              />
            </Box>
          </Box>
        </Box>

        {/* 3. Scrollable Project Rows Container - Flex 1 to push footer down.
            pb=140px reserves room for the now-fixed TotalsRow below (140px tall, 4 rows),
            so the last project row doesn't end up hidden behind it. */}
        <Box flex="1" overflow="visible" pb="140px">
          {milestoneProjects.length > 0 && (
            <ProjectSectionHeader label="פרויקטים עם מדיניות תשלום" />
          )}
          {milestoneProjects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              monthColumns={monthColumns}
              currentMonthKey={currentMonthKey}
              onEditPolicy={setEditingProject}
            />
          ))}
          {hourBankOnlyProjects.length > 0 && (
            <ProjectSectionHeader label="פרויקטים במעקב בנק שעות" />
          )}
          {hourBankOnlyProjects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              monthColumns={monthColumns}
              currentMonthKey={currentMonthKey}
              onEditPolicy={setEditingProject}
            />
          ))}
          {regularProjects.length > 0 && (
            <ProjectSectionHeader label="פרויקטים לפי מעקב שעות" />
          )}
          {regularProjects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              monthColumns={monthColumns}
              currentMonthKey={currentMonthKey}
              onEditPolicy={setEditingProject}
            />
          ))}
        </Box>
      </Box>

      {/* Custom vertical drag bar - a plain touchpad with no scroll-wheel/gesture support has no
          other way to reach project rows below the fold, now that the native scrollbar is hidden
          (see .financial-scroll-pane in index.css). Positioned absolute within this outer,
          already-relative Box (which exactly spans calc(100vh - TAB_BAR_HEIGHT)). top sums the
          real measured heights of the frozen header + banner + month-headers row (all now sticky
          and always visible together, per the stacking above) so the bar only runs alongside the
          project-rows area - not overlapping the frozen area above it - and bottom="140px" stops
          it exactly above the fixed TotalsRow. Only rendered when there's actually something to
          scroll. */}
      {showVScrollbar && (
        <Box
          position="absolute"
          top={`${mainHeaderHeight + bannerHeight + monthHeaderHeight}px`}
          bottom="140px"
          right="2px"
          w="6px"
          bg="blackAlpha.100"
          _dark={{ bg: "whiteAlpha.200" }}
          borderRadius="full"
          zIndex={90}
        >
          <Box
            position="absolute"
            left={0}
            right={0}
            top={`${thumbTopPercent}%`}
            h={`${thumbHeightPercent}%`}
            minH="30px"
            bg={isVDragging ? "blue.500" : "gray.400"}
            _dark={{ bg: isVDragging ? "blue.400" : "whiteAlpha.500" }}
            borderRadius="full"
            cursor="grab"
            _active={{ cursor: "grabbing" }}
            onPointerDown={handleVThumbPointerDown}
          />
        </Box>
      )}

      {/* 4. Totals Footer - fixed to the viewport bottom (see TotalsRow.jsx), always visible
          without scrolling, kept in horizontal sync via scrollMetrics.scrollLeft. */}
      <TotalsRow
        monthColumns={monthColumns}
        totals={totals}
        currentMonthKey={currentMonthKey}
        scrollLeft={scrollMetrics.scrollLeft}
      />

      {editingProject && (
        <PaymentPolicyDialog
          open={!!editingProject}
          onClose={() => setEditingProject(null)}
          projectName={editingProject.name}
          totalValue={editingProject.totalValue}
          milestones={editingProject.milestones}
          initialHourBankSize={policies[editingProject.id]?.hourBankSize}
          dynamicStart={editingProject.dynamicStart}
          dynamicEnd={editingProject.dynamicEnd}
          lastActiveDate={editingProject.lastActiveDate}
          onSave={({ milestones, hourBankSize }) => savePolicy(editingProject.id, { milestones, hourBankSize })}
        />
      )}

      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </Box>
  );
};

export default FinancialTab;
