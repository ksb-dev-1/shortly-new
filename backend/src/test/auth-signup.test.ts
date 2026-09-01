import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import app from "../app.js";
import { pool } from "../db/index.js";
import { sendVerificationEmail } from "../emails/send-verification-email.js";

/*
 * Replace the email module for this file.
 *
 * Signup calls sendVerificationEmail, which would talk to Resend. The key in
 * .env.test is fake so it would fail, and a real one would mean emailing
 * somebody on every test run. vi.mock swaps the module for a stand-in: the
 * controller calls it exactly as before and never knows.
 *
 * The stand-in also records its calls, which is how the tests below can assert
 * an email was sent, and — later, for verify-email — read the token straight
 * out of the arguments instead of needing an inbox.
 *
 * Vitest hoists this call above every import in the file, wherever it happens
 * to sit — which is why the import sorter shuffling it is harmless. The
 * hoisting is what makes it work at all: the mock has to be in place before
 * app.js pulls the real module in.
 */
vi.mock("../emails/send-verification-email.js", () => ({
  sendVerificationEmail: vi.fn(),
}));

const sendVerificationEmailMock = vi.mocked(sendVerificationEmail);

const VALID_SIGNUP = {
  name: "Test User",
  email: "test@example.com",
  password: "Test1234!",
};

beforeEach(() => {
  // The tables are emptied by src/test/setup.ts; this empties the record of
  // calls to the mock, so one test's email does not count towards the next.
  vi.clearAllMocks();
});

describe("POST /api/v1/auth/signup", () => {
  it("creates the account and returns it without the password", async () => {
    const response = await request(app)
      .post("/api/v1/auth/signup")
      .send(VALID_SIGNUP);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    expect(response.body.user).toMatchObject({
      name: "Test User",
      email: "test@example.com",
      is_verified: false,
    });

    // The response is built from an explicit RETURNING list. If someone later
    // changes it to SELECT *, this is the test that catches the hash leaking.
    expect(response.body.user).not.toHaveProperty("password_hash");
    expect(response.body.user).not.toHaveProperty("password");
  });

  it("stores the password hashed, never in plain text", async () => {
    await request(app).post("/api/v1/auth/signup").send(VALID_SIGNUP);

    const { rows } = await pool.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE email = $1",
      [VALID_SIGNUP.email],
    );

    expect(rows[0]?.password_hash).not.toBe(VALID_SIGNUP.password);
    // bcrypt hashes always start $2 — cheap proof it was actually hashed and
    // not merely encoded into something that looks different.
    expect(rows[0]?.password_hash).toMatch(/^\$2[aby]\$/);
  });

  it("sends exactly one verification email, carrying a token", async () => {
    await request(app).post("/api/v1/auth/signup").send(VALID_SIGNUP);

    expect(sendVerificationEmailMock).toHaveBeenCalledTimes(1);

    const [name, email, token] = sendVerificationEmailMock.mock.calls[0]!;

    expect(name).toBe("Test User");
    expect(email).toBe("test@example.com");
    expect(token).toEqual(expect.any(String));
    expect(token.length).toBeGreaterThan(20);
  });

  it("stores only the hash of the verification token, not the token", async () => {
    await request(app).post("/api/v1/auth/signup").send(VALID_SIGNUP);

    const [, , token] = sendVerificationEmailMock.mock.calls[0]!;

    const { rows } = await pool.query<{ token_hash: string }>(
      "SELECT token_hash FROM email_verification_tokens",
    );

    // Same principle as the password: what reaches the user's inbox is not what
    // sits in the database, so a leaked dump cannot verify anyone's account.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.token_hash).not.toBe(token);
  });

  it("normalises the email before storing it", async () => {
    await request(app)
      .post("/api/v1/auth/signup")
      .send({ ...VALID_SIGNUP, email: "  TEST@Example.COM  " });

    const { rows } = await pool.query<{ email: string }>(
      "SELECT email FROM users",
    );

    // The schema trims and lowercases, which is what stops the same person
    // registering twice with different capitalisation.
    expect(rows[0]?.email).toBe("test@example.com");
  });

  it("rejects a second signup with the same email", async () => {
    await request(app).post("/api/v1/auth/signup").send(VALID_SIGNUP);

    const response = await request(app)
      .post("/api/v1/auth/signup")
      .send(VALID_SIGNUP);

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("Email already exists");

    // The duplicate must not have sent a second email.
    expect(sendVerificationEmailMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a password that fails the rules", async () => {
    const response = await request(app)
      .post("/api/v1/auth/signup")
      .send({ ...VALID_SIGNUP, password: "weak" });

    expect(response.status).toBe(400);

    // Nothing should have been written, and nobody emailed.
    const { rows } = await pool.query("SELECT * FROM users");

    expect(rows).toHaveLength(0);
    expect(sendVerificationEmailMock).not.toHaveBeenCalled();
  });
});
