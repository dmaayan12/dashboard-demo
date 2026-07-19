// Demo copy - returns the fictitious dataset instead of calling monday.com's GraphQL API.
// Same return shape as the real workloadService.js ({planningItems, actualsItems, users}).
import { generateWorkloadData } from './fakeData.js';

export async function getWorkloadData(env) {
  return generateWorkloadData();
}
