import { Box, HStack, Text, VStack, IconButton } from '@chakra-ui/react';
import { Settings } from 'lucide-react';
import MonthCell from './MonthCell';
import { formatDayMonth } from '../utils/dateUtils';
import { getMilestoneStatus } from '../utils/paymentPolicyCalculations';

// Hand-built (no external asset access) to resemble the fanned-out cash icon the user referenced:
// a simple outlined bill with a circular watermark in the middle. Kept intentionally plain/thin-
// stroke rather than a filled icon, so a stack of them still reads as individual overlapping notes.
const MoneyBillIcon = ({ size = 14, color }) => (
  <svg width={size} height={size * 0.72} viewBox="0 0 24 17" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="22" height="15" rx="2.5" stroke={color} strokeWidth="1.6" fill="white" />
    <circle cx="12" cy="8.5" r="3.2" stroke={color} strokeWidth="1.4" fill="none" />
  </svg>
);

// Tiered banknote stack: 60-100% = 3 green, 40-60% = 2 yellow, 0-40% = 1 red - per the user's
// exact spec. Notes fan out (slight rotation + offset per note) instead of sitting in a flat row,
// to read as "a pile of money" like the reference image, not a count of identical flat icons.
const PROFITABILITY_TIERS = [
  { min: 60, count: 3, color: 'green.500' },
  { min: 40, count: 2, color: 'yellow.500' },
  { min: -Infinity, count: 1, color: 'red.500' },
];

const MoneyBillStack = ({ count, color }) => (
  <Box position="relative" w={`${14 + (count - 1) * 5}px`} h="12px" flexShrink={0}>
    {Array.from({ length: count }).map((_, i) => (
      <Box
        key={i}
        position="absolute"
        left={`${i * 5}px`}
        top="0"
        transform={`rotate(${(i - (count - 1) / 2) * 8}deg)`}
        zIndex={i}
      >
        <MoneyBillIcon size={14} color={`var(--chakra-colors-${color.replace('.', '-')})`} />
      </Box>
    ))}
  </Box>
);

// Shared visual language with the Progress badge (see BadgeSlot below) - both badges use the
// exact same neutral box/text styling per the user's explicit request ("should speak the same
// language - same font, size, text color"). Profitability's tier signal (green/yellow/red) lives
// entirely in the banknote icon now, not in the badge's own colors.
const BadgeSlot = ({ label, value, icon }) => (
  <Box
    px={1.5}
    py={0.5}
    bg="gray.50"
    borderRadius="md"
    border="1px solid"
    borderColor="gray.200"
    _dark={{ bg: "whiteAlpha.100", borderColor: "whiteAlpha.300" }}
    flexShrink={0}
  >
    <VStack gap={0} align="center">
      <Text fontSize="8px" fontWeight="bold" color="gray.600" _dark={{ color: "gray.300" }} whiteSpace="nowrap" lineHeight="1">
        {label}
      </Text>
      <HStack gap={1} align="center">
        <Text fontSize="10px" fontWeight="bold" color="gray.700" _dark={{ color: "gray.200" }} whiteSpace="nowrap" lineHeight="1.2">
          {value}
        </Text>
        {icon}
      </HStack>
    </VStack>
  </Box>
);

const ProfitabilityBadge = ({ percent }) => {
  if (percent == null) return null;
  const tier = PROFITABILITY_TIERS.find((t) => percent >= t.min);
  return (
    <BadgeSlot
      label="אחוז רווחיות:"
      value={`${Math.round(percent)}%`}
      icon={<MoneyBillStack count={tier.count} color={tier.color} />}
    />
  );
};

