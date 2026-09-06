import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import app from "../../app.js";
import { env } from "../../config/env.js";
import { pool } from "../../db/index.js";
import {
  CREDENTIALS,
  createVerifiedUser,
  eventually,
  makeUserPro,
  signedInSession,
} from "../helpers.js";

vi.mock("../../emails/send-verification-email.js", () => ({
  sendVerificationEmail: vi.fn(),
}));

/*
 * The one file where being throttled is the expected outcome.
 *
 * Every other test file relies on the limiters standing aside: their counters
 * are per-process and in-memory, so a file that signs up six users would be
 * throttled by the sixth for a reason unrelated to what it asserts. That is
 * what `skip: skipInTests` is for, and it leaves the limiters themselves
 * uncovered — including the two whose behaviour is genuinely subtle.
 *
 * Three things make this file work.
 */

/*
 * 1. The switch.
 *
 * `skipInTests` is `() => env.IS_TEST`, called on every request rather than
 * evaluated when the limiter was built, so flipping the flag on the env object
 * turns the limiters on and off mid-run. `env` is declared `as const`, hence
 * the cast: readonly is a compile-time claim about an ordinary object.
 *
 * Note what this deliberately does not disturb. `auth.controller.ts` reads the
 * same flag once, at import, to pick bcrypt's cost — `env.IS_TEST ? 4 : 12`.
 * That happens when this file imports the app, long before anything below
 * runs, so hashing stays at 4 rounds and the sixty-odd password operations
 * here cost milliseconds instead of a minute.
 */
const envSwitch = env as { IS_TEST: boolean };

async function withLimiters<T>(run: () => Promise<T>): Promise<T> {
  envSwitch.IS_TEST = false;

  try {
    return await run();
  } finally {
    envSwitch.IS_TEST = true;
  }
}

/*
 * 2. Setup happens outside the switch.
 *
 * Creating an account costs a signup request, and signup is itself limited to
 * five an hour. Wrapping only the requests under measurement means the fixtures
 * every test needs are built the same way as in every other file — unthrottled
 * — and nothing a test sets up is charged to the budget it is about to test.
 */

/*
 * 3. A fresh client address per test.
 *
 * The counters live for the lifetime of the file and no store is reachable to
 * reset, so two tests measuring the same limiter would inherit each other's
 * tally. Giving each test its own address sidesteps that entirely, and is also
 * what lets the per-address claims below be tested at all.
 *
 * req.ip only reflects X-Forwarded-For when Express has been told a proxy is in
 * front of it. TRUST_PROXY is 0 in .env.test, which is correct for the app and
 * useless here, so the setting is raised for this file and put back after.
 */
let addresses = 0;

const nextAddress = () => `10.9.0.${(addresses += 1)}`;

beforeAll(() => {
  app.set("trust proxy", 1);
});

afterAll(() => {
  app.set("trust proxy", env.TRUST_PROXY);
});

beforeEach(() => {
  vi.clearAllMocks();
});

const signupFrom = (ip: string, email: string) =>
  request(app)
    .post("/api/v1/auth/signup")
    .set("X-Forwarded-For", ip)
    .send({ ...CREDENTIALS, email });

const loginFrom = (ip: string, password = CREDENTIALS.password) =>
  request(app)
    .post("/api/v1/auth/login")
    .set("X-Forwarded-For", ip)
    .send({ email: CREDENTIALS.email, password });

const createLinkAs = (cookies: string) =>
  request(app)
    .post("/api/v1/links")
    .set("Cookie", cookies)
    .send({ originalUrl: "https://example.com/somewhere" });

const visit = (ip: string, code: string) =>
  request(app).get(`/${code}`).set("X-Forwarded-For", ip);

