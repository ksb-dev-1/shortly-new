import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import app from "../../app.js";
import { pool } from "../../db/index.js";
import {
  CREDENTIALS,
  createVerifiedUser,
  signup,
  verificationMock,
  verificationTokenAt,
} from "../helpers.js";

vi.mock("../../emails/send-verification-email.js", () => ({
  sendVerificationEmail: vi.fn(),
}));

const GENERIC = "If an account needs verification, a new link has been sent";

function resend(email = CREDENTIALS.email) {
  return request(app).post("/api/v1/auth/resend-verification").send({ email });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/auth/resend-verification", () => {
  it("sends a fresh link to an unverified account", async () => {
    await signup();
    expect(verificationMock()).toHaveBeenCalledTimes(1);

    const response = await resend();

    expect(response.status).toBe(200);
    expect(response.body.message).toBe(GENERIC);
    expect(verificationMock()).toHaveBeenCalledTimes(2);

    // The new token must differ from the signup one, or "resend" would just be
    // re-emailing a link the user may already have lost.
    expect(verificationTokenAt(1)).not.toBe(verificationTokenAt(0));
  });

  it("invalidates the previous link when it issues a new one", async () => {
    await signup();
    const original = verificationTokenAt(0);

    await resend();

    // The older link is spent the moment a replacement is sent, so an email
    // sitting in the inbox from ten minutes ago cannot still be used.
    const verified = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ token: original });

    expect(verified.status).toBe(400);
    expect(verified.body.message).toBe(
      "This verification link has already been used",
    );
  });

  it("the newest link does work", async () => {
    await signup();
    await resend();

    const verified = await request(app)
      .post("/api/v1/auth/verify-email")
      .send({ token: verificationTokenAt(1) });

    expect(verified.status).toBe(200);
  });

  it("answers identically for an address with no account", async () => {
    const response = await resend("nobody@example.com");

    // Same status and wording as the success case: otherwise this endpoint
    // becomes a way to ask which addresses are registered.
    expect(response.status).toBe(200);
    expect(response.body.message).toBe(GENERIC);
    expect(verificationMock()).not.toHaveBeenCalled();
  });

  it("answers identically for an account that is already verified", async () => {
    await createVerifiedUser();
    vi.clearAllMocks();

    const response = await resend();

    expect(response.status).toBe(200);
    expect(response.body.message).toBe(GENERIC);
    // Nothing sent — the account has nothing left to verify.
    expect(verificationMock()).not.toHaveBeenCalled();
  });

  it("stops after three emails in the window, still without saying so", async () => {
    await signup();

    // Signup already sent one; two more reach the cap of three per hour.
    await resend();
    await resend();

    expect(verificationMock()).toHaveBeenCalledTimes(3);

    const response = await resend();

    // Throttled, but the response is the same generic success. Telling the
    // caller they were rate limited would confirm the account exists.
    expect(response.status).toBe(200);
    expect(response.body.message).toBe(GENERIC);
    expect(verificationMock()).toHaveBeenCalledTimes(3);
  });

  it("counts the window from token rows, so older sends do not block", async () => {
    await signup();
    await resend();
    await resend();

    // Age every token past the one-hour window.
    await pool.query(
      "UPDATE email_verification_tokens SET created_at = now() - interval '2 hours'",
    );

    await resend();

    expect(verificationMock()).toHaveBeenCalledTimes(4);
  });
});
