// Generates the demo's entire fictitious dataset - projects, tasks, users - in the exact shape
// the real dashboardService.js/workloadService.js emit (see their COLS/column-parser pipeline in
// the real project), so the frontend (copied unmodified) can't tell the difference.
//
// Every date is a RELATIVE offset from `now` (months/days ago or from now), never an absolute
// calendar date - almost every date-sensitive calculation in the frontend (which month is
// "closed" vs "open", milestone trigger evaluation, the weekly pace-hours model) is driven by the
// real wall-clock `new Date()`, not by anything in the payload. A fixture with hardcoded absolute
// dates would look right today and silently rot within a few months (projects drifting into the
// past, milestones stuck "overdue" forever). Recomputing relative to `now` on every call keeps
// the demo correct indefinitely, with zero maintenance.
//
// A tiny seeded PRNG (mulberry32) keeps numbers stable across requests within the same run
// (rather than jittering randomly on every call) without pulling in a dependency.

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY_MS = 86400000;
const daysFrom = (now, n) => new Date(now.getTime() + n * DAY_MS);
const monthsFrom = (now, n) => {
  const d = new Date(now);
  d.setMonth(d.getMonth() + n);
  return d;
};
const iso = (d) => d.toISOString().slice(0, 10);

function pick(rnd, arr) { return arr[Math.floor(rnd() * arr.length)]; }
function randInt(rnd, min, max) { return Math.floor(min + rnd() * (max - min + 1)); }
function randFloat(rnd, min, max, decimals = 1) {
  const v = min + rnd() * (max - min);
  return Math.round(v * 10 ** decimals) / 10 ** decimals;
}

const TASK_TYPES = ['עיצוב', 'פיתוח', 'תוכן', 'תיאום'];
const FREELANCE_TYPES = ['פרילאנס', 'ניהול'];
const USERS = [
  { id: 'u1', name: 'נועה כהן' },
  { id: 'u2', name: 'איתי לוי' },
  { id: 'u3', name: 'מאיה בר' },
  { id: 'u4', name: 'רון שגיא' },
  { id: 'u5', name: 'דניאל אבני' },
];
const TASK_NAME_POOL = [
  'עיצוב מסך נחיתה', 'בניית קומפוננטה משותפת', 'כתיבת תוכן שיווקי', 'תיאום מול לקוח',
  'אינטגרציית תשלומים', 'בדיקות QA', 'עיצוב לוגו וזהות', 'בניית API', 'עריכת סרטון',
  'תרגום תוכן', 'אופטימיזציית ביצועים', 'עיצוב אייקונים', 'כתיבת תיעוד', 'סקירת קוד',
  'הקמת סביבת בדיקות', 'עיצוב באנרים לרשתות', 'ניתוח נתונים', 'תכנון ארכיטקטורה',
];

let taskIdCounter = 1;
const nextTaskId = () => String(9000000000 + taskIdCounter++);

/** One task, with sensible defaults; caller overrides only what matters for its scenario. */
function makeTask(rnd, now, { projectId, name, taskType, status, expectedHours, hourlyRate, weeklyFrom, weeklyTo, history, assignedUserIds }) {
  return {
    id: nextTaskId(),
    name,
    linkedItems: [{ id: projectId }],
    hourlyRate: hourlyRate ?? randInt(rnd, 120, 220),
    expectedHours: expectedHours ?? randInt(rnd, 4, 40),
    status: status ?? null,
    weeklyTimeline: weeklyFrom ? { from: iso(weeklyFrom), to: iso(weeklyTo) } : { from: null, to: null },
    taskType: taskType ?? pick(rnd, TASK_TYPES),
    assignedUserIds: assignedUserIds ?? [pick(rnd, USERS).id],
    history: history ?? [],
  };
}

