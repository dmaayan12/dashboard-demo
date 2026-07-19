import { useState } from 'react';
import { Popover, Portal, Button, VStack, HStack, Input, Text } from '@chakra-ui/react';
import { Pencil } from 'lucide-react';

const AttendanceEditPopover = ({ vacationDays, sickDays, onSave }) => {
  const [open, setOpen] = useState(false);
  const [vacationInput, setVacationInput] = useState(vacationDays || 0);
  const [sickInput, setSickInput] = useState(sickDays || 0);
  const [saving, setSaving] = useState(false);

  const handleOpenChange = (e) => {
    setOpen(e.open);
    if (e.open) {
      setVacationInput(vacationDays || 0);
      setSickInput(sickDays || 0);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ vacationDays: Number(vacationInput) || 0, sickDays: Number(sickInput) || 0 });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <Button size="xs" variant="ghost" p={1} minW="auto" aria-label="עריכת ימי חופשה ומחלה">
          <Pencil size={12} />
        </Button>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content>
            <Popover.Arrow />
            <Popover.Body>
              <VStack align="stretch" gap={2} minW="180px">
                <HStack justify="space-between">
                  <Text fontSize="xs">ימי חופשה</Text>
                  <Input
                    size="xs"
                    type="number"
                    min={0}
                    w="60px"
                    value={vacationInput}
                    onChange={(e) => setVacationInput(e.target.value)}
                  />
                </HStack>
                <HStack justify="space-between">
                  <Text fontSize="xs">ימי מחלה</Text>
                  <Input
                    size="xs"
                    type="number"
                    min={0}
                    w="60px"
                    value={sickInput}
                    onChange={(e) => setSickInput(e.target.value)}
                  />
                </HStack>
                <Button size="xs" onClick={handleSave} loading={saving}>שמור</Button>
              </VStack>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
};

export default AttendanceEditPopover;
