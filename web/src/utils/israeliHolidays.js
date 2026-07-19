/**
 * Israeli statutory non-working holy days ("ימי שבתון במשק"), by ISO date ("YYYY-MM-DD").
 * Only dates that fall on a Sunday-Thursday are included - the app's work week is already
 * Sun-Thu (see dateUtils.js), so a holiday landing on Friday/Saturday doesn't change anything
 * and is left out on purpose (e.g. Shavuot 2026 falls on a Friday).
 *
 * Sourced via web search (no holiday-calendar library/dataset existed in this repo before) and
 * cross-checked against multiple sources. Hebrew-calendar dates shift every Gregorian year, so
 * this list needs a fresh lookup added for each new year as it becomes relevant - it currently
 * only covers 2026. Purim is intentionally excluded - it isn't an official "שבתון" day.
 */
export const ISRAELI_HOLIDAYS_BY_YEAR = {
  2026: [
    '2026-04-02', // פסח, יום א' (חמישי)
    '2026-04-08', // פסח, יום ז' (רביעי)
    '2026-04-22', // יום העצמאות (רביעי)
    '2026-09-13', // ראש השנה, יום ב' (ראשון)
    '2026-09-21', // יום כיפור (שני)
    '2026-09-27', // סוכות, יום א' (ראשון)
    '2026-10-04', // שמחת תורה (ראשון)
  ],
};

const ALL_HOLIDAY_DATES = new Set(Object.values(ISRAELI_HOLIDAYS_BY_YEAR).flat());

const toIsoDate = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const isIsraeliHoliday = (date) => ALL_HOLIDAY_DATES.has(toIsoDate(date));
