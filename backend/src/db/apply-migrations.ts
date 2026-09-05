import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Pool } from "pg";

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

/*
 * Applies every *.sql file in src/db/migrations that schema_migrations
 * doesn't already have a row for, in filename order, each in its own
 * transaction. Safe to call repeatedly — already-applied files are skipped.
 *
 * Both the real migration (migrate.ts) and the test suite (test/setup.ts)
 * call this, so the tables under test can never drift from production ones.
 */
export async function applyMigrations(pool: Pool) {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const { rows } = await client.query<{ name: string }>(
      "SELECT name FROM schema_migrations",
    );
    const applied = new Set(rows.map((row) => row.name));

    const pending = readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort()
      .filter((file) => !applied.has(file));

    for (const file of pending) {
      const sql = readFileSync(path.join(migrationsDir, file), "utf-8");

      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
          file,
        ]);
        await client.query("COMMIT");
        console.log(`Applied migration ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    client.release();
  }
}
