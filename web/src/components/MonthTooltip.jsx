import { Box, VStack, HStack, Text, Separator, Alert, Circle } from '@chakra-ui/react';
import { Banknote, TrendingUp, Target } from 'lucide-react';
import { formatCurrencyDetailed } from '../utils/financialCalculations';

// Redesign goal (after user feedback that round-1/round-2 polish still looked inconsistent):
// areas B ("נפח עבודה") and C ("יעד וביצוע") must be visual TWINS - same header treatment, same
// background, same row typography/weight rules, same padding - so differences in *content*
// (labels, row count) don't read as differences in *design quality*. Every row in both areas now
// goes through SectionHeader + TooltipRow, there is no more one-off caption-only header.
//
// Icon sits in a small solid-color circle badge (same visual language as the milestone Banknote
// badge in Area A below) instead of a bare 14px outline glyph - the bare version rendered
// correctly but was too subtle to register as an intentional icon at a glance.
const SectionHeader = ({ icon: Icon, label, iconBg }) => (
  <HStack gap={2} pb={1.5} mb={1.5} borderBottom="1px solid" borderColor="border.subtle">
    <Circle size="20px" bg={iconBg} flexShrink={0}>
      <Icon size={12} strokeWidth={2.5} color="white" />
    </Circle>
    <Text fontSize="sm" fontWeight="bold" color="fg">{label}</Text>
  </HStack>
);

// Suffix (hour-equivalents, profit %) now sits inline right next to the value instead of on its
// own line - keeps every row a single fixed-height line, which is what actually makes two
// side-by-side boxes with different content look aligned/symmetric. Still wrapped in dir="ltr"
// for the hour-suffixes (digits + "h" mixed into an RTL line don't reliably keep reading order
// otherwise - see bidi note kept from the previous round).
const TooltipRow = ({ label, value, color, isHeadline, prefix, suffix, suffixDir }) => (
  <HStack justify="space-between" gap={3} width="100%" py={0.5}>
    <Text fontSize="sm" color="fg.muted" fontWeight="medium" whiteSpace="nowrap">
      {label}
    </Text>
    <HStack gap={1} flexShrink={0}>
      <Text
        fontSize={isHeadline ? 'md' : 'sm'}
        fontWeight={isHeadline ? 'bold' : 'semibold'}
        color={color || 'fg'}
        whiteSpace="nowrap"
      >
        {prefix && <span style={{ marginInlineStart: 2 }}>{prefix}</span>}
        {value}
      </Text>
      {suffix && (
        <Text fontSize="xs" color="fg.muted" fontWeight="normal" dir={suffixDir} whiteSpace="nowrap">
          {suffix}
        </Text>
      )}
    </HStack>
  </HStack>
);

