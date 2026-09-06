import { logger } from "../config/logger.js";
import { applyMigrations } from "./apply-migrations.js";
import { pool } from "./index.js";

applyMigrations(pool)
  .then(async function () {
    logger.info("Migration complete");
    await pool.end();
  })
  .catch(function (err) {
    logger.error(err, "Migration failed");
    process.exit(1);
  });