async function countOf(table: "users" | "link_clicks") {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*) FROM ${table}`,
  );

  return Number(rows[0]?.count);
}

describe("signup limiter — five an hour, per address", () => {
  it("allows five signups, then answers 429", async () => {
    const ip = nextAddress();

    await withLimiters(async () => {
      for (let i = 1; i <= 5; i += 1) {
        expect((await signupFrom(ip, `user${i}@example.com`)).status).toBe(201);
      }

      const sixth = await signupFrom(ip, "user6@example.com");

      expect(sixth.status).toBe(429);
      expect(sixth.body.message).toBe(
        "Too many signup attempts, please try again later",
      );
    });
  });

  it("rejects the sixth before any account is created", async () => {
    const ip = nextAddress();

    await withLimiters(async () => {
      for (let i = 1; i <= 6; i += 1) {
        await signupFrom(ip, `user${i}@example.com`);
      }
    });

    // The limiter is the first middleware on the route, ahead of both validate
    // and the controller, so a throttled request never touches the database.
    expect(await countOf("users")).toBe(5);
  });

  it("counts each address separately", async () => {
    const exhausted = nextAddress();
    const fresh = nextAddress();

    await withLimiters(async () => {
      for (let i = 1; i <= 6; i += 1) {
        await signupFrom(exhausted, `user${i}@example.com`);
      }

      // Without this, one office NAT or one mobile carrier exhausting the
      // budget would lock out everybody behind the same address.
      const elsewhere = await signupFrom(fresh, "elsewhere@example.com");

      expect(elsewhere.status).toBe(201);
    });
  });
});

describe("login limiter — ten in fifteen minutes, failures only", () => {
  it("throttles the eleventh wrong password", async () => {
    const ip = nextAddress();

    await createVerifiedUser();

    await withLimiters(async () => {
      for (let i = 1; i <= 10; i += 1) {
        expect((await loginFrom(ip, "WrongPassword1!")).status).toBe(401);
      }

      const eleventh = await loginFrom(ip, "WrongPassword1!");

      expect(eleventh.status).toBe(429);
      expect(eleventh.body.message).toBe(
        "Too many login attempts, please try again later",
      );
    });
  });

  it("does not spend the budget on successful logins", async () => {
    const ip = nextAddress();

    await createVerifiedUser();

    await withLimiters(async () => {
      /*
       * Twelve is past the limit of ten. skipSuccessfulRequests puts the count
       * back once the response comes in under 400, so only failures accumulate
       * and somebody signing in from several devices is never locked out by
       * their own success.
       */
      for (let i = 1; i <= 12; i += 1) {
        expect((await loginFrom(ip)).status).toBe(200);
      }

      expect((await loginFrom(ip)).status).toBe(200);
    });
  });
});

describe("link creation limiter — sixty an hour, per user", () => {
  it("throttles the sixty-first link, and only for that account", async () => {
    const mine = await signedInSession();
    const theirs = await signedInSession({ email: "other@example.com" });

    // Sixty links is well past the free-plan cap, and the limiter -- not the
    // cap -- is what this test is about.
    await makeUserPro();

    await withLimiters(async () => {
      for (let i = 1; i <= 60; i += 1) {
        expect((await createLinkAs(mine)).status).toBe(201);
      }

      const sixtyFirst = await createLinkAs(mine);

      expect(sixtyFirst.status).toBe(429);
      expect(sixtyFirst.body.message).toBe(
        "Too many links created, please try again later",
      );

      /*
       * The other account is on the same address and unaffected, which is the
       * point of keying on req.userId rather than req.ip: colleagues behind one
       * NAT do not spend each other's budget, and the limit cannot be shed by
       * moving address.
       */
      expect((await createLinkAs(theirs)).status).toBe(201);
    });
  });
});

describe("redirect limiter — a hundred in fifteen minutes, misses only", () => {
  it("never throttles links that resolve", async () => {
    const ip = nextAddress();
    const cookies = await signedInSession();
    const code = (await createLinkAs(cookies)).body.link.code as string;

    await withLimiters(async () => {
      // Past the limit of a hundred, all from one address. A 302 is under 400,
      // so every one of these is counted and then uncounted: this is what makes
      // the limiter safe to leave on the hot path.
      for (let i = 1; i <= 101; i += 1) {
        expect((await visit(ip, code)).status).toBe(302);
      }
    });

    // Also drains the fire-and-forget click inserts before the next test
    // truncates the table underneath them.
    await eventually(async () => (await countOf("link_clicks")) === 101, 10_000);
  });

  it("throttles a long run of misses", async () => {
    const ip = nextAddress();

    await withLimiters(async () => {
      for (let i = 1; i <= 100; i += 1) {
        expect((await visit(ip, `missing${i}`)).status).toBe(404);
      }

      // A hundred consecutive codes that do not exist is not a person reading a
      // page, it is somebody walking the keyspace looking for other people's
      // links.
      const overTheLine = await visit(ip, "missing101");

      expect(overTheLine.status).toBe(429);
      expect(overTheLine.body.message).toBe(
        "Too many requests, please try again later",
      );
    });
  });

  it("blocks a real link too, once an address is over the line", async () => {
    const ip = nextAddress();
    const cookies = await signedInSession();
    const code = (await createLinkAs(cookies)).body.link.code as string;

    await withLimiters(async () => {
      for (let i = 1; i <= 100; i += 1) {
        await visit(ip, `missing${i}`);
      }

      /*
       * Worth being explicit about, because it is easy to assume otherwise:
       * "counts misses only" governs what accumulates, not what is exempt. The
       * limiter runs before the route, so once the tally is at the limit every
       * request from that address is refused — a working link included. What
       * skipSuccessfulRequests buys is that following real links never builds
       * the tally in the first place.
       */
      expect((await visit(ip, code)).status).toBe(429);
    });
  });
});

describe("limit headers", () => {
  it("advertises the policy in draft-7 headers, not the legacy pair", async () => {
    const ip = nextAddress();

    const response = await withLimiters(() =>
      request(app)
        .post("/api/v1/auth/refresh")
        .set("X-Forwarded-For", ip)
        .send(),
    );

    // standardHeaders: "draft-7" — the combined RateLimit header plus the
    // RateLimit-Policy that names the window.
    expect(response.headers["ratelimit"]).toBeDefined();
    expect(response.headers["ratelimit-policy"]).toBeDefined();

    // legacyHeaders: false, so the older X- prefixed pair is absent rather than
    // sent alongside.
    expect(response.headers["x-ratelimit-limit"]).toBeUndefined();
  });
});
