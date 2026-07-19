import { useState } from 'react';
import { Drawer, Portal, VStack, HStack, Box, Text, Button, Separator } from '@chakra-ui/react';
import { X } from 'lucide-react';
import { UNLINKED_PROJECT_KEY, FULL_DAY_HOURS } from '../../utils/workloadCalculations';

const SummaryRow = ({ label, value }) => (
  <HStack justify="space-between">
    <Text fontSize="sm" color="fg.muted">{label}</Text>
    <Text fontSize="sm" fontWeight="bold">{value}</Text>
  </HStack>
);

const EmployeeMonthDrawer = ({
  open,
  onClose,
  employeeName,
  monthLabel,
  byProject,
  projectNames,
  actualHours,
  workingDays,
  vacationDays,
  sickDays,
  capacityHours,
}) => {
  const [expandedProjectId, setExpandedProjectId] = useState(null);

  const projectRows = [...(byProject?.entries() || [])]
    .map(([projectId, byTask]) => ({
      projectId,
      hours: [...byTask.values()].reduce((sum, t) => sum + t.hours, 0),
      tasks: [...byTask.values()].sort((a, b) => b.hours - a.hours),
    }))
    .sort((a, b) => b.hours - a.hours);

  return (
    <Drawer.Root open={open} onOpenChange={(e) => !e.open && onClose()} size="sm" dir="rtl">
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content>
            <Drawer.Header>
              <Drawer.Title>{employeeName} — {monthLabel}</Drawer.Title>
              <Drawer.CloseTrigger asChild>
                <Button size="xs" variant="ghost" p={1} minW="auto"><X size={16} /></Button>
              </Drawer.CloseTrigger>
            </Drawer.Header>
            <Drawer.Body>
              <VStack align="stretch" gap={2} mb={4}>
                <SummaryRow label="תקן השעות החודשי" value={`${Math.round(capacityHours || 0)} שעות`} />
                <SummaryRow label="סה״כ שעות בפועל" value={`${Math.round((actualHours || 0) * 10) / 10} שעות`} />
                <SummaryRow label="ימי חופשה שהוזנו" value={vacationDays || 0} />
                <SummaryRow label="ימי מחלה שהוזנו" value={sickDays || 0} />
                <Text fontSize="xs" fontWeight="bold" color="fg.muted" pt={1}>
                  תקן השעות מחושב לפי {FULL_DAY_HOURS} שעות עבודה ליום, כפול ימי העבודה בחודש ({workingDays}), בניכוי ימי החופשה והמחלה שהוזנו.
                </Text>
              </VStack>
              <Separator mb={4} />
              <VStack align="stretch" gap={0}>
                {projectRows.map(({ projectId, hours, tasks }) => (
                  <Box key={projectId} borderBottom="1px solid" borderColor="border.subtle" py={2}>
                    <HStack
                      justify="space-between"
                      cursor="pointer"
                      onClick={() => setExpandedProjectId(expandedProjectId === projectId ? null : projectId)}
                    >
                      <Text fontSize="sm" fontWeight="bold">
                        {projectId === UNLINKED_PROJECT_KEY ? 'ללא פרויקט מקושר' : (projectNames.get(projectId) || projectId)}
                      </Text>
                      <Text fontSize="sm">{Math.round(hours)} שעות</Text>
                    </HStack>
                    {expandedProjectId === projectId && (
                      <VStack align="stretch" gap={1} mt={2} ps={4}>
                        {tasks.map((t, i) => (
                          <HStack key={i} justify="space-between">
                            <Text fontSize="xs" color="fg.muted">{t.name}</Text>
                            <Text fontSize="xs" color="fg.muted">{Math.round(t.hours * 10) / 10} שעות</Text>
                          </HStack>
                        ))}
                      </VStack>
                    )}
                  </Box>
                ))}
                {projectRows.length === 0 && (
                  <Text color="fg.muted" fontSize="sm">אין נתונים לחודש זה</Text>
                )}
              </VStack>
            </Drawer.Body>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
};

export default EmployeeMonthDrawer;
