import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import app from "../app.js";
import { pool } from "../db/index.js";
import { eventually, signedInSession } from "./helpers.js";

vi.mock("../emails/send-verification-email.js", () => ({
  sendVerificationEmail: vi.fn(),
}));

const DESTINATION = "https://example.com/where-it-really-goes";

async function createLink(cookies: string, code?: string) {
  const response = await request(app)
    .post("/api/v1/links")
    .set("Cookie", cookies)
    .send({ originalUrl: DESTINATION, ...(code ? { code } : {}) });

  return response.body.link.code as string;
}

async function clickCount() {
  const { rows } = await pool.query<{ count: string }>(
    "SELECT count(*) FROM link_clicks",
  );

  return Number(rows[0]?.count);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /:code", () => {
  it("redirects to the original URL", async () => {
    const cookies = await signedInSession();
    const code = await createLink(cookies);

    const response = await request(app).get(`/${code}`);

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(DESTINATION);
  });

  it("uses 302, not 301", async () => {
    const cookies = await signedInSession();
    const code = await createLink(cookies);

    const response = await request(app).get(`/${code}`);

    /*
     * A 301 tells the browser the move is permanent, so it caches the target
     * more or less forever: editing or deleting the link would never reach
     * anyone who had already followed it, and repeat clicks would stop
     * touching the server — which would also stop them being counted.
     */
    expect(response.status).toBe(302);
  });

  it("records the click", async () => {
    const cookies = await signedInSession();
    const code = await createLink(cookies);

    await request(app).get(`/${code}`);

    // The insert is dispatched without being awaited, so the redirect can
    // arrive before the row exists. Polling briefly is honest about that
    // rather than pretending the write is synchronous.
    await eventually(async () => (await clickCount()) === 1);
  });

  it("stores the referrer and user agent", async () => {
    const cookies = await signedInSession();
    const code = await createLink(cookies);

    await request(app)
      .get(`/${code}`)
      .set("Referer", "https://news.example.com/article")
      .set("User-Agent", "TestAgent/1.0");

    await eventually(async () => (await clickCount()) === 1);

    const { rows } = await pool.query<{
      referrer: string | null;
      user_agent: string | null;
    }>("SELECT referrer, user_agent FROM link_clicks");

    expect(rows[0]?.referrer).toBe("https://news.example.com/article");
    expect(rows[0]?.user_agent).toBe("TestAgent/1.0");
  });

  it("stores nulls when the client sends neither header", async () => {
    const cookies = await signedInSession();
    const code = await createLink(cookies);

    await request(app).get(`/${code}`).unset("User-Agent");

    await eventually(async () => (await clickCount()) === 1);

    const { rows } = await pool.query<{ referrer: string | null }>(
      "SELECT referrer FROM link_clicks",
    );

    // A direct visit has no referrer, and plenty of clients send no agent.
    expect(rows[0]?.referrer).toBeNull();
  });

  it("answers HEAD with the redirect but does not count it", async () => {
    const cookies = await signedInSession();
    const code = await createLink(cookies);

    const response = await request(app).head(`/${code}`);

    expect(response.status).toBe(302);

    /*
     * HEAD is almost never a person: link checkers, uptime monitors, crawlers
     * and chat-app unfurlers all use it, and a Slack preview should not read
     * as a visit.
     */
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(await clickCount()).toBe(0);
  });

  it("404s for a code that does not exist", async () => {
    const response = await request(app).get("/nope123");

    expect(response.status).toBe(404);
  });

  it("404s for a deleted link", async () => {
    const cookies = await signedInSession();
    const code = await createLink(cookies);

    await pool.query("DELETE FROM links");

    expect((await request(app).get(`/${code}`)).status).toBe(404);
  });

  it("treats codes as case-sensitive", async () => {
    const cookies = await signedInSession();
    await createLink(cookies, "CaseTest");

    expect((await request(app).get("/CaseTest")).status).toBe(302);
    expect((await request(app).get("/casetest")).status).toBe(404);
  });

  it("does not shadow the API routes", async () => {
    // /:code is registered last precisely so it cannot swallow /api. If this
    // ever returns 404 from the redirect handler instead of 401 from
    // requireAuth, the route order in app.ts has been broken.
    const response = await request(app).get("/api/v1/profile");

    expect(response.status).toBe(401);
  });

  it("counts each visit separately", async () => {
    const cookies = await signedInSession();
    const code = await createLink(cookies);

    await request(app).get(`/${code}`);
    await request(app).get(`/${code}`);
    await request(app).get(`/${code}`);

    await eventually(async () => (await clickCount()) === 3);
  });

  it("needs no session", async () => {
    const cookies = await signedInSession();
    const code = await createLink(cookies);

    // The whole point of a short link is that anyone can follow it.
    const response = await request(app).get(`/${code}`);

    expect(response.status).toBe(302);
  });
});
