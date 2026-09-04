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

async function createVerifiedUser() {
  await request(app).post("/api/v1/auth/signup").send(CREDENTIALS);

  const token = sendVerificationEmailMock.mock.calls[0]?.[2];

  if (!token) {
    throw new Error("Signup did not send a verification email");
  }

  await request(app).post("/api/v1/auth/verify-email").send({ token });
}

/**
 * The refresh cookie as a `name=value` pair, ready to send back.
 *
 * Supertest does not keep a cookie jar between requests the way a browser
 * does, so each test carries the session forward by hand. That is more
 * honest here anyway: these tests are about which token is presented, and
 * doing it explicitly makes the old-versus-new distinction visible.
 */
function refreshCookieOf(response: Response) {
  const header = response.headers["set-cookie"] as unknown as
    | string[]
    | undefined;

  const raw = header?.find((entry) => entry.startsWith("refresh_token="));

  if (!raw) {
    throw new Error("Response set no refresh_token cookie");
  }

  return raw.split(";")[0]!;
}

function loginAndGetCookie() {
  return request(app)
    .post("/api/v1/auth/login")
    .send({ email: CREDENTIALS.email, password: CREDENTIALS.password })
    .then(refreshCookieOf);
}

function refreshWith(cookie: string) {
  return request(app).post("/api/v1/auth/refresh").set("Cookie", cookie);
}

async function tokenCounts() {
  const { rows } = await pool.query<{ total: string; active: string }>(
    `SELECT count(*) AS total,
            count(*) FILTER (WHERE revoked_at IS NULL) AS active
     FROM refresh_tokens`,
  );

  return { total: Number(rows[0]?.total), active: Number(rows[0]?.active) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/auth/refresh", () => {
  it("rotates the refresh token, issuing a different one", async () => {
    await createVerifiedUser();
    const original = await loginAndGetCookie();

    const response = await refreshWith(original);

    expect(response.status).toBe(200);

    const rotated = refreshCookieOf(response);

    // A rotation that handed back the same token would be no rotation at all.
    expect(rotated).not.toBe(original);
  });

  it("revokes the old row and stores the new one", async () => {
    await createVerifiedUser();
    const original = await loginAndGetCookie();

    expect(await tokenCounts()).toEqual({ total: 1, active: 1 });

    await refreshWith(original);

    // The spent token is kept rather than deleted. That is the whole basis of
    // reuse detection: a row that is gone cannot be recognised if it comes
    // back, but a row marked revoked can.
    expect(await tokenCounts()).toEqual({ total: 2, active: 1 });
  });

  it("treats a replayed token as theft and kills every session", async () => {
    await createVerifiedUser();

    // Two browsers signed in to the same account.
    const browserA = await loginAndGetCookie();
    const browserB = await loginAndGetCookie();

    expect(await tokenCounts()).toEqual({ total: 2, active: 2 });

    // A refreshes normally and moves on to a new token.
    const browserANew = refreshCookieOf(await refreshWith(browserA));

    expect(await tokenCounts()).toEqual({ total: 3, active: 2 });

    // Now A's *old* token is presented again. Only two things can cause that:
    // the token leaked, or it was captured and replayed. The legitimate holder
    // has already moved on to the replacement, so the request is treated as
    // theft rather than as a mistake.
    const replay = await refreshWith(browserA);

    expect(replay.status).toBe(401);
    expect(replay.body.message).toBe("Refresh token reuse detected");

    // Every session on the account is revoked — including browser B, which did
    // nothing wrong. That is the intended trade: the account is possibly
    // compromised, so signing everyone out is cheaper than being wrong.
    expect(await tokenCounts()).toEqual({ total: 3, active: 0 });

    // And both of them really are dead now.
    expect((await refreshWith(browserANew)).status).toBe(401);
    expect((await refreshWith(browserB)).status).toBe(401);
  });

  it("rejects a request with no refresh cookie", async () => {
    const response = await request(app).post("/api/v1/auth/refresh");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Unauthorized");
  });

  it("rejects a token that was never issued, without reporting reuse", async () => {
    await createVerifiedUser();
    await loginAndGetCookie();

    const response = await refreshWith("refresh_token=made-up-value");

    expect(response.status).toBe(401);

    // "Unauthorized", not "reuse detected" — an unknown token says nothing
    // about the account, so no sessions may be revoked on the strength of it.
    expect(response.body.message).toBe("Unauthorized");
    expect(await tokenCounts()).toEqual({ total: 1, active: 1 });
  });

  it("rejects an expired refresh token", async () => {
    await createVerifiedUser();
    const cookie = await loginAndGetCookie();

    // Refresh tokens last 7 days; ageing the row is the only way to reach the
    // expiry branch.
    await pool.query(
      "UPDATE refresh_tokens SET expires_at = now() - interval '1 hour'",
    );

    const response = await refreshWith(cookie);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Refresh token expired");
  });
});
