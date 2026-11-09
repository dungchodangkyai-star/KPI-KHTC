import { db } from "./src/db/index.ts";
import { categories } from "./src/db/schema.ts";
import { DEFAULT_TASKS } from "./src/utils.ts";

async function run() {
  let order = 1;
  for (const [group, tasks] of Object.entries(DEFAULT_TASKS)) {
    for (const task of tasks) {
      await db.insert(categories).values({
        code: task.code,
        name: task.name,
        type: 'TASK',
        properties: {
          taskGroup: group,
          score: task.score,
          nature: task.nature,
          productType: task.productType,
          unit: task.unit
        },
        status: 'Đang dùng',
        order: order++
      }).onConflictDoNothing();
    }
  }
  console.log("Tasks seeded successfully.");
  process.exit(0);
}

run().catch(console.error);
