import { buildWorld, generateDashboardData, generateWorkloadData } from './src/fakeData.js';

const now = new Date();
const world = buildWorld(now);

console.log('=== Basic counts ===');
console.log('projects:', world.planningItems.length);
console.log('tasks:', world.actualsItems.length);
console.log('users:', world.users.length);
console.log('paymentPolicies:', world.paymentPolicies.length);
console.log('scheduleChangeEvents:', world.scheduleChangeEvents.length);
console.log('taskDoneDates:', world.taskDoneDates.length);

console.log('\n=== Shape check: planningItems[0] ===');
console.log(JSON.stringify(world.planningItems[0], null, 2));

console.log('\n=== Shape check: actualsItems[0] ===');
console.log(JSON.stringify(world.actualsItems[0], null, 2));

console.log('\n=== Scenario coverage ===');
const byProject = new Map();
world.actualsItems.forEach((t) => {
  const pid = t.linkedItems[0].id;
  if (!byProject.has(pid)) byProject.set(pid, []);
  byProject.get(pid).push(t);
});
world.planningItems.forEach((p) => {
  const tasks = byProject.get(p.id) || [];
  const policy = world.paymentPolicies.find((pp) => pp.projectId === p.id);
  console.log(`- ${p.name} (${p.id}): ${tasks.length} tasks, totalValue=${p.totalValue}, policy=${policy ? `${policy.milestones.length} milestones, hourBank=${policy.hourBankSize}` : 'none (regular)'}`);
});

const overrun = world.actualsItems.find((t) => {
  const logged = (t.history || []).reduce((s, h) => s + h.durationInSeconds / 3600, 0);
  return logged > t.expectedHours && t.expectedHours > 0;
});
console.log('\nOverrun task found:', overrun ? `${overrun.name} (${overrun.expectedHours}h expected)` : 'NONE - PROBLEM');

const orphan = world.actualsItems.find((t) => t.status === 'בוצע' && (t.history || []).length === 0 && !t.weeklyTimeline?.to);
console.log('Orphan-done task found:', orphan ? orphan.name : 'NONE - PROBLEM');
console.log('Orphan task has a taskDoneDates entry:', orphan ? world.taskDoneDates.some((d) => d.taskId === orphan.id) : 'n/a');

const hourBankTasks = world.actualsItems.filter((t) => t.name.startsWith('בנק שעות'));
console.log('Hour-bank tasks found:', hourBankTasks.length);

const freelanceOnly = world.planningItems.filter((p) => {
  const tasks = byProject.get(p.id) || [];
  return tasks.length > 0 && tasks.every((t) => ['פרילאנס', 'ניהול'].includes(t.taskType));
});
console.log('Freelance/management-only projects:', freelanceOnly.map((p) => p.name));

console.log('\n=== dashboardService shape (no assignedUserIds) ===');
const dd = generateDashboardData(now);
console.log('has assignedUserIds on actualsItems[0]:', 'assignedUserIds' in dd.actualsItems[0], '(should be false)');

console.log('\n=== workloadService shape (has users + assignedUserIds) ===');
const wd = generateWorkloadData(now);
console.log('has users:', Array.isArray(wd.users) && wd.users.length > 0);
console.log('has assignedUserIds on actualsItems[0]:', 'assignedUserIds' in wd.actualsItems[0], '(should be true)');

console.log('\n=== Determinism check (same seed = same output across calls) ===');
const world2 = buildWorld(new Date());
console.log('Same first task name across two calls:', world.actualsItems[0].name === world2.actualsItems[0].name);
console.log('Same project count:', world.planningItems.length === world2.planningItems.length);
