import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import app from "../app.js";
import { env } from "../config/env.js";
import { pool } from "../db/index.js";
import { createVerifiedUser, login, sessionCookies, userIdOf } from "./helpers.js";

vi.mock("../emails/send-verification-email.js", () => ({
  sendVerificationEmail: vi.fn(),
}));

/** Any route behind requireAuth will do; profile is the simplest. */
function profileWith(cookie?: string) {
  const req = request(app).get("/api/v1/profile");

  return cookie ? req.set("Cookie", cookie) : req;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireAuth", () => {
  it("lets a valid access token through", async () => {
    await createVerifiedUser();
    const cookies = sessionCookies(await login());

    expect((await profileWith(cookies)).status).toBe(200);
  });

  it("rejects a request with no cookie", async () => {
    const response = await profileWith();

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Unauthorized");
  });

  it("rejects a token that is not a JWT at all", async () => {
    const response = await profileWith("access_token=garbage");

    expect(response.status).toBe(401);
  });

  it("rejects a token signed with the wrong secret", async () => {
    await createVerifiedUser();
    const userId = await userIdOf();

    const forged = jwt.sign({ sub: userId }, "not-the-real-secret", {
      expiresIn: 900,
    });

    // The signature is what makes the token trustworthy. Without this check
    // anyone could mint themselves a session for any user id.
    const response = await profileWith(`access_token=${forged}`);

    expect(response.status).toBe(401);
  });

  it("rejects an expired token even though it is correctly signed", async () => {
    await createVerifiedUser();
    const userId = await userIdOf();

    const expired = jwt.sign({ sub: userId }, env.ACCESS_TOKEN_SECRET, {
      expiresIn: -10,
    });

    const response = await profileWith(`access_token=${expired}`);

    expect(response.status).toBe(401);
  });

  it("rejects a well-signed token with no subject", async () => {
    const shapeless = jwt.sign({ role: "admin" }, env.ACCESS_TOKEN_SECRET, {
      expiresIn: 900,
    });

    // Signed by us, but carries no user id. The payload shape is checked
    // separately from the signature.
    const response = await profileWith(`access_token=${shapeless}`);

    expect(response.status).toBe(401);
  });

  it("rejects a valid token whose user has since been deleted", async () => {
    await createVerifiedUser();
    const cookies = sessionCookies(await login());

    await pool.query("DELETE FROM users");

    // The JWT is stateless and still verifies, so the controller is what
    // notices the account is gone.
    const response = await profileWith(cookies);

    expect(response.status).toBe(401);
  });
});
