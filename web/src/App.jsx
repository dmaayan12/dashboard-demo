import { useState } from 'react';
import { Box, Tabs, HStack, Text } from '@chakra-ui/react';
import { X } from 'lucide-react';
import FinancialTab from './components/FinancialTab';
import ExpectedVolumeTab from './components/workload/ExpectedVolumeTab';
import EmployeeLoadTab from './components/workload/EmployeeLoadTab';
import ProjectManagementTab from './components/ProjectManagementTab';
import PasswordGate from './components/PasswordGate';
import SplashScreen from './components/SplashScreen';

const TAB_BAR_HEIGHT = '41px';
const DEMO_BANNER_HEIGHT = '28px';

// Persistent, unmissable reminder that this is the portfolio demo copy (fictitious data), not the
// real production dashboard - shown at every stage (even before the password gate), specifically
// so a live demo-to-someone-else session can never be mistaken for the real thing mid-presentation.
const DemoBanner = () => (
  <Box
    position="fixed"
    top={0}
    left={0}
    right={0}
    h={DEMO_BANNER_HEIGHT}
    zIndex={400}
    bg="orange.500"
    color="white"
    display="flex"
    alignItems="center"
    justifyContent="center"
    fontSize="sm"
    fontWeight="bold"
  >
    דמו — כל הנתונים בפרויקט זה בדויים, לא קשורים לשום לקוח או עסק אמיתי
  </Box>
);

const App = () => {
  const [activeTab, setActiveTab] = useState('financial');
  const [showProjectTab, setShowProjectTab] = useState(false);
  const [dashboardReady, setDashboardReady] = useState(false);

  const closeProjectTab = (e) => {
    e.stopPropagation();
    setShowProjectTab(false);
    setActiveTab((current) => (current === 'project-management' ? 'financial' : current));
  };

  return (
    <>
    <DemoBanner />
    <Box pt={DEMO_BANNER_HEIGHT}>
    <PasswordGate>
      <Box position="relative" minH="100%">
        {!dashboardReady && (
          <Box position="absolute" inset={0} zIndex={300}>
            <SplashScreen />
          </Box>
        )}
        <Tabs.Root
          value={activeTab}
          onValueChange={(e) => setActiveTab(e.value)}
          lazyMount
          unmountOnExit={false}
          dir="rtl"
        >
          <Box
            position="absolute"
            top={0}
            left={0}
            w="32px"
            h="32px"
            zIndex={200}
            onDoubleClick={() => {
              setShowProjectTab(true);
              setActiveTab('project-management');
            }}
          />
          <Tabs.List dir="rtl" position="sticky" top={0} zIndex={100} bg="white">
            <Tabs.Trigger value="financial">באקלוג</Tabs.Trigger>
            <Tabs.Trigger value="volume">נפח עבודה צפוי</Tabs.Trigger>
            <Tabs.Trigger value="load">עומס עובדים</Tabs.Trigger>
            {showProjectTab && (
              <Tabs.Trigger value="project-management">
                <HStack gap={1}>
                  <Text>ניהול פרויקט</Text>
                  <Box
                    as="span"
                    role="button"
                    aria-label="סגור לשונית"
                    display="flex"
                    alignItems="center"
                    p={0.5}
                    borderRadius="sm"
                    _hover={{ bg: 'blackAlpha.100' }}
                    onClick={closeProjectTab}
                  >
                    <X size={12} />
                  </Box>
                </HStack>
              </Tabs.Trigger>
            )}
          </Tabs.List>
          <Box>
            <Tabs.Content dir="rtl" value="financial" pt={0}><FinancialTab onReady={() => setDashboardReady(true)} /></Tabs.Content>
            <Tabs.Content dir="rtl" value="volume" pt={0}><ExpectedVolumeTab /></Tabs.Content>
            <Tabs.Content dir="rtl" value="load" pt={0}><EmployeeLoadTab /></Tabs.Content>
            {showProjectTab && (
              <Tabs.Content dir="rtl" value="project-management" pt={0}><ProjectManagementTab /></Tabs.Content>
            )}
          </Box>
        </Tabs.Root>
      </Box>
    </PasswordGate>
    </Box>
    </>
  );
};

export default App;