const MonthTooltip = ({
  projectName,
  monthLabel,
  workingDays,
  basePlan,
  credit,
  debt,
  effectiveTarget,
  actual,
  isCancelled,
  hourlyRate,
  milestones,
  hasMilestones,
  hoursOverrun,
  milestoneAtRisk,
  milestoneColorScheme,
  basePlanHours,
  effectiveTargetHours,
  scheduleUpdatedAt,
  revenue,
  revenueActual,
  cost,
  profit,
  profitPercent
}) => {
  // Milestone projects track completion % (0-100), not money - format accordingly.
  const formatValue = (value) => (hasMilestones ? `${Math.round(value)}%` : formatCurrencyDetailed(value));

  // Hours-equivalent for "יעד חודשי"/"יעד עדכני" (milestone projects only) - these now arrive
  // as already-correct, real "what's left" hours computed in useDashboardData.js (see PLAN.md's
  // "(Xh) fix") - NOT re-derived here from a flat project-wide total, which used to drift.
  const hoursSuffix = (hours) => (hasMilestones && hours > 0 ? `(${Math.round(hours)}h)` : null);

  // Rendered twice below (once visible in Area C, once visibility="hidden" in Area B) so the
  // two boxes always wrap to the same number of lines and stay symmetric, regardless of how
  // long this sentence is - a short placeholder word broke this the moment the real sentence
  // wrapped to 2 lines while the placeholder stayed at 1. Now shown for every project (not just
  // hasMilestones), so the subject word swaps between "האחוזים"/"הסכומים" to match what Area C
  // actually displays for this project type (formatValue does the same hasMilestones split).
  const areaCCaption = hasMilestones
    ? 'האחוזים משקפים את ביצוע המשימות מכלל הפרויקט, בהתאם ללו"ז הפרויקט העדכני, לימי העבודה בחודש ולמשימות שהושלמו'
    : 'הסכומים משקפים את ביצוע המשימות מכלל הפרויקט, בהתאם ללו"ז הפרויקט העדכני, לימי העבודה בחודש ולמשימות שהושלמו';

  // Round 6, Part C - one date per PROJECT (not per month - see PLAN.md), already filtered by
  // MonthCell.jsx to only ever arrive here for a currently-open month. Says "עודכן" (updated),
  // not "נוסף" (added) - a month can carry this note because its own numbers were recalculated
  // by the change, even if the month itself already existed before (only genuinely-new months
  // at the far end of an extension were actually "added").
  const scheduleUpdatedLabel = scheduleUpdatedAt
    ? new Date(scheduleUpdatedAt).toLocaleDateString('he-IL')
    : null;

  return (
    <Box
      dir="rtl"
      bg="white"
      _dark={{ bg: "gray.900" }}
      border="1px solid"
      borderColor="border.emphasized"
      borderRadius="xl"
      p={4}
      minW="780px"
      position="relative"
      style={{ isolation: 'isolate' }}
      boxShadow="0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)"
    >
      <VStack align="stretch" gap={3}>
        {/* Cancelled Month Warning Banner */}
        {isCancelled && (
          <Alert.Root colorPalette="red" status="warning" size="sm">
            <Alert.Indicator />
            <Alert.Title fontSize="xs" fontWeight="semibold">
              לתשומת לב: החודש הוסר מציר הזמן של הפרויקט
            </Alert.Title>
          </Alert.Root>
        )}

        {/* Header Section */}
        <VStack align="start" gap={0.5}>
          <Text fontWeight="bold" fontSize="lg" color="fg" lineHeight="short">
            {projectName}
          </Text>
          <HStack gap={2} fontSize="sm">
            <Text fontWeight="bold" color="blue.600">
              {monthLabel}
            </Text>
            <Text color="gray.400">|</Text>
            <Text color="gray.500">
              {workingDays || 0} ימי עבודה{scheduleUpdatedLabel && <Text as="span" color="orange.500" fontWeight="bold"> *</Text>}
            </Text>
          </HStack>
        </VStack>

        {/* Area A - Milestone info. Full width, above the two side-by-side areas below. */}
        {milestones?.length > 0 && (
          <Box bg="gray.50" _dark={{ bg: "whiteAlpha.50" }} borderRadius="lg" p={2.5}>
            <VStack align="stretch" gap={2}>
              {milestones.map((m) => (
                <HStack key={m.id} gap={1.5} align="start">
                  <Circle size="16px" bg={`${milestoneColorScheme}.500`} flexShrink={0} mt="1px">
                    <Banknote size={9} color="white" />
                  </Circle>
                  <VStack align="start" gap={0}>
                    <Text fontSize="sm" fontWeight="bold" color={`${milestoneColorScheme}.600`}>
                      אבן דרך - {m.percent}% ({formatCurrencyDetailed(m.amount)})
                      {milestoneAtRisk && ' - בסיכון מימוש'}
                    </Text>
                    {m.isPendingTimeConfirmation && (
                      <Text fontSize="xs" fontWeight="bold" color="yellow.700" _dark={{ color: "yellow.300" }}>
                        אבן הדרך הוקדמה - ממתינה לאישור בהגדרות הפרויקט
                      </Text>
                    )}
                    {m.note && (
                      <Text fontSize="xs" color="fg.muted">{m.note}</Text>
                    )}
                  </VStack>
                </HStack>
              ))}
            </VStack>
          </Box>
        )}

        {/* Areas B + C side by side - visual twins: identical bg/border/padding/header style,
            so any remaining difference is purely content, not inconsistent design. */}
        <HStack align="stretch" gap={3}>
          {/* Area B - work volume / cost / profitability. Shown for EVERY project. The
              hasMilestones spacer below is an invisible line matching Area C's explanation
              caption below - it belongs conceptually in Area C (put back there per feedback -
              moving it fully outside the boxes was over-correcting), but Area C being one line
              taller than Area B is exactly what broke row-for-row alignment last round. A
              same-height invisible placeholder here keeps both boxes starting their rows at the
              same Y position without moving the real caption out of its natural home. */}
          <Box flex={1} bg="gray.50" _dark={{ bg: "whiteAlpha.50" }} borderRadius="lg" p={3}>
            <SectionHeader icon={TrendingUp} label="נפח עבודה" iconBg="gray.500" />
            <VStack align="stretch" gap={1}>
              <Text fontSize="xs" visibility="hidden" pb={0.5} aria-hidden="true">{areaCCaption}</Text>
              <TooltipRow label="לפי חלוקת שווי הפרויקט לחודשי העבודה" value={formatCurrencyDetailed(revenue)} color="blue.600" />
              <TooltipRow label="לפי משימות שבוצעו בפועל" value={formatCurrencyDetailed(revenueActual)} color="blue.600" />
              <TooltipRow label="עלות בפועל" value={formatCurrencyDetailed(cost)} color="orange.600" />
              <Separator borderColor="border.subtle" my={0.5} />
              <TooltipRow
                label="רווח"
                value={formatCurrencyDetailed(profit)}
                suffix={profitPercent != null ? `(${Math.round(profitPercent)}%)` : null}
                color={profit >= 0 ? 'green.600' : 'red.500'}
                isHeadline
              />
            </VStack>
          </Box>

          {/* Area C - target/actual/percentages. */}
          <Box flex={1} bg="gray.50" _dark={{ bg: "whiteAlpha.50" }} borderRadius="lg" p={3}>
            <SectionHeader icon={Target} label="יעד וביצוע" iconBg="gray.500" />
            <VStack align="stretch" gap={1}>
              <Text fontSize="xs" color="fg.muted" pb={0.5}>
                {areaCCaption}
              </Text>

              <TooltipRow
                label="יעד חודשי"
                value={formatValue(basePlan)}
                suffix={hoursSuffix(basePlanHours)}
                suffixDir="ltr"
              />

              {credit > 0 && (
                <TooltipRow label="זיכוי שנוכה" value={formatValue(credit)} color="green.500" prefix="−" />
              )}

              {debt > 0 && (
                <TooltipRow label="חוב מחודש קודם" value={formatValue(debt)} color="orange.500" prefix="+" />
              )}

              <Separator borderColor="border.subtle" my={0.5} />

              <TooltipRow
                label="יעד עדכני"
                value={formatValue(effectiveTarget)}
                suffix={hasMilestones
                  ? hoursSuffix(effectiveTargetHours)
                  : (effectiveTarget > 0 && hourlyRate > 0 ? `/${Math.round(effectiveTarget / hourlyRate)}h` : null)}
                suffixDir="ltr"
                color="blue.600"
              />

              <TooltipRow
                label={hasMilestones ? 'משימות שבוצעו בפועל' : 'ביצוע בפועל'}
                value={formatValue(actual)}
                color="green.600"
                isHeadline
              />

              {hasMilestones && hoursOverrun && hoursOverrun.loggedHours > 0 && (
                <Text fontSize="xs" color="fg.muted" pt={0.5}>
                  שעות שנרשמו בפועל: <Text as="span" color="fg" fontWeight="bold">{Math.round(hoursOverrun.loggedHours)}h</Text>
                  {hoursOverrun.overrunPercent > 0 && (
                    <Text as="span" color="red.500">
                      {' '}(מתוכן יש משימות שבחריגה של {hoursOverrun.overrunPercent}% מהשעות שהוקצאו להן)
                    </Text>
                  )}
                  {hoursOverrun.overrunPercent < 0 && (
                    <Text as="span" color="fg.muted" fontWeight="normal">
                      {' '}({Math.abs(hoursOverrun.overrunPercent)}% מתחת לתכנון)
                    </Text>
                  )}
                </Text>
              )}
            </VStack>
          </Box>
        </HStack>

        {scheduleUpdatedLabel && (
          <Text fontSize="xs" color="orange.600" _dark={{ color: "orange.300" }}>
            * עודכן בתאריך {scheduleUpdatedLabel}
          </Text>
        )}
      </VStack>
    </Box>
  );
};

export default MonthTooltip;
