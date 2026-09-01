import { readFileSync } from "node:fs";

import { pool } from "./index.js";

async function migrate() {
  const sqlPath = new URL("./schema.sql", import.meta.url);
  const sql = readFileSync(sqlPath, "utf-8");

  await pool.query(sql);
  console.log("Migration complete");
  await pool.end();
}

migrate().catch(function (err) {
  console.error("Migration failed", err);
  process.exit(1);
});
