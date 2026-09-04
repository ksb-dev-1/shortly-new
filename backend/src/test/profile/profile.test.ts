import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import app from "../../app.js";
import { pool } from "../../db/index.js";
import {
  CREDENTIALS,
  cookie,
  createVerifiedUser,
  login,
  sessionCookies,
  userIdOf,
} from "../helpers.js";

vi.mock("../../emails/send-verification-email.js", () => ({
  sendVerificationEmail: vi.fn(),
}));

/*
 * Cloudinary, replaced wholesale.
 *
 * uploadAvatar wraps upload_stream in a promise: it takes the returned stream
 * and calls .end(buffer), and the callback is what settles that promise. The
 * stand-in mirrors that shape — end() invokes the callback immediately with a
 * fixed URL — which is enough for the controller to behave normally without a
 * network call or an account.
 */
const UPLOADED_URL = "https://cdn.example.com/avatar.png";

vi.mock("cloudinary", () => ({
  v2: {
    config: vi.fn(),
    uploader: {
      upload_stream: vi.fn(
        (
          _options: unknown,
          callback: (error: unknown, result: { secure_url: string }) => void,
        ) => ({
          end: () => callback(null, { secure_url: UPLOADED_URL }),
        }),
      ),
      destroy: vi.fn().mockResolvedValue({ result: "ok" }),
    },
    api: {
      delete_folder: vi.fn().mockResolvedValue({ deleted: [] }),
    },
  },
}));

const { v2: cloudinary } = await import("cloudinary");

const PNG = Buffer.from("fake-png-bytes");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/profile", () => {
  it("returns the signed-in user", async () => {
    await createVerifiedUser();
    const cookies = sessionCookies(await login());

    const response = await request(app)
      .get("/api/v1/profile")
      .set("Cookie", cookies);

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      email: CREDENTIALS.email,
      name: CREDENTIALS.name,
      is_verified: true,
    });
    expect(response.body.user).not.toHaveProperty("password_hash");
  });
});

describe("PATCH /api/v1/profile", () => {
  it("updates the name", async () => {
    await createVerifiedUser();
    const cookies = sessionCookies(await login());

    const response = await request(app)
      .patch("/api/v1/profile")
      .set("Cookie", cookies)
      .field("name", "New Name");

    expect(response.status).toBe(200);
    expect(response.body.user.name).toBe("New Name");
  });

  it("rejects an update that carries nothing", async () => {
    await createVerifiedUser();
    const cookies = sessionCookies(await login());

    const response = await request(app)
      .patch("/api/v1/profile")
      .set("Cookie", cookies)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Provide a name or an image to update");
  });

  it("rejects a name that is too short", async () => {
    await createVerifiedUser();
    const cookies = sessionCookies(await login());

    const response = await request(app)
      .patch("/api/v1/profile")
      .set("Cookie", cookies)
      .field("name", "ab");

    expect(response.status).toBe(400);
  });

  it("uploads an avatar and stores the returned URL", async () => {
    await createVerifiedUser();
    const cookies = sessionCookies(await login());

    const response = await request(app)
      .patch("/api/v1/profile")
      .set("Cookie", cookies)
      .attach("image", PNG, { filename: "me.png", contentType: "image/png" });

    expect(response.status).toBe(200);
    expect(response.body.user.avatar_url).toBe(UPLOADED_URL);
    expect(cloudinary.uploader.upload_stream).toHaveBeenCalledTimes(1);
  });

  it("files the avatar under a folder of the account's own", async () => {
    await createVerifiedUser();
    const cookies = sessionCookies(await login());
    const userId = await userIdOf();

    await request(app)
      .patch("/api/v1/profile")
      .set("Cookie", cookies)
      .attach("image", PNG, { filename: "me.png", contentType: "image/png" });

    const [options] = vi.mocked(cloudinary.uploader.upload_stream).mock
      .calls[0]!;

    // One fixed public id per user, so a new upload overwrites the old avatar
    // rather than accumulating orphans.
    expect(options).toMatchObject({
      folder: `shortly/avatars/${userId}`,
      public_id: "avatar",
      overwrite: true,
    });
  });

  it("refuses a file that is not an image", async () => {
    await createVerifiedUser();
    const cookies = sessionCookies(await login());

    const response = await request(app)
      .patch("/api/v1/profile")
      .set("Cookie", cookies)
      .attach("image", Buffer.from("not really a picture"), {
        filename: "script.sh",
        contentType: "application/x-sh",
      });

    expect(response.status).toBe(400);
    expect(cloudinary.uploader.upload_stream).not.toHaveBeenCalled();
  });

  it("leaves the avatar alone when only the name changes", async () => {
    await createVerifiedUser();
    const cookies = sessionCookies(await login());

    await request(app)
      .patch("/api/v1/profile")
      .set("Cookie", cookies)
      .attach("image", PNG, { filename: "me.png", contentType: "image/png" });

    const response = await request(app)
      .patch("/api/v1/profile")
      .set("Cookie", cookies)
      .field("name", "Renamed");

    // COALESCE keeps the existing avatar when the update supplies none.
    expect(response.body.user.name).toBe("Renamed");
    expect(response.body.user.avatar_url).toBe(UPLOADED_URL);
  });
});

