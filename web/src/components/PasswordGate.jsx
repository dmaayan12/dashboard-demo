import { useState } from 'react';
import { Box, VStack, Heading, Text, Input, Button } from '@chakra-ui/react';
import { WORKER_URL, setEntryCode, QUOTA_ERROR_MESSAGE } from '../lib/api';

// Layer 4 (see PLAN.md) - deliberately asks again every time this component mounts (no
// sessionStorage/chrome.storage persistence at all), unlike the old local dashboard's
// PasswordGate (hardcoded "playscape", checked client-side only). The code is validated
// against the Worker itself (server-side, see auth.js's checkEntryCode) via /api/validate-code -
// a real check, not just a client-side string comparison.
const PasswordGate = ({ children }) => {
  const [unlocked, setUnlocked] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);

  if (unlocked) return children;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`${WORKER_URL}/api/validate-code`, {
        headers: { 'X-Entry-Code': value },
      });
      if (res.status === 401) {
        setError('קוד כניסה שגוי');
        return;
      }
      if (res.status === 429) {
        setError(QUOTA_ERROR_MESSAGE);
        return;
      }
      if (!res.ok) {
        setError('לא ניתן להתחבר לשרת - בדוק את החיבור לאינטרנט ונסה שוב');
        return;
      }
      setEntryCode(value);
      setUnlocked(true);
    } catch {
      setError('לא ניתן להתחבר לשרת - בדוק את החיבור לאינטרנט ונסה שוב');
    } finally {
      setChecking(false);
    }
  };

  return (
    <Box dir="rtl" minH="100%" display="flex" alignItems="center" justifyContent="center" bg="white" _dark={{ bg: "#1C1F3B" }} p={6}>
      <Box as="form" onSubmit={handleSubmit} p={8} borderRadius="xl" boxShadow="lg" border="1px solid" borderColor="border.subtle" minW="320px">
        <VStack gap={4}>
          <Heading size="md">דשבורד פלייסקייפ</Heading>
          <Text fontSize="xs" color="fg.muted">יש להזין קוד כניסה בכל פעם שנפתח הדשבורד</Text>
          <Input
            type="password"
            placeholder="קוד כניסה"
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(null); }}
            autoFocus
          />
          {error && <Text fontSize="sm" color="red.500">{error}</Text>}
          <Button type="submit" colorPalette="blue" w="100%" loading={checking}>כניסה</Button>
        </VStack>
      </Box>
    </Box>
  );
};

export default PasswordGate;
