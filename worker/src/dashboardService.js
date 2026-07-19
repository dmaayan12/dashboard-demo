// Demo copy - returns the fictitious dataset instead of calling monday.com's GraphQL API.
// Same return shape as the real dashboardService.js ({planningItems, actualsItems}), so the
// copied frontend needs zero changes to consume it.
import { generateDashboardData } from './fakeData.js';

export async function getDashboardData(env) {
  return generateDashboardData();
}
