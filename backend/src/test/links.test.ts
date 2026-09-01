import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import app from "../app.js";
import { pool } from "../db/index.js";
import { CREDENTIALS, signedInSession } from "./helpers.js";

vi.mock("../emails/send-verification-email.js", () => ({
  sendVerificationEmail: vi.fn(),
}));

const URL_ONE = "https://example.com/a-fairly-long-path-to-shorten";

function createLink(
  cookies: string,
  body: { originalUrl: string; code?: string },
) {
  return request(app).post("/api/v1/links").set("Cookie", cookies).send(body);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/links", () => {
  it("creates a link and generates a code", async () => {
    const cookies = await signedInSession();

    const response = await createLink(cookies, { originalUrl: URL_ONE });

    expect(response.status).toBe(201);
    expect(response.body.link.original_url).toBe(URL_ONE);
    expect(response.body.link.code).toMatch(/^[A-Za-z0-9]{7}$/);
  });

  it("accepts a custom alias", async () => {
    const cookies = await signedInSession();

    const response = await createLink(cookies, {
      originalUrl: URL_ONE,
      code: "my-alias",
    });

    expect(response.status).toBe(201);
    expect(response.body.link.code).toBe("my-alias");
  });

  it("refuses an alias somebody already has", async () => {
    const cookies = await signedInSession();

    await createLink(cookies, { originalUrl: URL_ONE, code: "taken" });
    const second = await createLink(cookies, {
      originalUrl: "https://example.org",
      code: "taken",
    });

    expect(second.status).toBe(409);
    expect(second.body.message).toBe("That alias is already taken");
  });

  it("treats aliases as case-sensitive", async () => {
    const cookies = await signedInSession();

    await createLink(cookies, { originalUrl: URL_ONE, code: "Sale" });
    const other = await createLink(cookies, {
      originalUrl: "https://example.org",
      code: "sale",
    });

    // The code column is compared case-sensitively, which the generated
    // base62 codes rely on — the upper and lower halves have to differ.
    expect(other.status).toBe(201);
  });

  it("refuses a reserved alias", async () => {
    const cookies = await signedInSession();

    const response = await createLink(cookies, {
      originalUrl: URL_ONE,
      code: "dashboard",
    });

    // A link owning this code would shadow a real frontend route.
    expect(response.status).toBe(400);
  });

  it("refuses a reserved alias whatever its capitalisation", async () => {
    const cookies = await signedInSession();

    const response = await createLink(cookies, {
      originalUrl: URL_ONE,
      code: "DashBoard",
    });

    expect(response.status).toBe(400);
  });

  it("rejects a javascript: URL", async () => {
    const cookies = await signedInSession();

    const response = await createLink(cookies, {
      // eslint-disable-next-line no-script-url
      originalUrl: "javascript:alert(1)",
    });

    // Only http and https are allowed. Without that rule every redirect
    // becomes an XSS vector aimed at whoever clicks the link.
    expect(response.status).toBe(400);
  });

  it("rejects a URL that is not a URL", async () => {
    const cookies = await signedInSession();

    const response = await createLink(cookies, { originalUrl: "not a url" });

    expect(response.status).toBe(400);
  });

  it("requires a session", async () => {
    const response = await request(app)
      .post("/api/v1/links")
      .send({ originalUrl: URL_ONE });

    expect(response.status).toBe(401);
  });
});

describe("GET /api/v1/links", () => {
  async function createMany(cookies: string, count: number) {
    for (let index = 0; index < count; index += 1) {
      await createLink(cookies, {
        originalUrl: `https://example.com/page-${index}`,
      });
    }
  }

  it("lists the user's links newest first", async () => {
    const cookies = await signedInSession();
    await createMany(cookies, 3);

    const response = await request(app)
      .get("/api/v1/links")
      .set("Cookie", cookies);

    expect(response.status).toBe(200);
    expect(response.body.links).toHaveLength(3);
    expect(response.body.links[0].original_url).toBe(
      "https://example.com/page-2",
    );
  });

  it("paginates, and reports a total that survives an empty page", async () => {
    const cookies = await signedInSession();
    await createMany(cookies, 7);

    const page = await request(app)
      .get("/api/v1/links?page=2&limit=5")
      .set("Cookie", cookies);

    expect(page.body.links).toHaveLength(2);
    expect(page.body.pagination).toMatchObject({
      page: 2,
      limit: 5,
      total: 7,
      total_pages: 2,
    });

    const past = await request(app)
      .get("/api/v1/links?page=9&limit=5")
      .set("Cookie", cookies);

    // The total comes from its own COUNT rather than riding along on the rows,
    // so a page past the end still knows how many links exist. Otherwise
    // "page 9 of 2" and "this user has none" would look identical.
    expect(past.body.links).toHaveLength(0);
    expect(past.body.pagination.total).toBe(7);
  });

  it("defaults to page 1 with a limit of 10", async () => {
    const cookies = await signedInSession();
    await createMany(cookies, 2);

    const response = await request(app)
      .get("/api/v1/links")
      .set("Cookie", cookies);

    expect(response.body.pagination).toMatchObject({ page: 1, limit: 10 });
  });

  it("rejects a limit above the cap", async () => {
    const cookies = await signedInSession();

    const response = await request(app)
      .get("/api/v1/links?limit=500")
      .set("Cookie", cookies);

    // Capped so one request cannot ask for the entire table.
    expect(response.status).toBe(400);
  });

  it("rejects a page of zero", async () => {
    const cookies = await signedInSession();

    const response = await request(app)
      .get("/api/v1/links?page=0")
      .set("Cookie", cookies);

    expect(response.status).toBe(400);
  });

  it("never shows one account another account's links", async () => {
    const mine = await signedInSession();
    await createLink(mine, { originalUrl: URL_ONE });

    const theirs = await signedInSession({
      email: "other@example.com",
      name: "Other Person",
    });

    const response = await request(app)
      .get("/api/v1/links")
      .set("Cookie", theirs);

    expect(response.body.links).toHaveLength(0);
    expect(response.body.pagination.total).toBe(0);
  });
});

