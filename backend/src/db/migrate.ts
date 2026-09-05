import { applyMigrations } from "./apply-migrations.js";
import { pool } from "./index.js";

applyMigrations(pool)
  .then(async function () {
    console.log("Migration complete");
    await pool.end();
  })
  .catch(function (err) {
    console.error("Migration failed", err);
    process.exit(1);
  });
