import { useState, useMemo } from 'react';
import { Box, VStack, HStack, Text, Alert, Heading, Button, IconButton } from '@chakra-ui/react';
import { Gauge, RefreshCw, ChevronRight, ChevronLeft } from 'lucide-react';
import { useWorkloadData } from '../../hooks/useWorkloadData';
import { useAttendanceOverrides } from '../../hooks/useAttendanceOverrides';
import { calculateEmployeeMonthlyLoad, getRecentMonthKeys, UNKNOWN_LOGGER_KEY } from '../../utils/workloadCalculations';
import { formatMonthKey } from '../../utils/dateUtils';
import LoadCircle from './LoadCircle';
import AttendanceEditPopover from './AttendanceEditPopover';
import EmployeeMonthDrawer from './EmployeeMonthDrawer';
import SplashScreen from '../SplashScreen';

const TAB_BAR_HEIGHT = '41px'; // keep in sync with App.jsx TAB_BAR_HEIGHT

const resolveEmployeeName = (loggerId, usersById) =>
  loggerId === UNKNOWN_LOGGER_KEY ? 'לוגר לא ידוע' : (usersById.get(loggerId) || loggerId);

const EmployeeLoadTab = () => {
  const { actualsItems, planningItems, usersById, loading, error, refetch } = useWorkloadData();
  const { overrides, saveOverride } = useAttendanceOverrides();
  const [drawerTarget, setDrawerTarget] = useState(null); // { loggerId, monthKey } | null
  const [blockOffset, setBlockOffset] = useState(0); // 0 = current 3 months, 1 = the 3 months before that, etc.
  // Direction of the last navigation, purely for the swipe-in animation below (+1 = older
  // months slid in from the right, -1 = newer months slid in from the left - matches RTL).
  const [slideDir, setSlideDir] = useState(1);

  const monthKeys = useMemo(() => {
    const today = new Date();
    const referenceDate = new Date(today.getFullYear(), today.getMonth() - blockOffset * 3, 1);
    return getRecentMonthKeys(3, referenceDate);
  }, [blockOffset]);

  const employeeLoad = useMemo(
    () => calculateEmployeeMonthlyLoad(actualsItems, monthKeys, overrides),
    [actualsItems, monthKeys, overrides]
  );

  const projectNames = useMemo(
    () => new Map((planningItems || []).map((p) => [p.id, p.name])),
    [planningItems]
  );

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

  const employeeIds = [...employeeLoad.keys()].sort((a, b) =>
    resolveEmployeeName(a, usersById).localeCompare(resolveEmployeeName(b, usersById))
  );

  const drawerMonthData = drawerTarget
    ? employeeLoad.get(drawerTarget.loggerId)?.get(drawerTarget.monthKey)
    : null;

  return (
    <Box minH="100vh" bg="white" _dark={{ bg: "#1C1F3B", color: "white" }} p={6}>
      <HStack justify="space-between" mb={6}>
        <HStack gap={3}>
          <Gauge size={28} />
          <VStack align="start" gap={0}>
            <Heading size="xl">עומס עובדים</Heading>
            <Text color="fg.muted" fontSize="sm">אחוז עומס חודשי לפי שעות עבודה בפועל מול ימי עבודה זמינים</Text>
          </VStack>
        </HStack>
        <Button onClick={refetch} disabled={loading} size="sm" variant="outline">
          <RefreshCw size={14} />
          {loading ? 'מרענן...' : 'רענן'}
        </Button>
      </HStack>

      <VStack
        key={blockOffset}
        align="stretch"
        gap={0}
        maxW="700px"
        className="employee-load-block"
        style={{ '--swipe-offset': `${slideDir * 70}px` }}
      >
        <HStack gap={0} borderBottom="2px solid" borderColor="border.emphasized" bg="gray.50" _dark={{ bg: "#292F4C" }}>
          <Box minW="200px" maxW="200px" p={2} borderEnd="2px solid" borderColor="border.emphasized" />
          <IconButton
            size="xs"
            variant="ghost"
            aria-label="חודשים קודמים"
            onClick={() => { setSlideDir(1); setBlockOffset((v) => v + 1); }}
          >
            <ChevronLeft size={14} />
          </IconButton>
          {monthKeys.map((monthKey) => (
            <Box key={monthKey} minW="140px" p={2} textAlign="center" borderEnd="1px solid" borderColor="border.subtle">
              <Text fontSize="xs" fontWeight="bold">{formatMonthKey(monthKey)}</Text>
            </Box>
          ))}
          <IconButton
            size="xs"
            variant="ghost"
            aria-label="חודשים אחרונים"
            onClick={() => { setSlideDir(-1); setBlockOffset((v) => Math.max(0, v - 1)); }}
            disabled={blockOffset === 0}
          >
            <ChevronRight size={14} />
          </IconButton>
        </HStack>

        {employeeIds.map((loggerId) => (
          <HStack key={loggerId} gap={0} borderBottom="1px solid" borderColor="border.subtle">
            <Box minW="200px" maxW="200px" p={2} borderEnd="2px solid" borderColor="border.emphasized">
              <Text fontSize="sm" fontWeight="bold" noOfLines={1}>{resolveEmployeeName(loggerId, usersById)}</Text>
            </Box>
            {monthKeys.map((monthKey) => {
              const monthData = employeeLoad.get(loggerId)?.get(monthKey);
              return (
                <HStack
                  key={monthKey}
                  minW="140px"
                  justify="center"
                  gap={2}
                  p={2}
                  borderEnd="1px solid"
                  borderColor="border.subtle"
                >
                  <LoadCircle
                    loadPercent={monthData?.loadPercent ?? null}
                    onClick={() => setDrawerTarget({ loggerId, monthKey })}
                  />
                  <AttendanceEditPopover
                    vacationDays={monthData?.vacationDays}
                    sickDays={monthData?.sickDays}
                    onSave={(values) => saveOverride(loggerId, monthKey, values)}
                  />
                </HStack>
              );
            })}
          </HStack>
        ))}

        {employeeIds.length === 0 && (
          <Text color="fg.muted" fontSize="sm" p={4}>אין נתוני עבודה בטווח החודשים המוצג</Text>
        )}
      </VStack>

      <EmployeeMonthDrawer
        open={drawerTarget !== null}
        onClose={() => setDrawerTarget(null)}
        employeeName={drawerTarget ? resolveEmployeeName(drawerTarget.loggerId, usersById) : ''}
        monthLabel={drawerTarget ? formatMonthKey(drawerTarget.monthKey) : ''}
        byProject={drawerMonthData?.byProject}
        projectNames={projectNames}
        actualHours={drawerMonthData?.actualHours}
        workingDays={drawerMonthData?.workingDays}
        vacationDays={drawerMonthData?.vacationDays}
        sickDays={drawerMonthData?.sickDays}
        capacityHours={drawerMonthData?.capacityHours}
      />
    </Box>
  );
};

export default EmployeeLoadTab;
