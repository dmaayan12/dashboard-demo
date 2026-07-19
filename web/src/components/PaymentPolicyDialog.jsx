import { useState, useEffect } from 'react';
import { Box, VStack, HStack, Text, Button, Dialog, Input, NativeSelect, IconButton } from '@chakra-ui/react';
import { Plus, Trash2 } from 'lucide-react';
import { getMilestoneStatus } from '../utils/paymentPolicyCalculations';
import { formatCurrencyDetailed } from '../utils/financialCalculations';

const TRIGGER_LABELS = {
  start: 'בתחילת הפרויקט',
  end: 'בסיום הפרויקט',
  custom: 'בתאריך מסוים',
};

const emptyMilestone = (defaultTrigger) => ({
  id: crypto.randomUUID(),
  note: '',
  percent: 0,
  trigger: defaultTrigger,
  customDate: '',
  monthsAfterStart: '',
  timeConfirmed: false,
});

const PaymentPolicyDialog = ({ open, onClose, projectName, totalValue, milestones: initialMilestones, initialHourBankSize, dynamicStart, dynamicEnd, lastActiveDate, onSave }) => {
  const [milestones, setMilestones] = useState(initialMilestones || []);
  // Hour-bank ceiling (e.g. 140h) for ad-hoc work within a milestone project's already-fixed
  // price - purely a monitoring guardrail (see paymentPolicyCalculations.js/ProjectRow.jsx), set
  // once here like every other contractual detail, not derived from monday.
  const [hourBankSize, setHourBankSize] = useState(initialHourBankSize ?? '');
  // A project with a saved policy opens straight to a read-only summary (with an edit button);
  // a brand-new project has nothing to summarize, so it opens straight to the editable form.
  const [mode, setMode] = useState(initialMilestones?.length ? 'view' : 'edit');

  useEffect(() => {
    if (open) {
      setMilestones(initialMilestones?.length ? initialMilestones : []);
      setHourBankSize(initialHourBankSize ?? '');
      setMode(initialMilestones?.length ? 'view' : 'edit');
    }
  }, [open, initialMilestones, initialHourBankSize]);

  const totalPercent = milestones.reduce((sum, m) => sum + (Number(m.percent) || 0), 0);

  const updateMilestone = (id, changes) => {
    setMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, ...changes } : m)));
  };

  const removeMilestone = (id) => {
    setMilestones((prev) => prev.filter((m) => m.id !== id));
  };

  const addMilestone = () => {
    setMilestones((prev) => {
      // Default to a trigger not already claimed by another milestone, so a new row never
      // silently duplicates "start"/"end" with an existing one.
      const used = new Set(prev.map((m) => m.trigger));
      const defaultTrigger = !used.has('start') ? 'start' : !used.has('end') ? 'end' : 'custom';
      return [...prev, emptyMilestone(defaultTrigger)];
    });
  };

  const handleSave = () => {
    onSave({ milestones, hourBankSize: hourBankSize === '' ? null : Number(hourBankSize) });
    onClose();
  };

  // A milestone whose secondary time-condition fired first needs an explicit confirmation
  // before it counts toward money - this locks it in without going through the full edit form.
  const handleConfirm = (id) => {
    const updated = milestones.map((m) => (m.id === id ? { ...m, timeConfirmed: true } : m));
    setMilestones(updated);
    onSave({ milestones: updated, hourBankSize: hourBankSize === '' ? null : Number(hourBankSize) });
  };

  return (
    <Dialog.Root open={open} onOpenChange={(e) => !e.open && onClose()} dir="rtl">
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content maxW="600px">
          <Dialog.Header>
            <Dialog.Title>מדיניות תשלום - {projectName}</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            {mode === 'view' ? (
              <VStack align="stretch" gap={3}>
                <Text fontSize="sm" color="fg.muted">מדיניות התשלום השמורה לפרויקט זה:</Text>

                {milestones.map((m) => {
                  const status = getMilestoneStatus(m, dynamicStart, dynamicEnd, lastActiveDate);
                  const amount = ((Number(m.percent) || 0) / 100) * totalValue;
                  return (
                    <Box
                      key={m.id}
                      p={3}
                      border="1px solid"
                      borderColor={status.isPendingTimeConfirmation ? 'yellow.400' : 'border.subtle'}
                      bg={status.isPendingTimeConfirmation ? 'yellow.50' : undefined}
                      _dark={status.isPendingTimeConfirmation ? { bg: 'yellow.900/20', borderColor: 'yellow.600' } : undefined}
                      borderRadius="md"
                    >
                      <HStack justify="space-between" align="start">
                        <VStack align="start" gap={0.5}>
                          <Text fontSize="sm" fontWeight="bold">
                            {m.percent}% ({formatCurrencyDetailed(amount)}) - {TRIGGER_LABELS[m.trigger]}
                          </Text>
                          {m.monthsAfterStart && (
                            <Text fontSize="xs" color="fg.muted">
                              או אחרי {m.monthsAfterStart} חודשים מתחילת הפרויקט, לפי המוקדם מביניהם
                            </Text>
                          )}
                          {m.note && <Text fontSize="xs" color="fg.muted">{m.note}</Text>}
                          {status.isPendingTimeConfirmation && (
                            <Text fontSize="xs" fontWeight="bold" color="yellow.700" _dark={{ color: 'yellow.300' }}>
                              אבן הדרך הוקדמה - ממתינה לאישור
                            </Text>
                          )}
                        </VStack>
                        {status.isPendingTimeConfirmation && (
                          <Button size="xs" colorPalette="yellow" onClick={() => handleConfirm(m.id)}>
                            אשר
                          </Button>
                        )}
                      </HStack>
                    </Box>
                  );
                })}

                {milestones.length === 0 && (
                  <Text fontSize="sm" color="fg.muted">לא הוגדרה מדיניות תשלום.</Text>
                )}

                {hourBankSize !== '' && Number(hourBankSize) > 0 && (
                  <Text fontSize="sm" color="fg.muted">
                    בנק שעות: {hourBankSize} שעות (משימות ששמן מתחיל ב"בנק שעות")
                  </Text>
                )}
              </VStack>
            ) : (
              <VStack align="stretch" gap={4}>
                <Text fontSize="sm" color="fg.muted">
                  בחר את מדיניות התשלום מול הלקוח.
                </Text>

                {milestones.map((m) => {
                  // "start"/"end" each resolve to a single fixed month - letting two milestones
                  // share the same trigger would just make them collide on the same month, which
                  // never makes sense. "custom" has no such limit (different dates are fine).
                  // Only trigger types held by OTHER rows are excluded - this row's own current
                  // value always stays selectable, so the dropdown never goes blank.
                  const usedByOthers = new Set(
                    milestones
                      .filter((other) => other.id !== m.id && (other.trigger === 'start' || other.trigger === 'end'))
                      .map((other) => other.trigger)
                  );

                  return (
                    <Box key={m.id} p={3} border="1px solid" borderColor="border.subtle" borderRadius="md">
                      <VStack align="stretch" gap={2}>
                        <HStack>
                          <Input
                            placeholder="הערה (אופציונלי, למשל: 'או במסירת כלל המוצרים, לפי המוקדם מביניהם')"
                            value={m.note || ''}
                            onChange={(e) => updateMilestone(m.id, { note: e.target.value })}
                            size="sm"
                          />
                          <IconButton size="sm" variant="ghost" colorPalette="red" aria-label="הסר אבן דרך" onClick={() => removeMilestone(m.id)}>
                            <Trash2 size={14} />
                          </IconButton>
                        </HStack>
                        <HStack>
                          <HStack flex={1}>
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={m.percent}
                              onChange={(e) => updateMilestone(m.id, { percent: e.target.value })}
                              size="sm"
                              w="90px"
                            />
                            <Text fontSize="sm">%</Text>
                          </HStack>
                          <NativeSelect.Root size="sm" flex={1}>
                            <NativeSelect.Field
                              value={m.trigger}
                              onChange={(e) => updateMilestone(m.id, { trigger: e.target.value })}
                            >
                              {Object.entries(TRIGGER_LABELS)
                                .filter(([value]) => value === m.trigger || !usedByOthers.has(value))
                                .map(([value, label]) => (
                                  <option key={value} value={value}>{label}</option>
                                ))}
                            </NativeSelect.Field>
                            <NativeSelect.Indicator />
                          </NativeSelect.Root>
                          {m.trigger === 'custom' && (
                            <Input
                              type="date"
                              value={m.customDate || ''}
                              onChange={(e) => updateMilestone(m.id, { customDate: e.target.value })}
                              size="sm"
                              flex={1}
                            />
                          )}
                        </HStack>
                        <HStack>
                          <Text fontSize="xs" color="fg.muted" whiteSpace="nowrap">או אחרי</Text>
                          <Input
                            type="number"
                            min={0}
                            placeholder="X"
                            value={m.monthsAfterStart || ''}
                            onChange={(e) => updateMilestone(m.id, { monthsAfterStart: e.target.value })}
                            size="sm"
                            w="70px"
                          />
                          <Text fontSize="xs" color="fg.muted" whiteSpace="nowrap">
                            חודשים מתחילת הפרויקט - לפי המוקדם מביניהם (אופציונלי)
                          </Text>
                        </HStack>
                      </VStack>
                    </Box>
                  );
                })}

                <Button size="sm" variant="outline" onClick={addMilestone}>
                  <Plus size={14} />
                  הוסף אבן דרך
                </Button>

                {milestones.length > 0 && (
                  <Text fontSize="xs" color={totalPercent > 100 ? 'red.500' : 'fg.muted'}>
                    סך האחוזים: {totalPercent}% {totalPercent < 100 && '(היתרה תחושב לפי אחוזי השלמת משימות)'}
                    {totalPercent > 100 && ' - חורג מ-100%, כדאי לתקן'}
                  </Text>
                )}

                <Box p={3} border="1px solid" borderColor="border.subtle" borderRadius="md">
                  <VStack align="stretch" gap={1}>
                    <HStack>
                      <Text fontSize="sm" whiteSpace="nowrap">גודל בנק שעות (אופציונלי)</Text>
                      <Input
                        type="number"
                        min={0}
                        placeholder="למשל 140"
                        value={hourBankSize}
                        onChange={(e) => setHourBankSize(e.target.value)}
                        size="sm"
                        w="90px"
                      />
                      <Text fontSize="xs" color="fg.muted">שעות</Text>
                    </HStack>
                    <Text fontSize="xs" color="fg.muted">
                      לצורך מעקב בלבד - משימות ששמן מתחיל ב"בנק שעות" יוצגו כתג ליד שם הפרויקט (X מתוך {hourBankSize || '...'} שעות נוצלו).
                    </Text>
                  </VStack>
                </Box>
              </VStack>
            )}
          </Dialog.Body>
          <Dialog.Footer>
            {mode === 'view' ? (
              <>
                <Button variant="outline" onClick={onClose}>סגור</Button>
                <Button colorPalette="blue" onClick={() => setMode('edit')}>עריכה</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={onClose}>ביטול</Button>
                <Button colorPalette="blue" onClick={handleSave}>שמור</Button>
              </>
            )}
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
};

export default PaymentPolicyDialog;
