import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import app from "../app.js";
import { pool } from "../db/index.js";
import {
  CREDENTIALS,
  cookie,
  createVerifiedUser,
  login,
  sessionCookies,
} from "./helpers.js";

vi.mock("../emails/send-verification-email.js", () => ({
  sendVerificationEmail: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

async function activeTokenCount() {
  const { rows } = await pool.query<{ count: string }>(
    "SELECT count(*) FROM refresh_tokens WHERE revoked_at IS NULL",
  );

  return Number(rows[0]?.count);
}

describe("POST /api/v1/auth/logout", () => {
  it("revokes the session it was called with", async () => {
    await createVerifiedUser();
    const cookies = sessionCookies(await login());

    expect(await activeTokenCount()).toBe(1);

    const response = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", cookies);

    expect(response.status).toBe(200);
    expect(await activeTokenCount()).toBe(0);
  });

  it("leaves other sessions signed in", async () => {
    await createVerifiedUser();
    const first = sessionCookies(await login());
    await login();

    expect(await activeTokenCount()).toBe(2);

    await request(app).post("/api/v1/auth/logout").set("Cookie", first);

    // Logging out of one browser must not sign the account out everywhere.
    expect(await activeTokenCount()).toBe(1);
  });

  it("clears both cookies", async () => {
    await createVerifiedUser();
    const cookies = sessionCookies(await login());

    const response = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", cookies);

    // clearCookie sets them to empty with an expiry in the past.
    expect(cookie(response, "access_token")).toContain("access_token=;");
    expect(cookie(response, "refresh_token")).toContain("refresh_token=;");
  });

  it("succeeds even with no session at all", async () => {
    const response = await request(app).post("/api/v1/auth/logout");

    // Logging out is idempotent by design: someone whose cookie already
    // expired should still end up signed out rather than seeing an error.
    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Logged out");
  });

  it("cannot be used to revoke a token that is already spent", async () => {
    await createVerifiedUser();
    const cookies = sessionCookies(await login());

    await request(app).post("/api/v1/auth/logout").set("Cookie", cookies);
    const second = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", cookies);

    expect(second.status).toBe(200);
    expect(await activeTokenCount()).toBe(0);
  });

  it("ends the session for real: the refresh token no longer works", async () => {
    await createVerifiedUser();
    const loginResponse = await login(CREDENTIALS.email, CREDENTIALS.password);
    const cookies = sessionCookies(loginResponse);

    await request(app).post("/api/v1/auth/logout").set("Cookie", cookies);

    const refreshed = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookies);

    // A revoked token presented again reads as reuse, which is the correct
    // reading: the only holder who should have it has explicitly given it up.
    expect(refreshed.status).toBe(401);
  });
});
