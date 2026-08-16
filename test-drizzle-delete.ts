import { db } from './src/db/index.ts';
import { kpiResults, works, assignments, overtimes, notifications } from './src/db/schema.ts';

async function test() {
  try {
    const res = await db.delete(kpiResults);
    console.log('Delete result:', res);
    const count = await db.query.kpiResults.findMany();
    console.log('remaining:', count.length);
  } catch (err) {
    console.error('Delete error:', err);
  }
  process.exit(0);
}
test();
