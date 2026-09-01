import request from "supertest";
import { describe, expect, it } from "vitest";

import app from "../app.js";
import { pool } from "../db/index.js";

/*
 * Nothing here tests a feature. It tests that the test setup itself works:
 * that the app can be imported without starting a server, that Supertest can
 * drive it, and that the container database is connected and empty.
 *
 * Worth keeping rather than deleting once real tests exist — when the whole
 * suite goes red, this is the file that says whether the problem is your code
 * or your database.
 */
describe("test environment", () => {
  it("serves the app without a listening server", async () => {
    const response = await request(app).get("/api/v1/definitely-not-a-route");

    expect(response.status).toBe(404);
  });

  it("is connected to the test database, not the real one", async () => {
    const { rows } = await pool.query<{ current_database: string }>(
      "SELECT current_database()",
    );

    expect(rows[0]?.current_database).toBe("shortly_test");
  });

  it("starts every test with empty tables", async () => {
    const { rows } = await pool.query<{ count: string }>(
      "SELECT count(*) FROM users",
    );

    expect(rows[0]?.count).toBe("0");
  });
});
