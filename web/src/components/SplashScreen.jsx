import { useState, useEffect } from 'react';
import { Box, VStack, Text, Image } from '@chakra-ui/react';

// The real full cold-load (dashboard data + payment policies + schedule/status-history re-scans)
// takes around 15 real seconds (verified live - see PLAN.md) - a plain "טוען..." the whole time
// felt stuck. Two one-shot timers (not an interval - the message only ever moves forward, never
// loops) swap in a couple of lighter, reassuring lines the further the wait drags on. Timed by
// feel against that real ~15s figure: still on the plain line for a quick load, past the halfway
// point for a normal one, and into "כמעט שם" only once it's genuinely taking a while.
const MESSAGES = [
  'טוען את הדשבורד...',
  'וואו עובדים קשה בפלייסקיפ, הרבה נתונים...',
  'עוד רגע אנחנו שם',
];

const SplashScreen = ({ minHeight = '100vh' }) => {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setMessageIndex(1), 5000);
    const t2 = setTimeout(() => setMessageIndex(2), 11000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <Box
      dir="rtl"
      minH={minHeight}
      display="flex"
      alignItems="center"
      justifyContent="center"
      bg="white"
      _dark={{ bg: "#1C1F3B" }}
    >
      <VStack gap={4}>
        <Image src="/playscape-logo.png" alt="Playscape" boxSize="72px" className="splash-pulse" />
        <Text fontSize="sm" color="fg.muted" className="splash-pulse">
          {MESSAGES[messageIndex]}
        </Text>
      </VStack>
    </Box>
  );
};

export default SplashScreen;