const ProjectRow = ({ project, monthColumns, currentMonthKey, onEditPolicy }) => {
  const cellWidth = 100;

  // Surfaces on the settings button itself, not just on the specific month's cell/tooltip -
  // so a milestone pending time-confirmation is noticeable without hovering every cell.
  const hasPendingMilestone = (project.milestones || []).some(
    (m) => getMilestoneStatus(m, project.dynamicStart, project.dynamicEnd, project.lastActiveDate).isPendingTimeConfirmation
  );
  const baselineStartKey = project.baselineStart?.substring(0, 7);
  const baselineEndKey = project.baselineEnd?.substring(0, 7);

  const startIndex = monthColumns.findIndex(m => m.key === baselineStartKey);
  const endIndex = monthColumns.findIndex(m => m.key === baselineEndKey);
  const hasValidBaseline = startIndex !== -1 && endIndex !== -1;

  // Calculate Total Actuals (Sum of all months in the actuals Map)
  const totalActuals = Array.from(project.actuals.values()).reduce((sum, val) => sum + val, 0);

  // Overall progress percentage - cumulative task-completion % for milestone projects
  // (money doesn't reflect real progress when most of it is paid at project end), otherwise
  // the standard money-based progress.
  const progressPercent = project.hasMilestones
    ? (project.overallCompletion || 0)
    : (project.totalValue > 0 ? Math.round((totalActuals / project.totalValue) * 100) : 0);

  // Format total value for clean display
  const formattedTotal = Number(project.totalValue).toLocaleString('en-US');

  // Hour-bank badge color - green while comfortably under the ceiling, orange approaching it,
  // red once exceeded (pure visual guardrail, see calculateHourBankUsage's own comment).
  const bankUsage = project.hourBankUsage;
  const bankRatio = bankUsage ? bankUsage.used / bankUsage.size : 0;
  const bankColorScheme = bankRatio >= 1
    ? { bg: 'red.50', darkBg: 'red.900/30', border: 'red.200', darkBorder: 'red.800', text: 'red.600', darkText: 'red.300' }
    : bankRatio >= 0.8
      ? { bg: 'orange.50', darkBg: 'orange.900/30', border: 'orange.200', darkBorder: 'orange.800', text: 'orange.600', darkText: 'orange.300' }
      : { bg: 'green.50', darkBg: 'green.900/30', border: 'green.200', darkBorder: 'green.800', text: 'green.600', darkText: 'green.300' };

  return (
    <Box
      display="flex"
      borderBottom="1px solid"
      borderColor="border.subtle"
      position="relative"
      minH="135px"
      bg="white"
      _dark={{ bg: "#292F4C", borderColor: "whiteAlpha.200" }}
    >
      {/* Sticky Project Info Column */}
      <Box
        position="sticky"
        left={0}
        zIndex={30}
        bg="white"
        _dark={{ bg: "#292F4C", borderColor: "whiteAlpha.200" }}
        borderRight="2px solid"
        borderColor="border.emphasized"
        minW="250px"
        maxW="250px"
        p={4}
        display="flex"
        alignItems="center"
      >
        <VStack align="start" gap={1} w="100%" dir="rtl">
          {/* Project Name */}
          <HStack justify="space-between" w="100%">
            <Text fontWeight="bold" fontSize="sm" lineHeight="tight" noOfLines={2} mb={1}>
              {project.name}
            </Text>
            <IconButton
              size="2xs"
              variant="ghost"
              aria-label="הגדרת מדיניות תשלום"
              onClick={() => onEditPolicy?.(project)}
              flexShrink={0}
              colorPalette={hasPendingMilestone ? 'yellow' : undefined}
              bg={hasPendingMilestone ? 'yellow.100' : undefined}
              color={hasPendingMilestone ? 'yellow.700' : undefined}
              _dark={hasPendingMilestone ? { bg: 'yellow.900/40', color: 'yellow.300' } : undefined}
              title={hasPendingMilestone ? 'יש אבן דרך הממתינה לאישור' : undefined}
            >
              <Settings size={13} />
            </IconButton>
          </HStack>

          {/* Row 1 - fixed order, always right-to-left: value, progress, profitability. Each
              slot renders in the same DOM position regardless of whether the others exist, so
              the order can't shift per-project the way it could when the hour-bank badge used to
              sit between progress and profitability (see PLAN.md - user reported inconsistent
              order across projects). flexWrap so the row breaks onto a second line inside the
              card when it doesn't fit in the narrow 250px column. */}
          <HStack gap={2} rowGap={1} alignItems="center" flexWrap="wrap">
            <Text fontSize="xs" fontWeight="extrabold" color="blue.500" _dark={{ color: "blue.300" }} whiteSpace="nowrap" flexShrink={0}>
              {formattedTotal} ₪
            </Text>

            <Box w="3px" h="3px" borderRadius="full" bg="gray.300" flexShrink={0} />

            <BadgeSlot label="התקדמות:" value={`${progressPercent}%`} />

            {project.profitabilityPercent != null && (
              <>
                <Box w="3px" h="3px" borderRadius="full" bg="gray.300" flexShrink={0} />
                <ProfitabilityBadge percent={project.profitabilityPercent} />
              </>
            )}
          </HStack>

          {/* Row 2 - hour bank, separate row entirely, shown only when a bank size is set */}
          {bankUsage && (
            <HStack gap={2} rowGap={1} alignItems="center" flexWrap="wrap">
              <Box
                px={1.5}
                py={0.5}
                bg={bankColorScheme.bg}
                borderRadius="md"
                border="1px solid"
                borderColor={bankColorScheme.border}
                _dark={{ bg: bankColorScheme.darkBg, borderColor: bankColorScheme.darkBorder }}
                title="בנק שעות שנוצל מתוך הגודל שהוגדר במדיניות התשלום"
                flexShrink={0}
              >
                <Text fontSize="10px" fontWeight="bold" color={bankColorScheme.text} _dark={{ color: bankColorScheme.darkText }} whiteSpace="nowrap">
                  בנק שעות: {Math.round(bankUsage.used)}/{bankUsage.size}
                </Text>
              </Box>
            </HStack>
          )}
        </VStack>
      </Box>

      {/* Grid Content Area */}
      <Box
        position="relative"
        flex={1}
        display="flex"
        flexDirection="column"
        justifyContent="flex-start"
        pt="4px" // Minimal top spacing for clean look
      >

        {/* NEW: Full-Height Background Grid & Highlight Layer */}
        <Box position="absolute" top={0} bottom={0} left={0} right={0} display="flex" zIndex={0}>
          {monthColumns.map((month) => {
            const isCurrentMonth = month.key === currentMonthKey;
            return (
              <Box
                key={`bg-${month.key}`}
                minW={`${cellWidth}px`}
                w={`${cellWidth}px`}
                h="100%"
                bg={isCurrentMonth ? 'yellow.50' : 'transparent'}
                _dark={{ bg: isCurrentMonth ? 'yellow.900/20' : 'transparent' }}
                borderRight="1px solid"
                borderColor="border.subtle"
              />
            );
          })}
        </Box>

        {/* Upper Layer: Baseline Bar */}
        <Box h="25px" position="relative" zIndex={10}>
          {hasValidBaseline && (
            <Box
              position="absolute"
              top="0"
              left={`${startIndex * cellWidth}px`}
              width={`${(endIndex - startIndex + 1) * cellWidth}px`}
              zIndex={10}
            >
              <Text fontSize="9px" fontWeight="bold" color="blue.500" mb="2px" textAlign="center" whiteSpace="nowrap">
                {formatDayMonth(project.baselineStart)} - {formatDayMonth(project.baselineEnd)}
              </Text>
              <Box h="5px" bg="blue.500" borderRadius="full" opacity={0.2} border="1px solid" borderColor="blue.500" />
            </Box>
          )}
        </Box>

        {/* Lower Layer: Month Cells Grid */}
        <Box h="100px" position="relative" zIndex={10}>
          <HStack gap={0} alignItems="center" justifyContent="flex-start" h="full">
            {monthColumns.map((month) => {
              const monthDate = new Date(month.key + '-01');
              const dStart = new Date(project.dynamicStart);
              const dEnd = new Date(project.dynamicEnd);

              const sCheck = new Date(dStart.getFullYear(), dStart.getMonth(), 1);
              const eCheck = new Date(dEnd.getFullYear(), dEnd.getMonth(), 1);
              const isActive = monthDate >= sCheck && monthDate <= eCheck;

              return (
                <Box
                  key={month.key}
                  minW={`${cellWidth}px`}
                  w={`${cellWidth}px`}
                  h="full"
                  display="flex"
                  alignItems="center" // Vertical alignment
                  justifyContent="center" // Horizontal alignment
                >
                  <MonthCell
                    project={project}
                    monthKey={month.key}
                    monthLabel={month.label}
                    isActive={isActive}
                  />
                </Box>
              );
            })}
          </HStack>
        </Box>
      </Box>
    </Box>
  );
};

export default ProjectRow;
