import type Stripe from "stripe";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import app from "../../app.js";
import { env } from "../../config/env.js";
import { pool } from "../../db/index.js";
import { signedInSession, userIdOf } from "../helpers.js";

vi.mock("../../emails/send-verification-email.js", () => ({
  sendVerificationEmail: vi.fn(),
}));

/*
 * The whole module is replaced, the same way the cloudinary tests replace
 * the upload client -- these tests are about our own code around Stripe
 * (which price maps to which plan, whether the customer id gets reused and
 * saved), not about Stripe's API itself, which the earlier manual smoke test
 * against the real test-mode account already covers.
 */
vi.mock("../../config/stripe.js", () => ({
  stripe: {
    customers: { create: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
    billingPortal: { sessions: { create: vi.fn() } },
  },
}));

const { stripe } = await import("../../config/stripe.js");
const customersCreate = vi.mocked(stripe.customers.create);
const sessionsCreate = vi.mocked(stripe.checkout.sessions.create);
const portalSessionsCreate = vi.mocked(stripe.billingPortal.sessions.create);

const FAKE_CUSTOMER_ID = "cus_fake123";
const FAKE_CHECKOUT_URL = "https://checkout.stripe.com/fake-session";
const FAKE_PORTAL_URL = "https://billing.stripe.com/fake-portal";

function checkout(cookies: string | undefined, plan: unknown) {
  const req = request(app).post("/api/v1/billing/checkout");

  return (cookies ? req.set("Cookie", cookies) : req).send({ plan });
}

function portal(cookies: string | undefined) {
  const req = request(app).post("/api/v1/billing/portal");

  return cookies ? req.set("Cookie", cookies) : req;
}

beforeEach(() => {
  vi.clearAllMocks();

  customersCreate.mockResolvedValue({
    id: FAKE_CUSTOMER_ID,
  } as unknown as Stripe.Response<Stripe.Customer>);

  sessionsCreate.mockResolvedValue({
    url: FAKE_CHECKOUT_URL,
  } as unknown as Stripe.Response<Stripe.Checkout.Session>);

  portalSessionsCreate.mockResolvedValue({
    url: FAKE_PORTAL_URL,
  } as unknown as Stripe.Response<Stripe.BillingPortal.Session>);
});

describe("POST /api/v1/billing/checkout", () => {
  it("rejects a request with no session", async () => {
    const response = await checkout(undefined, "monthly");

    expect(response.status).toBe(401);
  });

  it("rejects a plan that isn't monthly or yearly", async () => {
    const cookies = await signedInSession();

    const response = await checkout(cookies, "lifetime");

    expect(response.status).toBe(400);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("creates a Stripe customer for a first-time subscriber and saves its id", async () => {
    const cookies = await signedInSession();

    const response = await checkout(cookies, "monthly");

    expect(response.status).toBe(200);
    expect(response.body.url).toBe(FAKE_CHECKOUT_URL);
    expect(customersCreate).toHaveBeenCalledTimes(1);

    const userId = await userIdOf();
    const { rows } = await pool.query<{ stripe_customer_id: string | null }>(
      "SELECT stripe_customer_id FROM users WHERE id = $1",
      [userId],
    );

    expect(rows[0]?.stripe_customer_id).toBe(FAKE_CUSTOMER_ID);
  });

  it("reuses the existing Stripe customer instead of creating a second one", async () => {
    const cookies = await signedInSession();
    const userId = await userIdOf();

    await pool.query("UPDATE users SET stripe_customer_id = $1 WHERE id = $2", [
      "cus_already_exists",
      userId,
    ]);

    const response = await checkout(cookies, "monthly");

    expect(response.status).toBe(200);
    expect(customersCreate).not.toHaveBeenCalled();
    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_already_exists" }),
    );
  });

  it("uses the yearly price for the yearly plan", async () => {
    const cookies = await signedInSession();

    await checkout(cookies, "yearly");

    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: env.STRIPE_PRICE_ID_YEARLY, quantity: 1 }],
      }),
    );
  });

  it("uses the monthly price for the monthly plan", async () => {
    const cookies = await signedInSession();

    await checkout(cookies, "monthly");

    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: env.STRIPE_PRICE_ID_MONTHLY, quantity: 1 }],
      }),
    );
  });
});

describe("POST /api/v1/billing/portal", () => {
  it("rejects a request with no session", async () => {
    const response = await portal(undefined);

    expect(response.status).toBe(401);
  });

  it("refuses a user who has never subscribed", async () => {
    const cookies = await signedInSession();

    const response = await portal(cookies);

    expect(response.status).toBe(400);
    expect(portalSessionsCreate).not.toHaveBeenCalled();
  });

  it("returns a portal URL for an existing Stripe customer", async () => {
    const cookies = await signedInSession();
    const userId = await userIdOf();

    await pool.query("UPDATE users SET stripe_customer_id = $1 WHERE id = $2", [
      "cus_portal_test",
      userId,
    ]);

    const response = await portal(cookies);

    expect(response.status).toBe(200);
    expect(response.body.url).toBe(FAKE_PORTAL_URL);
    expect(portalSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_portal_test" }),
    );
  });
});