function makeHistoryEntries(rnd, now, { fromDaysAgo, toDaysAgo, count, hoursEach }) {
  const entries = [];
  for (let i = 0; i < count; i++) {
    const offset = -randInt(rnd, toDaysAgo, fromDaysAgo);
    entries.push({
      startDate: daysFrom(now, offset).toISOString(),
      durationInSeconds: Math.round((hoursEach ?? randFloat(rnd, 1, 6)) * 3600),
      startedUserId: pick(rnd, USERS).id,
      endedUserId: pick(rnd, USERS).id,
    });
  }
  return entries;
}

/**
 * Builds the entire fictitious world once: projects, tasks, and the seed-only extras
 * (payment policies / schedule-change events / task-done dates) that get written to D1 a single
 * time during setup (see README.md's deployment section) rather than regenerated live - those
 * three are D1-backed in the real system too (payment_policies / schedule_change_events /
 * task_status_history tables), so the Worker's live responses never need to invent them.
 */
export function buildWorld(now = new Date()) {
  const rnd = mulberry32(20260719); // fixed seed - stable numbers across requests, not random noise
  taskIdCounter = 1;

  const projects = [];
  const tasks = [];
  const paymentPolicies = [];
  const scheduleChangeEvents = [];
  const taskDoneDates = [];

  // --- Project 1: regular financial project (no payment policy) ---
  const p1 = { id: '9100000001', name: 'מיתוג ואתר תדמית', totalValue: 180000,
    dynamicTimeline: { from: iso(monthsFrom(now, -5)), to: iso(monthsFrom(now, 1)) },
    baselineTimeline: { from: iso(monthsFrom(now, -5)), to: iso(monthsFrom(now, 1)) } };
  projects.push(p1);
  for (let i = 0; i < 7; i++) {
    const done = i < 5;
    const wFrom = monthsFrom(now, -5 + i * 0.8);
    tasks.push(makeTask(rnd, now, {
      projectId: p1.id, name: pick(rnd, TASK_NAME_POOL), status: done ? 'בוצע' : 'בתהליך',
      weeklyFrom: wFrom, weeklyTo: daysFrom(wFrom, 5),
      history: done ? makeHistoryEntries(rnd, now, { fromDaysAgo: 150 - i * 20, toDaysAgo: 140 - i * 20, count: 3 }) : [],
    }));
  }

  // --- Project 2: regular financial project (no payment policy), shorter/still active ---
  const p2 = { id: '9100000002', name: 'קמפיין השקה דיגיטלי', totalValue: 95000,
    dynamicTimeline: { from: iso(monthsFrom(now, -3)), to: iso(monthsFrom(now, 2)) },
    baselineTimeline: { from: iso(monthsFrom(now, -3)), to: iso(monthsFrom(now, 2)) } };
  projects.push(p2);
  for (let i = 0; i < 6; i++) {
    const done = i < 2;
    const wFrom = monthsFrom(now, -1 + i * 0.4);
    tasks.push(makeTask(rnd, now, {
      projectId: p2.id, name: pick(rnd, TASK_NAME_POOL), status: done ? 'בוצע' : (i < 4 ? 'בתהליך' : null),
      weeklyFrom: wFrom, weeklyTo: daysFrom(wFrom, 6),
      history: done ? makeHistoryEntries(rnd, now, { fromDaysAgo: 60 - i * 10, toDaysAgo: 50 - i * 10, count: 2 }) : [],
    }));
  }

  // --- Project 3: milestone project, mixed trigger types, one pending confirmation ---
  const p3 = { id: '9100000003', name: "פלטפורמת הזמנות - שלב א'", totalValue: 420000,
    dynamicTimeline: { from: iso(monthsFrom(now, -6)), to: iso(monthsFrom(now, 1)) },
    baselineTimeline: { from: iso(monthsFrom(now, -6)), to: iso(monthsFrom(now, 1)) } };
  projects.push(p3);
  paymentPolicies.push({
    projectId: p3.id,
    hourBankSize: null,
    milestones: [
      { id: 'm1', note: 'תחילת עבודה', percent: 25, trigger: 'start', customDate: null, monthsAfterStart: null, timeConfirmed: true },
      { id: 'm2', note: 'אישור עיצוב', percent: 30, trigger: 'custom', customDate: iso(monthsFrom(now, -3)), monthsAfterStart: null, timeConfirmed: true },
      { id: 'm3', note: 'מסירה סופית', percent: 45, trigger: 'end', customDate: null, monthsAfterStart: 5, timeConfirmed: false },
    ],
  });
  for (let i = 0; i < 8; i++) {
    const done = i < 6;
    const wFrom = monthsFrom(now, -5 + i * 0.7);
    tasks.push(makeTask(rnd, now, {
      projectId: p3.id, name: pick(rnd, TASK_NAME_POOL), status: done ? 'בוצע' : 'בתהליך',
      weeklyFrom: wFrom, weeklyTo: daysFrom(wFrom, 5),
      history: done ? makeHistoryEntries(rnd, now, { fromDaysAgo: 170 - i * 18, toDaysAgo: 160 - i * 18, count: 3 }) : [],
    }));
  }
  scheduleChangeEvents.push({ projectId: p3.id, changedAt: daysFrom(now, -9).toISOString(), newEndDate: iso(monthsFrom(now, 1)) });

  // --- Project 4: hour-bank-only project - real work done, only the hour-bank still active ---
  const p4 = { id: '9100000004', name: 'מערכת ניהול מלאי', totalValue: 150000,
    dynamicTimeline: { from: iso(monthsFrom(now, -8)), to: iso(monthsFrom(now, -1)) },
    baselineTimeline: { from: iso(monthsFrom(now, -8)), to: iso(monthsFrom(now, -1)) } };
  projects.push(p4);
  paymentPolicies.push({
    projectId: p4.id,
    hourBankSize: 140,
    milestones: [
      { id: 'm1', note: 'מסירת מערכת', percent: 100, trigger: 'end', customDate: null, monthsAfterStart: null, timeConfirmed: true },
    ],
  });
  for (let i = 0; i < 5; i++) {
    const wFrom = monthsFrom(now, -7 + i);
    tasks.push(makeTask(rnd, now, {
      projectId: p4.id, name: pick(rnd, TASK_NAME_POOL), status: 'בוצע',
      weeklyFrom: wFrom, weeklyTo: daysFrom(wFrom, 5),
      history: makeHistoryEntries(rnd, now, { fromDaysAgo: 210 - i * 25, toDaysAgo: 200 - i * 25, count: 3 }),
    }));
  }
  // Hour-bank tasks - name MUST start with "בנק שעות" (matches the real prefix the frontend checks).
  tasks.push(makeTask(rnd, now, {
    projectId: p4.id, name: 'בנק שעות - תמיכה שוטפת', status: 'בתהליך', expectedHours: 140, hourlyRate: 180,
    weeklyFrom: daysFrom(now, -10), weeklyTo: daysFrom(now, 20),
    history: makeHistoryEntries(rnd, now, { fromDaysAgo: 25, toDaysAgo: 1, count: 4, hoursEach: 3 }),
  }));

  // --- Project 5: freelance/management-only project (should vanish from Expected-Volume) ---
  const p5 = { id: '9100000005', name: 'סרטון תדמית לרשתות', totalValue: 40000,
    dynamicTimeline: { from: iso(monthsFrom(now, -2)), to: iso(monthsFrom(now, 1)) },
    baselineTimeline: { from: iso(monthsFrom(now, -2)), to: iso(monthsFrom(now, 1)) } };
  projects.push(p5);
  for (let i = 0; i < 4; i++) {
    const wFrom = monthsFrom(now, -1 + i * 0.5);
    tasks.push(makeTask(rnd, now, {
      projectId: p5.id, name: pick(rnd, TASK_NAME_POOL), taskType: pick(rnd, FREELANCE_TYPES),
      status: i < 2 ? 'בוצע' : 'בתהליך',
      weeklyFrom: wFrom, weeklyTo: daysFrom(wFrom, 4),
      history: i < 2 ? makeHistoryEntries(rnd, now, { fromDaysAgo: 40 - i * 10, toDaysAgo: 30 - i * 10, count: 2 }) : [],
    }));
  }

  // --- Project 6: milestone project carrying the overrun task + the orphan-done task ---
  const p6 = { id: '9100000006', name: 'אפליקציית מובייל - MVP', totalValue: 300000,
    dynamicTimeline: { from: iso(monthsFrom(now, -4)), to: iso(monthsFrom(now, 2)) },
    baselineTimeline: { from: iso(monthsFrom(now, -4)), to: iso(monthsFrom(now, 2)) } };
  projects.push(p6);
  paymentPolicies.push({
    projectId: p6.id,
    hourBankSize: null,
    milestones: [
      { id: 'm1', note: 'תחילת פיתוח', percent: 40, trigger: 'start', customDate: null, monthsAfterStart: null, timeConfirmed: true },
      { id: 'm2', note: 'השקה', percent: 60, trigger: 'end', customDate: null, monthsAfterStart: null, timeConfirmed: true },
    ],
  });
  for (let i = 0; i < 6; i++) {
    const done = i < 4;
    const wFrom = monthsFrom(now, -3 + i * 0.6);
    tasks.push(makeTask(rnd, now, {
      projectId: p6.id, name: pick(rnd, TASK_NAME_POOL), status: done ? 'בוצע' : 'בתהליך',
      weeklyFrom: wFrom, weeklyTo: daysFrom(wFrom, 5),
      history: done ? makeHistoryEntries(rnd, now, { fromDaysAgo: 110 - i * 15, toDaysAgo: 100 - i * 15, count: 3 }) : [],
    }));
  }
  // Overrun task - small estimate, way more hours logged, still open (in-window).
  tasks.push(makeTask(rnd, now, {
    projectId: p6.id, name: 'אינטגרציית תשלומים', status: 'בתהליך', expectedHours: 8, hourlyRate: 200,
    weeklyFrom: daysFrom(now, -3), weeklyTo: daysFrom(now, 7),
    history: makeHistoryEntries(rnd, now, { fromDaysAgo: 12, toDaysAgo: 1, count: 5, hoursEach: 5 }),
  }));
  // "Orphan done" task - status 'בוצע', no logged hours, no weeklyTimeline.to - resolveCompletionDate
  // must fall back to the seeded task_status_history entry (added below).
  const orphanTask = makeTask(rnd, now, {
    projectId: p6.id, name: 'סקירת קוד - מודול תשלומים', status: 'בוצע', expectedHours: 6, hourlyRate: 190,
    weeklyFrom: null, weeklyTo: null, history: [],
  });
  tasks.push(orphanTask);
  taskDoneDates.push({ taskId: orphanTask.id, doneAt: daysFrom(now, -14).toISOString() });
  scheduleChangeEvents.push({ projectId: p6.id, changedAt: daysFrom(now, -20).toISOString(), newEndDate: iso(monthsFrom(now, 2)) });

  return { users: USERS, planningItems: projects, actualsItems: tasks, paymentPolicies, scheduleChangeEvents, taskDoneDates };
}

/** Shape dashboardService.js needs: no assignedUserIds on actualsItems (matches the real asymmetry). */
export function generateDashboardData(now = new Date()) {
  const { planningItems, actualsItems } = buildWorld(now);
  return {
    planningItems,
    actualsItems: actualsItems.map(({ assignedUserIds, ...rest }) => rest),
  };
}

/** Shape workloadService.js needs: includes users + assignedUserIds. */
export function generateWorkloadData(now = new Date()) {
  const { planningItems, actualsItems, users } = buildWorld(now);
  return { planningItems, actualsItems, users };
}