describe("DELETE /api/v1/profile", () => {
  function deleteAccount(cookies: string, password: string) {
    return request(app)
      .delete("/api/v1/profile")
      .set("Cookie", cookies)
      .send({ password });
  }

  it("deletes the account when the password is right", async () => {
    await createVerifiedUser();
    const cookies = sessionCookies(await login());

    const response = await deleteAccount(cookies, CREDENTIALS.password);

    expect(response.status).toBe(200);

    const { rows } = await pool.query("SELECT * FROM users");
    expect(rows).toHaveLength(0);
  });

  it("answers 403 for a wrong password, and keeps the account", async () => {
    await createVerifiedUser();
    const cookies = sessionCookies(await login());

    const response = await deleteAccount(cookies, "WrongPassword1!");

    // 403 rather than 401, matching change-password: the session is valid, and
    // it is the extra proof this irreversible action demands that failed.
    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Password is incorrect");

    const { rows } = await pool.query("SELECT * FROM users");
    expect(rows).toHaveLength(1);
  });

  it("takes links and tokens with it", async () => {
    await createVerifiedUser();
    const cookies = sessionCookies(await login());

    await request(app)
      .post("/api/v1/links")
      .set("Cookie", cookies)
      .send({ originalUrl: "https://example.com" });

    await deleteAccount(cookies, CREDENTIALS.password);

    // Every child table references users with ON DELETE CASCADE, so one DELETE
    // is the whole operation.
    const links = await pool.query("SELECT * FROM links");
    const tokens = await pool.query("SELECT * FROM refresh_tokens");
    const verifications = await pool.query(
      "SELECT * FROM email_verification_tokens",
    );

    expect(links.rows).toHaveLength(0);
    expect(tokens.rows).toHaveLength(0);
    expect(verifications.rows).toHaveLength(0);
  });

  it("clears both cookies", async () => {
    await createVerifiedUser();
    const cookies = sessionCookies(await login());

    const response = await deleteAccount(cookies, CREDENTIALS.password);

    expect(cookie(response, "access_token")).toContain("access_token=;");
    expect(cookie(response, "refresh_token")).toContain("refresh_token=;");
  });

  it("removes the avatar and its folder from Cloudinary", async () => {
    await createVerifiedUser();
    const cookies = sessionCookies(await login());
    const userId = await userIdOf();

    await request(app)
      .patch("/api/v1/profile")
      .set("Cookie", cookies)
      .attach("image", PNG, { filename: "me.png", contentType: "image/png" });

    await deleteAccount(cookies, CREDENTIALS.password);

    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(
      `shortly/avatars/${userId}/avatar`,
      { invalidate: true },
    );

    // destroy() removes the asset but leaves the folder behind for good, so
    // the folder is deleted separately. Without it every deleted account
    // leaves an empty shortly/avatars/<uuid>/ in the account forever — a bug
    // that was found by hand and fixed on 2026-08-31.
    expect(cloudinary.api.delete_folder).toHaveBeenCalledWith(
      `shortly/avatars/${userId}`,
    );
  });

  it("does not call Cloudinary for an account with no avatar", async () => {
    await createVerifiedUser();
    const cookies = sessionCookies(await login());

    await deleteAccount(cookies, CREDENTIALS.password);

    expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
    expect(cloudinary.api.delete_folder).not.toHaveBeenCalled();
  });

  it("still deletes the account when Cloudinary fails", async () => {
    await createVerifiedUser();
    const cookies = sessionCookies(await login());

    await request(app)
      .patch("/api/v1/profile")
      .set("Cookie", cookies)
      .attach("image", PNG, { filename: "me.png", contentType: "image/png" });

    vi.mocked(cloudinary.uploader.destroy).mockRejectedValueOnce(
      new Error("Cloudinary is down"),
    );

    const response = await deleteAccount(cookies, CREDENTIALS.password);

    // The image cleanup is best effort and deliberately runs after the row is
    // gone. An orphaned image can be swept up later; a live account whose
    // avatar 404s is something the user has to look at.
    expect(response.status).toBe(200);

    const { rows } = await pool.query("SELECT * FROM users");
    expect(rows).toHaveLength(0);
  });
});
