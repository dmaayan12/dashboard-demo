import { useState, Fragment } from 'react';
import { Box, VStack, HStack, Text, Heading, Table } from '@chakra-ui/react';
import { ChevronDown, ChevronLeft } from 'lucide-react';
import { useWorkloadData } from '../hooks/useWorkloadData';
import {
  calculateAverageTaskDurationByType,
  calculateEmployeeAveragesByTaskType,
  getMostRecentLogDate,
  EXCLUDED_USER_IDS,
} from '../utils/workloadCalculations';
import SplashScreen from './SplashScreen';

const TAB_BAR_HEIGHT = '41px';

// Not real production work - excluded from this whole screen (per the user's explicit request),
// same two types calculateManagementOnlyProjectIds hides projects for in "נפח עבודה צפוי".
const EXCLUDED_TASK_TYPES = ['פרילאנס', 'ניהול'];

// An employee with no logged hours anywhere (any task, any type) in the last 30 days is
// considered inactive for the purposes of this per-employee breakdown - hidden from the
// sub-table but NOT removed from the parent row's own average (see EmployeeBreakdown below).
const STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

// Same green/red language as the hour-bank badge (ProjectRow.jsx's bankColorScheme) - per the
// user's corrected instruction: an employee at-or-below the type's overall average shows green,
// above it shows red.
const employeeRowColorScheme = (avgHours, overallAvgHours) =>
  avgHours <= overallAvgHours
    ? { bg: 'green.50', darkBg: 'green.900/30', text: 'green.700', darkText: 'green.300' }
    : { bg: 'red.50', darkBg: 'red.900/30', text: 'red.700', darkText: 'red.300' };

const EmployeeBreakdown = ({ actualsItems, taskType, usersById, overallAvgHours }) => {
  const now = Date.now();
  const averages = calculateEmployeeAveragesByTaskType(actualsItems, taskType);
  const rows = [...averages.entries()]
    .filter(([userId]) => !EXCLUDED_USER_IDS.includes(userId))
    .filter(([userId]) => {
      const lastLog = getMostRecentLogDate(actualsItems, userId);
      return lastLog && (now - new Date(lastLog).getTime()) <= STALE_THRESHOLD_MS;
    })
    .sort((a, b) => b[1].avgHours - a[1].avgHours);

  return (
    <Box pr={8} py={2} bg="gray.50" _dark={{ bg: 'whiteAlpha.50' }}>
      {rows.length === 0 ? (
        <Text color="fg.muted" fontSize="sm">אין נתוני עובדים פעילים להצגה</Text>
      ) : (
        <Table.Root size="sm" variant="outline">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>עובד</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="start">זמן ממוצע</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map(([userId, { avgHours, taskCount }]) => {
              const scheme = employeeRowColorScheme(avgHours, overallAvgHours);
              return (
                <Table.Row key={userId} bg={scheme.bg} _dark={{ bg: scheme.darkBg }}>
                  <Table.Cell color={scheme.text} _dark={{ color: scheme.darkText }}>{usersById.get(userId) || userId}</Table.Cell>
                  <Table.Cell>
                    <HStack gap={2}>
                      <Text color={scheme.text} _dark={{ color: scheme.darkText }} fontWeight="medium">{avgHours.toFixed(1)} שעות</Text>
                      <Text fontSize="xs" color={scheme.text} _dark={{ color: scheme.darkText }} opacity={0.75}>({taskCount} משימות)</Text>
                    </HStack>
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Root>
      )}
    </Box>
  );
};

// Simple info screen (see PLAN.md) - task type + average real hours per task, based ONLY on
// tasks already "בוצע" (not the overrun-ratio machinery in workloadCalculations.js, which is a
// separate metric with a separate, wider status set) - recomputed live on every load, task types
// discovered dynamically from whatever's actually on the board (never a hardcoded list), so a
// brand-new type starts showing up here automatically with zero code changes. Each row is an
// accordion - clicking it expands a per-employee breakdown of that same average.
const ProjectManagementTab = () => {
  const { actualsItems, usersById, loading, error } = useWorkloadData();
  const [expandedTypes, setExpandedTypes] = useState(new Set());

  if (loading) return <SplashScreen minHeight={`calc(100vh - ${TAB_BAR_HEIGHT})`} />;

  const durations = calculateAverageTaskDurationByType(actualsItems);
  const rows = [...durations.entries()]
    .filter(([taskType]) => !EXCLUDED_TASK_TYPES.includes(taskType))
    .sort((a, b) => b[1].avgHours - a[1].avgHours);

  const toggleType = (taskType) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(taskType)) next.delete(taskType);
      else next.add(taskType);
      return next;
    });
  };

  return (
    <Box minH="100vh" bg="white" _dark={{ bg: "#1C1F3B", color: "white" }} p={6}>
      <VStack align="start" gap={0} mb={6}>
        <Heading size="xl">ניהול פרויקט</Heading>
        <Text color="fg.muted" fontSize="sm">זמן ממוצע למשימה, לפי סוג משימה (מבוסס על משימות שכבר "בוצע" בלבד)</Text>
      </VStack>

      {error && <Text color="red.500" fontSize="sm" mb={4}>{error}</Text>}

      <Box maxW="480px">
        <Table.Root size="sm" variant="outline">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>סוג משימה</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="start">זמן ממוצע</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map(([taskType, { avgHours, sampleCount }]) => {
              const isExpanded = expandedTypes.has(taskType);
              return (
                <Fragment key={taskType}>
                  <Table.Row cursor="pointer" onClick={() => toggleType(taskType)}>
                    <Table.Cell fontWeight="medium">
                      <HStack gap={1.5}>
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronLeft size={14} />}
                        <Text>{taskType}</Text>
                      </HStack>
                    </Table.Cell>
                    <Table.Cell>
                      <HStack gap={2}>
                        <Text>{avgHours.toFixed(1)} שעות</Text>
                        <Text fontSize="xs" color="fg.muted">({sampleCount} משימות)</Text>
                      </HStack>
                    </Table.Cell>
                  </Table.Row>
                  {isExpanded && (
                    <Table.Row>
                      <Table.Cell colSpan={2} p={0}>
                        <EmployeeBreakdown actualsItems={actualsItems} taskType={taskType} usersById={usersById} overallAvgHours={avgHours} />
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <Table.Row>
                <Table.Cell colSpan={2}>
                  <Text color="fg.muted" fontSize="sm">אין עדיין משימות שהושלמו כדי לחשב ממוצע</Text>
                </Table.Cell>
              </Table.Row>
            )}
          </Table.Body>
        </Table.Root>
      </Box>
    </Box>
  );
};

export default ProjectManagementTab;
