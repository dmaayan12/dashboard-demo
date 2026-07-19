import { Drawer, Portal, VStack, HStack, Text, Button, Tooltip } from '@chakra-ui/react';
import { X, Repeat } from 'lucide-react';
import { formatCurrencyDetailed } from '../../utils/financialCalculations';

const resolveAssignees = (assignedUserIds, usersById) => {
  if (!assignedUserIds || assignedUserIds.length === 0) return 'טרם שוייך';
  return assignedUserIds.map((id) => usersById.get(id) || id).join(', ');
};

const ProjectTasksDrawer = ({ open, onClose, projectName, tasks, usersById, recurringTaskIds }) => {
  const sortedTasks = [...(tasks || [])].sort((a, b) => b.hours - a.hours);

  return (
    <Drawer.Root open={open} onOpenChange={(e) => !e.open && onClose()} size="sm" dir="rtl">
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content>
            <Drawer.Header>
              <Drawer.Title>{projectName} — משימות בשבועיים הקרובים</Drawer.Title>
              <Drawer.CloseTrigger asChild>
                <Button size="xs" variant="ghost" p={1} minW="auto"><X size={16} /></Button>
              </Drawer.CloseTrigger>
            </Drawer.Header>
            <Drawer.Body>
              <VStack align="stretch" gap={0}>
                {sortedTasks.map((task) => (
                  <VStack key={task.id} align="stretch" gap={1} borderBottom="1px solid" borderColor="border.subtle" py={2}>
                    <HStack justify="space-between">
                      <HStack gap={1.5} minW={0}>
                        <Text fontSize="sm" fontWeight="bold" noOfLines={2}>{task.name}</Text>
                        {recurringTaskIds?.has(task.id) && (
                          <Tooltip.Root openDelay={200}>
                            <Tooltip.Trigger asChild>
                              <Repeat size={13} style={{ flexShrink: 0 }} />
                            </Tooltip.Trigger>
                            <Tooltip.Positioner>
                              <Tooltip.Content>משימה חוזרת</Tooltip.Content>
                            </Tooltip.Positioner>
                          </Tooltip.Root>
                        )}
                      </HStack>
                      <Text fontSize="sm" fontWeight="bold" flexShrink={0}>{Math.round(task.hours)} שעות</Text>
                    </HStack>
                    <HStack justify="space-between">
                      <Text fontSize="xs" color="fg.muted">{resolveAssignees(task.assignedUserIds, usersById)}</Text>
                      <Text fontSize="xs" color="fg.muted">{formatCurrencyDetailed(task.money)}</Text>
                    </HStack>
                    {task.isOverrun && (
                      <Text fontSize="xs" color="orange.600">
                        ⚠ חרג מהתכנון - {Math.round(task.loggedHours)} מתוך {Math.round(task.expectedHours)} שעות; תחזית להמשך: כ-{Math.round(task.hours)} שעות
                      </Text>
                    )}
                  </VStack>
                ))}
                {sortedTasks.length === 0 && (
                  <Text color="fg.muted" fontSize="sm">אין משימות מתוזמנות לשבועיים הקרובים</Text>
                )}
              </VStack>
            </Drawer.Body>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
};

export default ProjectTasksDrawer;
