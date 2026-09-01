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

const NEW_PASSWORD = "BrandNew1!";

function reset(token: string, password = NEW_PASSWORD) {
  return request(app)
    .post("/api/v1/auth/reset-password")
    .send({ token, password });
}

/** Creates a verified user and returns a live reset token for them. */
async function requestReset() {
  await createVerifiedUser();
  await request(app)
    .post("/api/v1/auth/forgot-password")
    .send({ email: CREDENTIALS.email });

  return resetTokenAt(0);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/auth/reset-password", () => {
  it("sets the new password and lets the user log in with it", async () => {
    const token = await requestReset();

    const response = await reset(token);

    expect(response.status).toBe(200);

    const signedIn = await login(CREDENTIALS.email, NEW_PASSWORD);

    expect(signedIn.status).toBe(200);
  });

  it("makes the old password stop working", async () => {
    const token = await requestReset();

    await reset(token);

    const withOld = await login(CREDENTIALS.email, CREDENTIALS.password);

    expect(withOld.status).toBe(401);
  });

  it("refuses to spend the same link twice", async () => {
    const token = await requestReset();

    await reset(token);
    const second = await reset(token, "Different1!");

    expect(second.status).toBe(400);
    expect(second.body.message).toBe("This reset link has already been used");

    // And the second password was not applied.
    const attempt = await login(CREDENTIALS.email, "Different1!");
    expect(attempt.status).toBe(401);
  });

  it("rejects a token that was never issued", async () => {
    await requestReset();

    const response = await reset("not-a-real-token");

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid reset link");
  });

  it("rejects an expired link", async () => {
    const token = await requestReset();

    // Reset links last an hour, so the row has to be aged to reach the branch.
    await pool.query(
      "UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute'",
    );

    const response = await reset(token);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("This reset link has expired");
  });

  it("spends every outstanding reset link, not just the one used", async () => {
    const token = await requestReset();
    const userId = await userIdOf();

    // A second live link, as though the user asked twice.
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '1 hour')`,
      [userId, "b".repeat(64)],
    );

    await reset(token);

    const { rows } = await pool.query<{ used_at: Date | null }>(
      "SELECT used_at FROM password_reset_tokens",
    );

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.used_at !== null)).toBe(true);
  });

  it("enforces the password rules on the new password", async () => {
    const token = await requestReset();

    const response = await reset(token, "weak");

    expect(response.status).toBe(400);

    // And the link is still usable, since nothing was spent.
    const retry = await reset(token);
    expect(retry.status).toBe(200);
  });

  it("signs every existing session out", async () => {
    await createVerifiedUser();
    const first = sessionCookies(await login());
    const second = sessionCookies(await login());

    await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: CREDENTIALS.email });

    await reset(resetTokenAt(0));

    /*
     * Resetting a password is what someone does when they believe another
     * person is in their account, so every refresh token is revoked — the
     * same reasoning as change-password. Leaving a session alive would defeat
     * the point of the reset.
     */
    expect(
      (
        await request(app)
          .post("/api/v1/auth/refresh")
          .set("Cookie", first)
      ).status,
    ).toBe(401);

    expect(
      (
        await request(app)
          .post("/api/v1/auth/refresh")
          .set("Cookie", second)
      ).status,
    ).toBe(401);
  });

  it("clears the cookies of the browser that reset it", async () => {
    const token = await requestReset();

    const response = await reset(token);

    // The response says "please log in again", and the cookies are cleared to
    // match — this browser is not handed a replacement session the way
    // change-password does, because whoever reset the password may not be the
    // person holding this browser's old cookies.
    expect(cookie(response, "access_token")).toContain("access_token=;");
    expect(cookie(response, "refresh_token")).toContain("refresh_token=;");
  });
});
