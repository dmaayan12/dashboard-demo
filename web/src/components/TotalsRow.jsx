import { Box, HStack, VStack, Text } from '@chakra-ui/react';
import { Banknote } from 'lucide-react';
import { formatCurrency } from '../utils/financialCalculations';

// Always pinned to the bottom of the browser window (position="fixed", not "sticky") so the
// totals are visible immediately without any vertical scrolling, regardless of project count.
// Since it now lives outside the horizontally-scrolling pane, its month columns are kept in
// sync via a CSS transform driven by the same scrollLeft the pane reports.
//
// "יעד"/"חוב" rows were removed (see CLAUDE.md for what they meant and how to restore them) -
// for a milestone project they're always identical to "בפועל" (a milestone is target-and-actual
// at once), so they added no information beyond what regular projects' own target/actual gap
// already showed elsewhere. 4 rows now: נפח עבודה (blue), רווחיות (black label), הכנסה בפועל
// (renamed from "בפועל", net of at-risk), and הכנסה בסיכון (new, red) - h grew from 110px to
// 140px to fit the extra row.
const TotalsRow = ({ monthColumns, totals, currentMonthKey, scrollLeft = 0 }) => {
  return (
    <Box
      position="fixed"
      bottom={0}
      left={0}
      right={0}
      zIndex={100}
      bg="white"
      _dark={{ bg: "#292F4C", borderColor: "whiteAlpha.200" }}
      borderTop="3px solid"
      borderColor="border.emphasized"
      display="flex"
      shadow="0 -10px 15px -3px rgba(0, 0, 0, 0.1)"
      h="140px"
      dir="ltr"
    >
      {/* 1. Sidebar (Labels) - stays put since the whole row is already fixed */}
      <Box
        bg="white"
        _dark={{ bg: "#292F4C", borderColor: "whiteAlpha.200" }}
        borderRight="2px solid"
        borderColor="border.emphasized"
        minW="250px"
        maxW="250px"
        p={4}
        display="flex"
        flexDirection="column"
        justifyContent="center" // Center the whole block vertically
      >
        <Text fontWeight="bold" fontSize="sm" color="fg.muted" mb={2} dir="rtl">
          סיכומים חודשיים
        </Text>

        <VStack align="start" gap={1} dir="rtl">
          {/* Work-volume (revenue) Label */}
          <HStack gap={2} h="18px">
            <Box w="6px" h="6px" borderRadius="full" bg="blue.500" />
            <Text fontSize="xs" fontWeight="bold" color="blue.600">
              נפח עבודה
            </Text>
          </HStack>

          {/* Profitability Label - neutral/black, not colored like the value below it */}
          <HStack gap={2} h="18px">
            <Box w="6px" h="6px" borderRadius="full" bg="gray.600" _dark={{ bg: "gray.400" }} />
            <Text fontSize="xs" fontWeight="bold" color="gray.700" _dark={{ color: "gray.300" }}>
              רווחיות ביחס לנפח עבודה
            </Text>
          </HStack>

          {/* Actual Income Label */}
          <HStack gap={2} h="18px">
            <Box w="6px" h="6px" borderRadius="full" bg="green.500" />
            <Text fontSize="xs" fontWeight="bold" color="green.600">
              הכנסה בפועל
            </Text>
          </HStack>

          {/* At-risk Income Label */}
          <HStack gap={2} h="18px">
            <Box w="6px" h="6px" borderRadius="full" bg="red.500" />
            <Text fontSize="xs" fontWeight="bold" color="red.600">
              הכנסה בסיכון
            </Text>
          </HStack>
        </VStack>
      </Box>

      {/* 2. Totals Grid - clipped to the visible width, shifted via transform to stay in sync
          with the main pane's horizontal scroll position (it no longer scrolls on its own). */}
      <Box flex={1} overflow="hidden">
        <HStack
          gap={0}
          bg="white"
          _dark={{ bg: "#292F4C" }}
          w={`${monthColumns.length * 100}px`}
          style={{ transform: `translateX(-${scrollLeft}px)` }}
        >
          {monthColumns.map((month) => {
            const monthData = totals.get(month.key);
            const actual = monthData?.actual || 0;
            const atRiskAmount = monthData?.atRiskAmount || 0;
            const netActual = actual - atRiskAmount;
            const totalRevenue = monthData?.totalRevenue || 0;
            const profitPercent = monthData?.profitPercent;
            const isCurrentMonth = month.key === currentMonthKey;

            return (
              <Box
                key={month.key}
                position="relative"
                minW="100px"
                w="100px"
                h="140px"
                display="flex"
                flexDirection="column"
                justifyContent="center" // Center the whole block vertically
                alignItems="center"
                borderRight="1px solid"
                borderColor="border.subtle"
                bg={isCurrentMonth ? 'yellow.50' : 'transparent'}
                _dark={{ bg: isCurrentMonth ? 'yellow.900/20' : 'transparent' }}
                title={monthData?.milestoneAtRisk ? `יש אבן דרך בסיכון מימוש בחודש זה (${formatCurrency(atRiskAmount)} ₪)` : undefined}
              >
                {/* Invisible spacer to match the "MONTHLY TOTALS" title height */}
                <Text fontSize="xs" mb={2} opacity={0} pointerEvents="none">
                  -
                </Text>

                <VStack gap={1} align="center">
                  {/* Work-volume (revenue) Total */}
                  <Text fontSize="xs" fontWeight="extrabold" color="blue.600" h="18px" lineHeight="18px">
                    {formatCurrency(totalRevenue)}
                  </Text>

                  {/* Profitability Total - "—" (not a misleading "100%") for a future month
                      that has planned revenue but no cost logged yet, i.e. no real work has
                      started (see profitPercent's own null-guard in useDashboardData.js). */}
                  <Text
                    fontSize="xs"
                    fontWeight="extrabold"
                    color={profitPercent == null ? 'fg.muted' : profitPercent >= 0 ? 'green.600' : 'red.500'}
                    h="18px"
                    lineHeight="18px"
                  >
                    {profitPercent == null ? '—' : `${Math.round(profitPercent)}%`}
                  </Text>

                  {/* Actual Income Total - net of the at-risk portion (which now has its own
                      row below). A pending-confirmation milestone landing this month shows as
                      a bare "+" and a small yellow icon, no text. */}
                  <HStack gap={1} h="18px" lineHeight="18px">
                    <Text fontSize="xs" fontWeight="extrabold" color="green.600">
                      {formatCurrency(netActual)}
                    </Text>
                    {monthData?.hasPendingMilestone && (
                      <HStack gap="1px" title="יש אבן דרך הממתינה לאישור בחודש זה">
                        <Text fontSize="xs" fontWeight="extrabold" color="yellow.600">+</Text>
                        <Banknote size={11} color="var(--chakra-colors-yellow-500)" />
                      </HStack>
                    )}
                  </HStack>

                  {/* At-risk Income Total */}
                  <Text fontSize="xs" fontWeight="extrabold" color="red.500" h="18px" lineHeight="18px">
                    {atRiskAmount > 0 ? formatCurrency(atRiskAmount) : '—'}
                  </Text>
                </VStack>
              </Box>
            );
          })}
        </HStack>
      </Box>
    </Box>
  );
};

export default TotalsRow;
