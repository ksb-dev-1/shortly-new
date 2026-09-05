import { afterAll, beforeAll, beforeEach } from "vitest";

import { applyMigrations } from "../db/apply-migrations.js";
import { pool } from "../db/index.js";

/*
 * Runs once per test file, before anything in it.
 *
 * The same migrations the real database is brought up with, so the tables
 * under test can never drift from the ones in production. Already-applied
 * migrations are skipped, so this is cheap on every file after the first.
 */
beforeAll(async () => {
  await applyMigrations(pool);
});

/*
 * Runs before every single test.
 *
 * Emptying users is enough to empty everything: links, clicks and all three
 * token tables reference it with ON DELETE CASCADE, and TRUNCATE ... CASCADE
 * follows those the same way a delete would.
 *
 * This is what lets each test assume it starts from nothing, so tests cannot
 * pass or fail based on what an earlier one happened to leave behind.
 */
beforeEach(async () => {
  await pool.query("TRUNCATE users RESTART IDENTITY CASCADE");
});

// Without this the pool keeps its connections open and the run never exits.
afterAll(async () => {
  await pool.end();
});
