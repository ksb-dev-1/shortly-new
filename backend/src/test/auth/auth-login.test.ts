import type { Response } from "supertest";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import app from "../../app.js";
import { pool } from "../../db/index.js";
import { sendVerificationEmail } from "../../emails/send-verification-email.js";

vi.mock("../../emails/send-verification-email.js", () => ({
  sendVerificationEmail: vi.fn(),
}));

const sendVerificationEmailMock = vi.mocked(sendVerificationEmail);

const CREDENTIALS = {
  name: "Test User",
  email: "test@example.com",
  password: "Test1234!",
};

/** Signs up and verifies, leaving an account that is allowed to log in. */
async function createVerifiedUser() {
  await request(app).post("/api/v1/auth/signup").send(CREDENTIALS);

  const token = sendVerificationEmailMock.mock.calls[0]?.[2];

  if (!token) {
    throw new Error("Signup did not send a verification email");
  }

  await request(app).post("/api/v1/auth/verify-email").send({ token });
}

function login(body: { email: string; password: string }) {
  return request(app).post("/api/v1/auth/login").send(body);
}

/** The raw Set-Cookie string for one cookie, or undefined if absent. */
function cookie(response: Response, name: string) {
  const header = response.headers["set-cookie"] as unknown as
    | string[]
    | undefined;

  return header?.find((entry) => entry.startsWith(`${name}=`));
}

function cookieValue(response: Response, name: string) {
  return cookie(response, name)?.split(";")[0]?.split("=")[1];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/auth/login", () => {
  it("signs in a verified user and returns them without the hash", async () => {
    await createVerifiedUser();

    const response = await login(CREDENTIALS);

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      email: CREDENTIALS.email,
      name: CREDENTIALS.name,
      is_verified: true,
    });
    expect(response.body.user).not.toHaveProperty("password_hash");
  });

  it("sets both cookies, httpOnly, with the refresh one scoped to its route", async () => {
    await createVerifiedUser();

    const response = await login(CREDENTIALS);

    const access = cookie(response, "access_token");
    const refresh = cookie(response, "refresh_token");

    expect(access).toBeDefined();
    expect(refresh).toBeDefined();

    // httpOnly is what keeps browser JavaScript — and therefore any XSS — from
    // reading the session.
    expect(access).toContain("HttpOnly");
    expect(refresh).toContain("HttpOnly");

    // The refresh cookie is deliberately scoped so it is only ever sent to the
    // one endpoint that rotates it. Widening this path would mean the
    // long-lived credential rode along with every ordinary API call.
    expect(refresh).toContain("Path=/api/v1/auth/refresh");
    expect(access).toContain("Path=/");
  });

  it("stores the refresh token hashed, never the token itself", async () => {
    await createVerifiedUser();

    const response = await login(CREDENTIALS);
    const token = cookieValue(response, "refresh_token");

    const { rows } = await pool.query<{ token_hash: string }>(
      "SELECT token_hash FROM refresh_tokens",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.token_hash).toBeDefined();
    expect(rows[0]?.token_hash).not.toBe(token);
  });

  it("refuses an unverified account with 403", async () => {
    await request(app).post("/api/v1/auth/signup").send(CREDENTIALS);

    const response = await login(CREDENTIALS);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe(
      "Please verify your email before logging in",
    );
    expect(cookie(response, "access_token")).toBeUndefined();
  });

  it("rejects a wrong password with 401", async () => {
    await createVerifiedUser();

    const response = await login({
      email: CREDENTIALS.email,
      password: "WrongPassword1!",
    });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid email or password");
  });

  it("answers an unknown email exactly as it answers a wrong password", async () => {
    await createVerifiedUser();

    const wrongPassword = await login({
      email: CREDENTIALS.email,
      password: "WrongPassword1!",
    });

    const unknownEmail = await login({
      email: "nobody@example.com",
      password: CREDENTIALS.password,
    });

    // Identical status and message on purpose. If the two differed, anyone
    // could use this endpoint to find out which addresses hold accounts.
    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
  });

  it("checks the password before the verified flag", async () => {
    await request(app).post("/api/v1/auth/signup").send(CREDENTIALS);

    const response = await login({
      email: CREDENTIALS.email,
      password: "WrongPassword1!",
    });

    // 401, not 403: an unverified account with a bad password must not reveal
    // that the account exists and is merely unverified.
    expect(response.status).toBe(401);
  });

  it("issues no refresh token row when login fails", async () => {
    await createVerifiedUser();

    await login({ email: CREDENTIALS.email, password: "WrongPassword1!" });

    const { rows } = await pool.query("SELECT * FROM refresh_tokens");

    expect(rows).toHaveLength(0);
  });
});
