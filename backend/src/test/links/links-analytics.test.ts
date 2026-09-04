import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import app from "../../app.js";
import { pool } from "../../db/index.js";
import { signedInSession } from "../helpers.js";

vi.mock("../../emails/send-verification-email.js", () => ({
  sendVerificationEmail: vi.fn(),
}));

const ANALYTICS_DAYS = 30;

async function createLink(cookies: string) {
  const response = await request(app)
    .post("/api/v1/links")
    .set("Cookie", cookies)
    .send({ originalUrl: "https://example.com/destination" });

  return response.body.link.id as string;
}

/** Records clicks directly, at a chosen age in days. */
async function recordClicks(linkId: string, count: number, daysAgo = 0) {
  for (let index = 0; index < count; index += 1) {
    await pool.query(
      `INSERT INTO link_clicks (link_id, clicked_at)
       VALUES ($1, now() - ($2 || ' days')::interval)`,
      [linkId, daysAgo],
    );
  }
}

function analytics(cookies: string, linkId: string) {
  return request(app)
    .get(`/api/v1/links/${linkId}/analytics`)
    .set("Cookie", cookies);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/links/:id/analytics", () => {
  it("reports zero for a link nobody has clicked", async () => {
    const cookies = await signedInSession();
    const linkId = await createLink(cookies);

    const response = await analytics(cookies, linkId);

    expect(response.status).toBe(200);
    expect(response.body.analytics.total_clicks).toBe(0);
  });

  it("counts the clicks", async () => {
    const cookies = await signedInSession();
    const linkId = await createLink(cookies);

    await recordClicks(linkId, 4);

    const response = await analytics(cookies, linkId);

    expect(response.body.analytics.total_clicks).toBe(4);
  });

  it("returns a full 30-day series even where there were no clicks", async () => {
    const cookies = await signedInSession();
    const linkId = await createLink(cookies);

    await recordClicks(linkId, 2);

    const { series } = (await analytics(cookies, linkId)).body.analytics;

    // Every day is present, gaps filled with zero. A chart needs the empty
    // days as much as the busy ones, and filling them server-side means the
    // frontend never has to guess which dates are missing.
    expect(series).toHaveLength(ANALYTICS_DAYS);
    expect(series.every((day: { clicks: number }) => day.clicks >= 0)).toBe(
      true,
    );

    const total = series.reduce(
      (sum: number, day: { clicks: number }) => sum + day.clicks,
      0,
    );

    expect(total).toBe(2);
  });

  it("returns the series oldest first, as ISO dates", async () => {
    const cookies = await signedInSession();
    const linkId = await createLink(cookies);

    const { series } = (await analytics(cookies, linkId)).body.analytics;

    expect(series[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const dates = series.map((day: { date: string }) => day.date);
    const sorted = [...dates].sort();

    expect(dates).toEqual(sorted);
  });

  it("puts today's clicks on the last day of the series", async () => {
    const cookies = await signedInSession();
    const linkId = await createLink(cookies);

    await recordClicks(linkId, 3);

    const { series } = (await analytics(cookies, linkId)).body.analytics;

    expect(series[ANALYTICS_DAYS - 1].clicks).toBe(3);
  });

  it("counts a click from outside the window in the total but not the series", async () => {
    const cookies = await signedInSession();
    const linkId = await createLink(cookies);

    await recordClicks(linkId, 1);
    await recordClicks(linkId, 5, 60);

    const { analytics: result } = (await analytics(cookies, linkId)).body;

    // The total is all-time; the series is the last 30 days. They are
    // deliberately different questions, so they are allowed to disagree.
    expect(result.total_clicks).toBe(6);

    const inWindow = result.series.reduce(
      (sum: number, day: { clicks: number }) => sum + day.clicks,
      0,
    );

    expect(inWindow).toBe(1);
  });

  it("counts only this link's clicks", async () => {
    const cookies = await signedInSession();
    const first = await createLink(cookies);
    const second = await createLink(cookies);

    await recordClicks(first, 2);
    await recordClicks(second, 7);

    expect((await analytics(cookies, first)).body.analytics.total_clicks).toBe(
      2,
    );
    expect((await analytics(cookies, second)).body.analytics.total_clicks).toBe(
      7,
    );
  });

  it("answers 404 for a link belonging to somebody else", async () => {
    const mine = await signedInSession();
    const linkId = await createLink(mine);

    const theirs = await signedInSession({
      email: "other@example.com",
      name: "Other Person",
    });

    const response = await analytics(theirs, linkId);

    expect(response.status).toBe(404);
  });

  it("requires a session", async () => {
    const cookies = await signedInSession();
    const linkId = await createLink(cookies);

    const response = await request(app).get(
      `/api/v1/links/${linkId}/analytics`,
    );

    expect(response.status).toBe(401);
  });
});
