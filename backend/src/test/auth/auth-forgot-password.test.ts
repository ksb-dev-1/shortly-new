import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import app from "../../app.js";
import { pool } from "../../db/index.js";
import { CREDENTIALS, createVerifiedUser, resetMock, signup } from "../helpers.js";

vi.mock("../../emails/send-verification-email.js", () => ({
  sendVerificationEmail: vi.fn(),
}));

vi.mock("../../emails/send-password-reset-email.js", () => ({
  sendPasswordResetEmail: vi.fn(),
}));

const GENERIC = "If an account exists for that email, a reset link has been sent";

function forgot(email = CREDENTIALS.email) {
  return request(app).post("/api/v1/auth/forgot-password").send({ email });
}

async function resetTokenCount() {
  const { rows } = await pool.query<{ count: string }>(
    "SELECT count(*) FROM password_reset_tokens",
  );

  return Number(rows[0]?.count);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/auth/forgot-password", () => {
  it("emails a reset link to a known address", async () => {
    await createVerifiedUser();
    vi.clearAllMocks();

    const response = await forgot();

    expect(response.status).toBe(200);
    expect(response.body.message).toBe(GENERIC);
    expect(resetMock()).toHaveBeenCalledTimes(1);
    expect(await resetTokenCount()).toBe(1);
  });

  it("answers identically for an address with no account", async () => {
    const response = await forgot("nobody@example.com");

    // Same wording and status as the success case. A different answer here
    // would turn the endpoint into an account-enumeration tool.
    expect(response.status).toBe(200);
    expect(response.body.message).toBe(GENERIC);
    expect(resetMock()).not.toHaveBeenCalled();
    expect(await resetTokenCount()).toBe(0);
  });

  it("works for an unverified account too", async () => {
    await signup();

    const response = await forgot();

    // Unlike login, resetting does not require a verified address — someone
    // who signed up and forgot their password immediately is not locked out.
    expect(response.status).toBe(200);
    expect(resetMock()).toHaveBeenCalledTimes(1);
  });

  it("stores only the hash of the reset token", async () => {
    await createVerifiedUser();
    vi.clearAllMocks();

    await forgot();

    const emailed = resetMock().mock.calls[0]?.[2];

    const { rows } = await pool.query<{ token_hash: string }>(
      "SELECT token_hash FROM password_reset_tokens",
    );

    expect(rows[0]?.token_hash).not.toBe(emailed);
  });

  it("stops after three requests in the window, silently", async () => {
    await createVerifiedUser();
    vi.clearAllMocks();

    await forgot();
    await forgot();
    await forgot();

    expect(resetMock()).toHaveBeenCalledTimes(3);

    const response = await forgot();

    expect(response.status).toBe(200);
    expect(response.body.message).toBe(GENERIC);
    expect(resetMock()).toHaveBeenCalledTimes(3);
  });

  it("lets the window pass and then sends again", async () => {
    await createVerifiedUser();
    vi.clearAllMocks();

    await forgot();
    await forgot();
    await forgot();

    await pool.query(
      "UPDATE password_reset_tokens SET created_at = now() - interval '2 hours'",
    );

    await forgot();

    expect(resetMock()).toHaveBeenCalledTimes(4);
  });

  it("rejects a malformed email before doing any work", async () => {
    const response = await forgot("not-an-email");

    expect(response.status).toBe(400);
    expect(resetMock()).not.toHaveBeenCalled();
  });
});
