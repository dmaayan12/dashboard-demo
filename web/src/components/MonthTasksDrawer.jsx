import { Drawer, Portal, VStack, HStack, Text, Button, Separator } from '@chakra-ui/react';
import { X } from 'lucide-react';
import { formatCurrencyDetailed } from '../utils/financialCalculations';
import { FREELANCE_TASK_TYPE } from '../utils/paymentPolicyCalculations';

/**
 * Opened via double-click on a month cell (see MonthCell.jsx) - shows exactly which tasks had
 * hours logged in that specific month, for that specific project, so the tooltip's aggregate
 * numbers (cost, revenue, profit) can be traced back to individual tasks. Modeled after
 * workload/ProjectTasksDrawer.jsx's structure.
 *
 * Per-task "נפח עבודה" (work-volume) is shown for every project, not just milestone ones - the
 * weighting formula (expectedHours × hourlyRate, normalized against totalValue) is generic and
 * doesn't depend on payment-policy status.
 */
const buildMonthTasks = (project, monthKey) => {
  const monthStart = new Date(`${monthKey}-01`);
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);

  const relatedActuals = project.relatedActuals || [];

  // Same weighting as calculateMonthlyRevenueFromActualHours - needed to reproduce each
  // task's own share of totalValue here, per-task. Freelance tasks are excluded from the weight
  // pool entirely (round 2026-07-16, see PLAN.md) - money paid to an external supplier is cost,
  // never revenue/profit for the studio.
  let totalWeight = 0;
  relatedActuals.forEach((task) => {
    if (task.taskType === FREELANCE_TASK_TYPE) return;
    totalWeight += (task.expectedHours || 0) * (task.hourlyRate || 0);
  });

  const tasks = [];
  relatedActuals.forEach((task) => {
    let hoursThisMonth = 0;
    (task.history || []).forEach((h) => {
      if (!h.durationInSeconds || !h.startDate) return;
      const d = new Date(h.startDate);
      if (d >= monthStart && d < monthEnd) hoursThisMonth += h.durationInSeconds / 3600;
    });
    if (hoursThisMonth === 0) return;

    const cost = hoursThisMonth * (task.hourlyRate || 0);
    let revenue = null;
    if (task.taskType !== FREELANCE_TASK_TYPE && totalWeight > 0 && task.expectedHours) {
      const taskWeight = task.expectedHours * (task.hourlyRate || 0);
      const taskValue = (taskWeight / totalWeight) * project.totalValue;
      revenue = taskValue * (hoursThisMonth / task.expectedHours);
    }

    tasks.push({
      id: task.id,
      name: task.name,
      hours: hoursThisMonth,
      expectedHours: task.expectedHours || 0,
      cost,
      revenue,
      profit: revenue != null ? revenue - cost : null,
    });
  });

  return tasks.sort((a, b) => b.cost - a.cost);
};

const MonthTasksDrawer = ({ open, onClose, project, monthKey, monthLabel, monthRevenue }) => {
  const tasks = open ? buildMonthTasks(project, monthKey) : [];

  // The summary's "נפח עבודה" is NOT the sum of the per-task figures above (those are a
  // separate, real/actual-hours-based lens) - it's the SAME value shown as the tooltip's main
  // "נפח עבודה" row for this month (the smooth schedule-based one), so that "רווח" here always
  // equals the tooltip's own "רווח" exactly.
  const totalCost = tasks.reduce((sum, t) => sum + t.cost, 0);
  const totalHours = tasks.reduce((sum, t) => sum + t.hours, 0);
  const totalRevenue = monthRevenue || 0;
  const totalProfit = totalRevenue - totalCost;

  return (
    <Drawer.Root open={open} onOpenChange={(e) => !e.open && onClose()} size="sm" dir="rtl">
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content>
            <Drawer.Header>
              <VStack align="stretch" gap={0.5}>
                <Drawer.Title>{project?.name} — משימות ב{monthLabel}</Drawer.Title>
                <Text fontSize="xs" color="fg.muted" fontWeight="normal">נפח עבודה בפועל</Text>
              </VStack>
              <Drawer.CloseTrigger asChild>
                <Button size="xs" variant="ghost" p={1} minW="auto" onClick={onClose}><X size={16} /></Button>
              </Drawer.CloseTrigger>
            </Drawer.Header>
            <Drawer.Body>
              <VStack align="stretch" gap={0}>
                {tasks.map((task) => (
                  <VStack key={task.id} align="stretch" gap={0.5} borderBottom="1px solid" borderColor="border.subtle" py={2}>
                    <Text fontSize="sm" fontWeight="bold" noOfLines={2}>{task.name}</Text>
                    <HStack justify="space-between">
                      <Text fontSize="xs" color="fg.muted" fontWeight="normal">
                        {task.hours.toFixed(1)} מתוך {Math.round(task.expectedHours)} שעות · עלות: {formatCurrencyDetailed(task.cost)}
                      </Text>
                      {task.revenue != null ? (
                        <HStack gap={3}>
                          <Text fontSize="xs" color="blue.600" fontWeight="normal">נפח עבודה: {formatCurrencyDetailed(task.revenue)}</Text>
                          <Text fontSize="xs" fontWeight="bold" color={task.profit >= 0 ? 'green.600' : 'red.500'}>
                            רווח: {formatCurrencyDetailed(task.profit)}
                          </Text>
                        </HStack>
                      ) : (
                        <Text fontSize="xs" fontWeight="bold" color="orange.600">
                          עלות: {formatCurrencyDetailed(task.cost)}
                        </Text>
                      )}
                    </HStack>
                  </VStack>
                ))}
                {tasks.length === 0 && (
                  <Text color="fg.muted" fontSize="sm">לא נרשמו שעות על משימות בחודש זה</Text>
                )}
              </VStack>

              {tasks.length > 0 && (
                <>
                  <Separator my={3} />
                  <VStack align="stretch" gap={1}>
                    <HStack justify="space-between">
                      <Text fontSize="sm" fontWeight="bold" color="blue.600">סה"כ נפח עבודה</Text>
                      <Text fontSize="sm" fontWeight="bold" color="blue.600">{formatCurrencyDetailed(totalRevenue)}</Text>
                    </HStack>
                    <HStack justify="space-between">
                      <Text fontSize="sm" fontWeight="bold" color="orange.600">סה"כ עלות</Text>
                      <Text fontSize="sm" fontWeight="bold" color="orange.600">{formatCurrencyDetailed(totalCost)}</Text>
                    </HStack>
                    <HStack justify="space-between">
                      <Text fontSize="sm" fontWeight="bold" color={totalProfit >= 0 ? 'green.600' : 'red.500'}>סה"כ רווח</Text>
                      <Text fontSize="sm" fontWeight="bold" color={totalProfit >= 0 ? 'green.600' : 'red.500'}>{formatCurrencyDetailed(totalProfit)}</Text>
                    </HStack>
                    <HStack justify="space-between">
                      <Text fontSize="xs" color="fg.muted">סה"כ שעות</Text>
                      <Text fontSize="xs" color="fg.muted">{totalHours.toFixed(1)} שעות</Text>
                    </HStack>
                  </VStack>
                </>
              )}
            </Drawer.Body>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
};

export default MonthTasksDrawer;
