import type { Response } from "supertest";
import request from "supertest";
import { vi } from "vitest";

import app from "../app.js";
import { pool } from "../db/index.js";
import { sendPasswordResetEmail } from "../emails/send-password-reset-email.js";
import { sendVerificationEmail } from "../emails/send-verification-email.js";

/*
 * Shared setup for the auth-dependent test files.
 *
 * IMPORTANT: this module cannot do the mocking itself — vi.mock is scoped to
 * the test file that calls it. Any file using createVerifiedUser() must declare
 * its own:
 *
 *   vi.mock("../emails/send-verification-email.js", () => ({
 *     sendVerificationEmail: vi.fn(),
 *   }));
 *
 * The helpers below then see the mocked module, because both resolve the same
 * specifier. Without it the real Resend client runs and the test hangs or
 * throws on the fake API key.
 */

export const CREDENTIALS = {
  name: "Test User",
  email: "test@example.com",
  password: "Test1234!",
};

export const verificationMock = () => vi.mocked(sendVerificationEmail);
export const resetMock = () => vi.mocked(sendPasswordResetEmail);

/** The token from the nth verification email sent so far. */
export function verificationTokenAt(index = 0) {
  const call = verificationMock().mock.calls[index];

  if (!call) {
    throw new Error(`No verification email at index ${index}`);
  }

  return call[2];
}

/** The token from the nth password-reset email sent so far. */
export function resetTokenAt(index = 0) {
  const call = resetMock().mock.calls[index];

  if (!call) {
    throw new Error(`No reset email at index ${index}`);
  }

  return call[2];
}

export function signup(overrides: Partial<typeof CREDENTIALS> = {}) {
  return request(app)
    .post("/api/v1/auth/signup")
    .send({ ...CREDENTIALS, ...overrides });
}

export function login(email = CREDENTIALS.email, password = CREDENTIALS.password) {
  return request(app).post("/api/v1/auth/login").send({ email, password });
}

/** Signs up and verifies, leaving an account that may log in. */
export async function createVerifiedUser(
  overrides: Partial<typeof CREDENTIALS> = {},
) {
  const before = verificationMock().mock.calls.length;

  await signup(overrides);

  const token = verificationTokenAt(before);

  await request(app).post("/api/v1/auth/verify-email").send({ token });
}

/** One cookie's raw Set-Cookie string, or undefined. */
export function cookie(response: Response, name: string) {
  const header = response.headers["set-cookie"] as unknown as
    | string[]
    | undefined;

  return header?.find((entry) => entry.startsWith(`${name}=`));
}

export function cookieValue(response: Response, name: string) {
  return cookie(response, name)?.split(";")[0]?.split("=")[1];
}

/**
 * Both auth cookies as one Cookie header value.
 *
 * Supertest keeps no cookie jar between requests, so a signed-in session is
 * carried forward by hand.
 */
export function sessionCookies(response: Response) {
  const header = response.headers["set-cookie"] as unknown as
    | string[]
    | undefined;

  if (!header) {
    throw new Error("Response set no cookies");
  }

  return header.map((entry) => entry.split(";")[0]).join("; ");
}

/** Signs up, verifies, logs in, and hands back the cookie header to reuse. */
export async function signedInSession(
  overrides: Partial<typeof CREDENTIALS> = {},
) {
  await createVerifiedUser(overrides);

  const response = await login(
    overrides.email ?? CREDENTIALS.email,
    overrides.password ?? CREDENTIALS.password,
  );

  return sessionCookies(response);
}

export async function userIdOf(email = CREDENTIALS.email) {
  const { rows } = await pool.query<{ id: string }>(
    "SELECT id FROM users WHERE email = $1",
    [email],
  );

  if (!rows[0]) {
    throw new Error(`No user with email ${email}`);
  }

  return rows[0].id;
}

/**
 * Waits for a condition that a fire-and-forget query will satisfy shortly.
 *
 * The redirect records its click without awaiting the insert, so the response
 * can arrive before the row exists. Polling briefly is the honest way to test
 * that, rather than pretending the write is synchronous.
 */
export async function eventually(
  check: () => Promise<boolean>,
  timeoutMs = 2000,
) {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    if (await check()) {
      return;
    }

    if (Date.now() > deadline) {
      throw new Error("Condition was not met in time");
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
