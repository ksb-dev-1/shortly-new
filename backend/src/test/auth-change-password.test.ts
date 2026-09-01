import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import app from "../app.js";
import { pool } from "../db/index.js";
import {
  CREDENTIALS,
  cookie,
  createVerifiedUser,
  login,
  resetTokenAt,
  sessionCookies,
  userIdOf,
} from "./helpers.js";

vi.mock("../emails/send-verification-email.js", () => ({
  sendVerificationEmail: vi.fn(),
}));

vi.mock("../emails/send-password-reset-email.js", () => ({
  sendPasswordResetEmail: vi.fn(),
}));

const NEW_PASSWORD = "Changed123!";

function changePassword(
  cookies: string,
  body: { currentPassword: string; newPassword: string },
) {
  return request(app)
    .post("/api/v1/auth/change-password")
    .set("Cookie", cookies)
    .send(body);
}

async function activeTokenCount() {
  const { rows } = await pool.query<{ count: string }>(
    "SELECT count(*) FROM refresh_tokens WHERE revoked_at IS NULL",
  );

  return Number(rows[0]?.count);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/auth/change-password", () => {
  it("changes the password and lets the user log in with the new one", async () => {
    await createVerifiedUser();
    const cookies = sessionCookies(await login());

    const response = await changePassword(cookies, {
      currentPassword: CREDENTIALS.password,
      newPassword: NEW_PASSWORD,
    });

    expect(response.status).toBe(200);

    expect((await login(CREDENTIALS.email, NEW_PASSWORD)).status).toBe(200);
    expect((await login(CREDENTIALS.email, CREDENTIALS.password)).status).toBe(
      401,
    );
  });

  it("answers 403 for a wrong current password, never 401", async () => {
    await createVerifiedUser();
    const cookies = sessionCookies(await login());

    const response = await changePassword(cookies, {
      currentPassword: "NotMyPassword1!",
      newPassword: NEW_PASSWORD,
    });

    /*
     * 403 is load-bearing. requireAuth already passed, so the session is fine
     * — what failed is the extra proof this action demands. A 401 would
     * collide with "access token expired", which the frontend answers by
     * rotating the refresh token and retrying, so a typo would silently burn a
     * rotation and cost two attempts against the rate limiter.
     */
    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Current password is incorrect");

    // And nothing changed.
    expect((await login()).status).toBe(200);
  });

  it("requires a session at all", async () => {
    await createVerifiedUser();

    const response = await request(app)
      .post("/api/v1/auth/change-password")
      .send({
        currentPassword: CREDENTIALS.password,
        newPassword: NEW_PASSWORD,
      });

    expect(response.status).toBe(401);
  });

  it("revokes every session, including the caller's own", async () => {
    await createVerifiedUser();
    const first = sessionCookies(await login());
    await login();
    await login();

    expect(await activeTokenCount()).toBe(3);

    await changePassword(first, {
      currentPassword: CREDENTIALS.password,
      newPassword: NEW_PASSWORD,
    });

    /*
     * Three revoked, one issued. The caller's own session is revoked with the
     * rest because the refresh cookie is scoped to /api/v1/auth/refresh and
     * never reaches this endpoint — the server cannot tell which stored row
     * belongs to the browser asking. Revoking all and minting a replacement
     * reaches the same end state.
     */
    expect(await activeTokenCount()).toBe(1);
  });

  it("hands the caller a working replacement session", async () => {
    await createVerifiedUser();
    const cookies = sessionCookies(await login());

    const response = await changePassword(cookies, {
      currentPassword: CREDENTIALS.password,
      newPassword: NEW_PASSWORD,
    });

    expect(cookie(response, "access_token")).toBeDefined();
    expect(cookie(response, "refresh_token")).toBeDefined();

    // The new refresh token works, so the browser that changed the password
    // stays signed in.
    const refreshed = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", sessionCookies(response));

    expect(refreshed.status).toBe(200);
  });

  it("signs other devices out at their next refresh", async () => {
    await createVerifiedUser();
    const mine = sessionCookies(await login());
    const other = sessionCookies(await login());

    await changePassword(mine, {
      currentPassword: CREDENTIALS.password,
      newPassword: NEW_PASSWORD,
    });

    const refreshed = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", other);

    expect(refreshed.status).toBe(401);
  });

  it("spends any outstanding reset link", async () => {
    await createVerifiedUser();
    const cookies = sessionCookies(await login());

    // The user asked for a reset email, then changed the password from inside
    // the app instead. The emailed link sets a password they no longer chose.
    await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: CREDENTIALS.email });

    const emailedToken = resetTokenAt(0);

    await changePassword(cookies, {
      currentPassword: CREDENTIALS.password,
      newPassword: NEW_PASSWORD,
    });

    const used = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: emailedToken, password: "Another123!" });

    expect(used.status).toBe(400);
    expect(used.body.message).toBe("This reset link has already been used");
  });

  it("rejects a new password identical to the current one", async () => {
    await createVerifiedUser();
    const cookies = sessionCookies(await login());

    const response = await changePassword(cookies, {
      currentPassword: CREDENTIALS.password,
      newPassword: CREDENTIALS.password,
    });

    expect(response.status).toBe(400);
  });

  it("enforces the password rules on the new password", async () => {
    await createVerifiedUser();
    const cookies = sessionCookies(await login());

    const response = await changePassword(cookies, {
      currentPassword: CREDENTIALS.password,
      newPassword: "weak",
    });

    expect(response.status).toBe(400);
  });

  it("stores the new password hashed", async () => {
    await createVerifiedUser();
    const cookies = sessionCookies(await login());
    const userId = await userIdOf();

    await changePassword(cookies, {
      currentPassword: CREDENTIALS.password,
      newPassword: NEW_PASSWORD,
    });

    const { rows } = await pool.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1",
      [userId],
    );

    expect(rows[0]?.password_hash).not.toBe(NEW_PASSWORD);
    expect(rows[0]?.password_hash).toMatch(/^\$2[aby]\$/);
  });
});
