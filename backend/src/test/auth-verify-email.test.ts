import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import app from "../app.js";
import { pool } from "../db/index.js";
import { sendVerificationEmail } from "../emails/send-verification-email.js";

// Same stand-in as the signup tests. Here it earns its keep twice over: it
// stops the real email going out, and its recorded arguments are how a test
// gets hold of the verification token — the only other copy is a hash.
vi.mock("../emails/send-verification-email.js", () => ({
  sendVerificationEmail: vi.fn(),
}));

const sendVerificationEmailMock = vi.mocked(sendVerificationEmail);

const VALID_SIGNUP = {
  name: "Test User",
  email: "test@example.com",
  password: "Test1234!",
};

/** Signs up, then returns the token that would have been emailed. */
async function signupAndGetToken() {
  await request(app).post("/api/v1/auth/signup").send(VALID_SIGNUP);

  const firstCall = sendVerificationEmailMock.mock.calls[0];

  if (!firstCall) {
    throw new Error("Signup did not send a verification email");
  }

  return firstCall[2];
}

function verify(token: string) {
  return request(app).post("/api/v1/auth/verify-email").send({ token });
}

async function isVerified() {
  const { rows } = await pool.query<{ is_verified: boolean }>(
    "SELECT is_verified FROM users WHERE email = $1",
    [VALID_SIGNUP.email],
  );

  return rows[0]?.is_verified;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/auth/verify-email", () => {
  it("verifies the account with the emailed token", async () => {
    const token = await signupAndGetToken();

    expect(await isVerified()).toBe(false);

    const response = await verify(token);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(await isVerified()).toBe(true);
  });

  it("rejects a token that was never issued", async () => {
    await signupAndGetToken();

    const response = await verify("not-a-real-token");

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid verification link");
    expect(await isVerified()).toBe(false);
  });

  it("refuses to spend the same token twice", async () => {
    const token = await signupAndGetToken();

    await verify(token);
    const second = await verify(token);

    expect(second.status).toBe(400);
    expect(second.body.message).toBe(
      "This verification link has already been used",
    );

    // Still verified from the first attempt — a rejected replay must not
    // undo anything.
    expect(await isVerified()).toBe(true);
  });

  it("rejects a token that has expired", async () => {
    const token = await signupAndGetToken();

    // Tokens last 24 hours, so the only practical way to test the expiry
    // branch is to age the row. Reaching into the database is the point here
    // rather than a shortcut — there is no API that can produce this state.
    await pool.query(
      "UPDATE email_verification_tokens SET expires_at = now() - interval '1 hour'",
    );

    const response = await verify(token);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("This verification link has expired");
    expect(await isVerified()).toBe(false);
  });

  it("invalidates every outstanding token, not just the one used", async () => {
    const token = await signupAndGetToken();

    const { rows } = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE email = $1",
      [VALID_SIGNUP.email],
    );
    const userId = rows[0]!.id;

    // Stands in for the user having clicked "resend" before verifying, which
    // leaves a second live token on the account.
    await pool.query(
      `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '1 day')`,
      [userId, "a".repeat(64)],
    );

    await verify(token);

    // Both rows must now be spent. Leaving the older one live would mean a
    // link from an earlier email still worked after the account was verified.
    const { rows: tokens } = await pool.query<{ used_at: Date | null }>(
      "SELECT used_at FROM email_verification_tokens WHERE user_id = $1",
      [userId],
    );

    expect(tokens).toHaveLength(2);
    expect(tokens.every((row) => row.used_at !== null)).toBe(true);
  });

  it("rejects an empty token without reaching the database", async () => {
    const response = await verify("");

    // Caught by validate(verifyEmailSchema) on the route, before the
    // controller runs at all.
    expect(response.status).toBe(400);
  });
});
