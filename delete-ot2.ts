import { db } from './src/db/index.ts';
import { overtimes } from './src/db/schema.ts';
async function run() {
  const res = await db.delete(overtimes);
  console.log("Deleted OT:", res);
  process.exit(0);
}
run();
