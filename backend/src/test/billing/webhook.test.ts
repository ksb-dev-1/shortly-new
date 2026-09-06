import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import app from "../../app.js";
import { env } from "../../config/env.js";
import { stripe } from "../../config/stripe.js";
import { pool } from "../../db/index.js";
import { signedInSession, userIdOf } from "../helpers.js";

vi.mock("../../emails/send-verification-email.js", () => ({
  sendVerificationEmail: vi.fn(),
}));

/*
 * Unlike billing.test.ts, nothing here mocks Stripe. Signature verification
 * is pure local HMAC -- no network call -- so generateTestHeaderString (the
 * SDK's own helper for exactly this) produces a header real constructEvent()
 * will accept, and the whole path runs for real.
 */
function sendWebhook(type: string, dataObject: Record<string, unknown>) {
  const payload = JSON.stringify({
    id: "evt_test_1",
    object: "event",
    type,
    data: { object: dataObject },
  });

  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: env.STRIPE_WEBHOOK_SECRET,
  });

  return request(app)
    .post("/api/v1/billing/webhook")
    .set("Content-Type", "application/json")
    .set("Stripe-Signature", signature)
    .send(payload);
}

async function planOf(userId: string) {
  const { rows } = await pool.query<{
    plan: string;
    stripe_subscription_id: string | null;
    subscription_status: string | null;
  }>(
    "SELECT plan, stripe_subscription_id, subscription_status FROM users WHERE id = $1",
    [userId],
  );

  return rows[0];
}

describe("POST /api/v1/billing/webhook", () => {
  it("rejects a request with no Stripe-Signature header", async () => {
    const payload = JSON.stringify({ id: "evt_1", type: "ping" });

    const response = await request(app)
      .post("/api/v1/billing/webhook")
      .set("Content-Type", "application/json")
      .send(payload);

    expect(response.status).toBe(400);
  });

  it("rejects a signature that doesn't match the payload", async () => {
    const payload = JSON.stringify({ id: "evt_1", type: "ping" });

    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: "whsec_the_wrong_secret",
    });

    const response = await request(app)
      .post("/api/v1/billing/webhook")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", signature)
      .send(payload);

    expect(response.status).toBe(400);
  });

  it("activates Pro on checkout.session.completed", async () => {
    await signedInSession();
    const userId = await userIdOf();

    await pool.query("UPDATE users SET stripe_customer_id = $1 WHERE id = $2", [
      "cus_webhook_test",
      userId,
    ]);

    const response = await sendWebhook("checkout.session.completed", {
      customer: "cus_webhook_test",
      subscription: "sub_webhook_test",
    });

    expect(response.status).toBe(200);

    const user = await planOf(userId);
    expect(user).toMatchObject({
      plan: "pro",
      stripe_subscription_id: "sub_webhook_test",
      subscription_status: "active",
    });
  });

  it("drops a subscriber back to free when the subscription is deleted", async () => {
    await signedInSession();
    const userId = await userIdOf();

    await pool.query(
      `UPDATE users
       SET stripe_customer_id = $1, plan = 'pro', subscription_status = 'active'
       WHERE id = $2`,
      ["cus_cancel_test", userId],
    );

    const response = await sendWebhook("customer.subscription.deleted", {
      customer: "cus_cancel_test",
    });

    expect(response.status).toBe(200);

    const user = await planOf(userId);
    expect(user).toMatchObject({ plan: "free", subscription_status: "canceled" });
  });

  it("degrades to free when a subscription update reports past_due", async () => {
    await signedInSession();
    const userId = await userIdOf();

    await pool.query(
      `UPDATE users
       SET stripe_customer_id = $1, plan = 'pro', subscription_status = 'active'
       WHERE id = $2`,
      ["cus_pastdue_test", userId],
    );

    const response = await sendWebhook("customer.subscription.updated", {
      id: "sub_pastdue_test",
      customer: "cus_pastdue_test",
      status: "past_due",
    });

    expect(response.status).toBe(200);

    const user = await planOf(userId);
    expect(user).toMatchObject({ plan: "free", subscription_status: "past_due" });
  });

  it("does not fail on an event type it doesn't act on", async () => {
    const response = await sendWebhook("customer.created", {
      id: "cus_irrelevant",
    });

    expect(response.status).toBe(200);
  });

  it("applies the same event twice without changing the outcome", async () => {
    await signedInSession();
    const userId = await userIdOf();

    await pool.query("UPDATE users SET stripe_customer_id = $1 WHERE id = $2", [
      "cus_retry_test",
      userId,
    ]);

    const event = {
      customer: "cus_retry_test",
      subscription: "sub_retry_test",
    };

    const first = await sendWebhook("checkout.session.completed", event);
    const second = await sendWebhook("checkout.session.completed", event);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const user = await planOf(userId);
    expect(user).toMatchObject({
      plan: "pro",
      stripe_subscription_id: "sub_retry_test",
      subscription_status: "active",
    });
  });
});