describe("PATCH /api/v1/links/:id", () => {
  it("updates the destination", async () => {
    const cookies = await signedInSession();
    const created = await createLink(cookies, { originalUrl: URL_ONE });

    const response = await request(app)
      .patch(`/api/v1/links/${created.body.link.id}`)
      .set("Cookie", cookies)
      .send({ originalUrl: "https://example.org/moved" });

    expect(response.status).toBe(200);
    expect(response.body.link.original_url).toBe("https://example.org/moved");
  });

  it("updates the alias", async () => {
    const cookies = await signedInSession();
    const created = await createLink(cookies, { originalUrl: URL_ONE });

    const response = await request(app)
      .patch(`/api/v1/links/${created.body.link.id}`)
      .set("Cookie", cookies)
      .send({ code: "renamed" });

    expect(response.status).toBe(200);
    expect(response.body.link.code).toBe("renamed");
  });

  it("rejects an update carrying neither field", async () => {
    const cookies = await signedInSession();
    const created = await createLink(cookies, { originalUrl: URL_ONE });

    const response = await request(app)
      .patch(`/api/v1/links/${created.body.link.id}`)
      .set("Cookie", cookies)
      .send({});

    expect(response.status).toBe(400);
  });

  it("refuses an alias that is taken", async () => {
    const cookies = await signedInSession();
    await createLink(cookies, { originalUrl: URL_ONE, code: "first" });
    const second = await createLink(cookies, {
      originalUrl: "https://example.org",
    });

    const response = await request(app)
      .patch(`/api/v1/links/${second.body.link.id}`)
      .set("Cookie", cookies)
      .send({ code: "first" });

    expect(response.status).toBe(409);
  });

  it("answers 404 for a link belonging to somebody else", async () => {
    const mine = await signedInSession();
    const created = await createLink(mine, { originalUrl: URL_ONE });

    const theirs = await signedInSession({
      email: "other@example.com",
      name: "Other Person",
    });

    const response = await request(app)
      .patch(`/api/v1/links/${created.body.link.id}`)
      .set("Cookie", theirs)
      .send({ originalUrl: "https://evil.example.com" });

    // 404, not 403: confirming the link exists would leak that somebody else
    // owns that id.
    expect(response.status).toBe(404);
  });

  it("answers 400 for an id that is not a uuid", async () => {
    const cookies = await signedInSession();

    const response = await request(app)
      .patch("/api/v1/links/not-a-uuid")
      .set("Cookie", cookies)
      .send({ originalUrl: "https://example.org" });

    // Checked before it reaches Postgres, which would otherwise raise 22P02
    // and surface as a 500 rather than the 400 it really is.
    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/v1/links/:id", () => {
  it("deletes the link", async () => {
    const cookies = await signedInSession();
    const created = await createLink(cookies, { originalUrl: URL_ONE });

    const response = await request(app)
      .delete(`/api/v1/links/${created.body.link.id}`)
      .set("Cookie", cookies);

    expect(response.status).toBe(200);

    const { rows } = await pool.query("SELECT * FROM links");
    expect(rows).toHaveLength(0);
  });

  it("answers 404 for a link belonging to somebody else", async () => {
    const mine = await signedInSession();
    const created = await createLink(mine, { originalUrl: URL_ONE });

    const theirs = await signedInSession({
      email: "other@example.com",
      name: "Other Person",
    });

    const response = await request(app)
      .delete(`/api/v1/links/${created.body.link.id}`)
      .set("Cookie", theirs);

    expect(response.status).toBe(404);

    // And it really is still there.
    const { rows } = await pool.query("SELECT * FROM links");
    expect(rows).toHaveLength(1);
  });

  it("requires a session", async () => {
    const cookies = await signedInSession();
    const created = await createLink(cookies, { originalUrl: URL_ONE });

    const response = await request(app).delete(
      `/api/v1/links/${created.body.link.id}`,
    );

    expect(response.status).toBe(401);
  });
});

describe("account isolation", () => {
  it("keeps the signed-in user tied to their own session", async () => {
    const mine = await signedInSession();
    await createLink(mine, { originalUrl: URL_ONE });

    const theirs = await signedInSession({
      email: "other@example.com",
      name: "Other Person",
    });

    await createLink(theirs, { originalUrl: "https://example.net" });

    const { rows } = await pool.query<{ email: string; code: string }>(
      `SELECT users.email, links.code
       FROM links
       JOIN users ON users.id = links.user_id
       ORDER BY users.email`,
    );

    // ORDER BY users.email, so "other@" sorts ahead of "test@".
    expect(rows).toHaveLength(2);
    expect(rows[0]?.email).toBe("other@example.com");
    expect(rows[1]?.email).toBe(CREDENTIALS.email);
  });
});

