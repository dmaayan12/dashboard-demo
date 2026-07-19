/**
 * Date utilities for working days calculations (Sunday-Thursday only, minus Israeli holidays)
 */
import { isIsraeliHoliday } from './israeliHolidays';

/**
 * Get number of working days in a specific month (Sun-Thu only, excluding Israeli holidays)
 */
export const getWorkingDaysInMonth = (year, month) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let workingDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dayOfWeek = date.getDay();
    // 0 = Sunday, 1-4 = Mon-Thu (working days), 5-6 = Fri-Sat (excluded)
    if (dayOfWeek >= 0 && dayOfWeek <= 4 && !isIsraeliHoliday(date)) {
      workingDays++;
    }
  }

  return workingDays;
};

/**
 * Get number of working days between two dates (inclusive, Sun-Thu only, excluding Israeli holidays)
 */
export const getWorkingDaysBetween = (startDate, endDate) => {
  if (!startDate || !endDate) return 0;

  const start = new Date(startDate);
  const end = new Date(endDate);
  let workingDays = 0;
  const current = new Date(start);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek >= 0 && dayOfWeek <= 4 && !isIsraeliHoliday(current)) {
      workingDays++;
    }
    current.setDate(current.getDate() + 1);
  }

  return workingDays;
};

/**
 * Get array of months between two dates
 * Returns: [{year, month, key}, ...]
 */
export const getMonthsBetween = (startDate, endDate) => {
  if (!startDate || !endDate) return [];

  const start = new Date(startDate);
  const end = new Date(endDate);
  const months = [];
  const current = new Date(start.getFullYear(), start.getMonth(), 1);

  while (current <= end) {
    const year = current.getFullYear();
    const month = current.getMonth();
    months.push({
      year,
      month,
      key: `${year}-${String(month + 1).padStart(2, '0')}`,
      label: `${String(month + 1).padStart(2, '0')}/${year}`
    });
    current.setMonth(current.getMonth() + 1);
  }

  return months;
};

/**
 * Get working days in a specific month within a date range
 */
export const getWorkingDaysInRange = (year, month, rangeStart, rangeEnd) => {
  // Normalize month boundaries to prevent time-of-day mismatches
  const monthStart = new Date(year, month, 1);
  monthStart.setHours(0, 0, 0, 0);

  const monthEnd = new Date(year, month + 1, 0);
  monthEnd.setHours(23, 59, 59, 999);

  // Normalize range inputs to consistent time boundaries
  const rStart = new Date(rangeStart);
  rStart.setHours(0, 0, 0, 0);

  const rEnd = new Date(rangeEnd);
  rEnd.setHours(23, 59, 59, 999);

  const effectiveStart = rStart > monthStart ? rStart : monthStart;
  const effectiveEnd = rEnd < monthEnd ? rEnd : monthEnd;

  if (effectiveStart > effectiveEnd) return 0;

  return getWorkingDaysBetween(effectiveStart, effectiveEnd);
};

/**
 * Format month key for display
 */
export const formatMonthKey = (monthKey) => {
  const [year, month] = monthKey.split('-');
  return `${month}/${year}`;
};

/**
 * Format a date as DD/MM
 */
export const formatDayMonth = (date) => {
  const d = new Date(date);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Format a date as DD/MM/YYYY
 */
export const formatDate = (date) => {
  const d = new Date(date);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

// The studio's weekly report-hours-by cutoff (see PLAN.md's "נעילה שבועית") - both "planned" and
// "actual" for a week freeze together at this exact moment, no separate grace period.
const WEEK_LOCK_HOUR = 7;

/**
 * Week identity = the Sunday-07:00 that starts/locks the week (not plain midnight) - matches the
 * studio's real work procedure (hours are expected to be logged by end of week; the week only
 * "closes" once this boundary passes, giving Sunday-morning stragglers a few hours' grace before
 * the previous week's numbers freeze).
 */
export const getWeekStart = (date) => {
  const original = new Date(date);
  const sunday = new Date(original);
  sunday.setDate(sunday.getDate() - sunday.getDay());
  sunday.setHours(WEEK_LOCK_HOUR, 0, 0, 0);
  if (sunday > original) sunday.setDate(sunday.getDate() - 7); // haven't hit this week's lock yet
  return sunday;
};

export const getWeekKey = (date) => {
  const d = getWeekStart(date);
  return d.toISOString().split('T')[0]; // "YYYY-MM-DD" (Sunday of that week)
};

export const formatWeekLabel = (weekStartDate) =>
  new Date(weekStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/**
 * Inclusive list of week buckets a [startDate, endDate] range touches.
 */
export const getWeeksBetween = (startDate, endDate) => {
  if (!startDate || !endDate) return [];

  const weeks = [];
  let cur = getWeekStart(startDate);
  const end = getWeekStart(endDate);

  while (cur <= end) {
    const weekEnd = new Date(cur);
    weekEnd.setDate(weekEnd.getDate() + 4); // Sun..Thu
    weeks.push({ key: getWeekKey(cur), start: new Date(cur), end: weekEnd, label: formatWeekLabel(cur) });
    cur = new Date(cur);
    cur.setDate(cur.getDate() + 7);
  }

  return weeks;
};

/**
 * Working days shared between an arbitrary [windowStart, windowEnd] and [rangeStart, rangeEnd].
 * General-purpose sibling of getWorkingDaysInRange, for windows that aren't calendar months (e.g. weeks).
 */
export const getWorkingDaysInWindow = (windowStart, windowEnd, rangeStart, rangeEnd) => {
  const wStart = new Date(windowStart); wStart.setHours(0, 0, 0, 0);
  const wEnd = new Date(windowEnd); wEnd.setHours(23, 59, 59, 999);
  const rStart = new Date(rangeStart); rStart.setHours(0, 0, 0, 0);
  const rEnd = new Date(rangeEnd); rEnd.setHours(23, 59, 59, 999);

  const effStart = rStart > wStart ? rStart : wStart;
  const effEnd = rEnd < wEnd ? rEnd : wEnd;

  if (effStart > effEnd) return 0;

  return getWorkingDaysBetween(effStart, effEnd);
};
