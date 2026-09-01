import { readFileSync } from "node:fs";

import { afterAll, beforeAll, beforeEach } from "vitest";

import { pool } from "../db/index.js";

/*
 * Runs once per test file, before anything in it.
 *
 * The same schema.sql the real migration uses, so the tables under test can
 * never drift from the ones in production. Every statement in it is
 * CREATE ... IF NOT EXISTS, which is what makes re-running it harmless.
 */
beforeAll(async () => {
  const sql = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf-8");

  await pool.query(sql);
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
