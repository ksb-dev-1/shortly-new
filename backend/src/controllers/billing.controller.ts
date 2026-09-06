import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import type Stripe from "stripe";

import { env } from "../config/env.js";
import { stripe } from "../config/stripe.js";
import { pool } from "../db/index.js";
import { ApiError } from "../middlewares/errorHandler.middleware.js";
import type { CheckoutInput } from "../schemas/billing.schema.js";

const PRICE_IDS = {
  monthly: env.STRIPE_PRICE_ID_MONTHLY,
  yearly: env.STRIPE_PRICE_ID_YEARLY,
} as const;

// ─────────────────────────────────────────────
// Create a Checkout session
// ─────────────────────────────────────────────

/**
 * Starts a subscription purchase. Returns a URL to the Stripe-hosted
 * Checkout page rather than taking payment details itself.
 *
 * This only starts the purchase -- it does not grant Pro. The redirect back
 * from Checkout happens before Stripe has necessarily finished processing
 * the payment, and closing the tab before it resolves is common, so the
 * webhook handler is what actually activates the subscription.
 */
export async function createCheckoutSessionController(
  req: Request,
  res: Response,
) {
  // requireAuth should have populated this.
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Unauthorized");
  }

  const { plan } = req.body as CheckoutInput;

  const result = await pool.query<{
    email: string;
    stripe_customer_id: string | null;
  }>(`SELECT email, stripe_customer_id FROM users WHERE id = $1`, [userId]);

  const user = result.rows[0];

  if (!user) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Unauthorized");
  }

  // Reuse the existing Stripe customer if this user has one; a second
  // subscription attempt should not create a second customer for them.
  let customerId = user.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId },
    });

    customerId = customer.id;

    await pool.query(`UPDATE users SET stripe_customer_id = $1 WHERE id = $2`, [
      customerId,
      userId,
    ]);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: PRICE_IDS[plan], quantity: 1 }],
    success_url: `${env.FRONTEND_URL}/dashboard?checkout=success`,
    cancel_url: `${env.FRONTEND_URL}/dashboard?checkout=cancelled`,
  });

  if (!session.url) {
    throw new ApiError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      "Could not start checkout",
    );
  }

  return res.status(StatusCodes.OK).json({
    success: true,
    url: session.url,
  });
}

// ─────────────────────────────────────────────
// Handle a Stripe webhook event
// ─────────────────────────────────────────────

/**
 * The only thing allowed to grant or revoke Pro. Checkout's success_url is
 * just a hint to redirect the browser -- the tab can close before it fires,
 * so Stripe calling this endpoint directly is the actual source of truth.
 *
 * Every handler below SETs absolute state (plan = 'pro', status = whatever
 * Stripe just reported) rather than incrementing or appending anything, so
 * a duplicate delivery of the same event -- which Stripe's retry policy
 * makes routine -- lands on the same end state instead of double-applying.
 */
export async function stripeWebhookController(req: Request, res: Response) {
  const signature = req.headers["stripe-signature"];

  if (typeof signature !== "string") {
    throw new ApiError(StatusCodes.BAD_REQUEST, "Missing Stripe signature");
  }

  let event: Stripe.Event;

  try {
    // req.body is the raw Buffer express.raw() left it as -- constructEvent
    // needs the exact bytes Stripe signed, not a re-serialized copy.
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (error) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      `Invalid signature: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  switch (event.type) {
    // Fires once Checkout finishes creating the subscription. This is the
    // moment Pro actually turns on.
    case "checkout.session.completed": {
      const session = event.data.object;
      const customerId = session.customer;
      const subscriptionId = session.subscription;

      if (typeof customerId === "string" && typeof subscriptionId === "string") {
        await pool.query(
          `UPDATE users
           SET plan = 'pro', stripe_subscription_id = $1, subscription_status = 'active'
           WHERE stripe_customer_id = $2`,
          [subscriptionId, customerId],
        );
      }
      break;
    }

    // Covers plan switches, renewals, and a card starting to fail --
    // Stripe moves the subscription to past_due on its own, which this
    // turns into losing Pro without any separate handling of that case.
    case "customer.subscription.updated": {
      const subscription = event.data.object;
      const customerId = subscription.customer;

      if (typeof customerId === "string") {
        const isActive =
          subscription.status === "active" ||
          subscription.status === "trialing";

        await pool.query(
          `UPDATE users
           SET plan = $1, stripe_subscription_id = $2, subscription_status = $3
           WHERE stripe_customer_id = $4`,
          [
            isActive ? "pro" : "free",
            subscription.id,
            subscription.status,
            customerId,
          ],
        );
      }
      break;
    }

    // The subscription is gone for good -- cancelled, or Stripe gave up
    // retrying a failed payment.
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const customerId = subscription.customer;

      if (typeof customerId === "string") {
        await pool.query(
          `UPDATE users
           SET plan = 'free', subscription_status = 'canceled'
           WHERE stripe_customer_id = $1`,
          [customerId],
        );
      }
      break;
    }

    // No DB write: the subscription.updated event this triggers (Stripe
    // marks it past_due) is what already degrades the account. Logged
    // purely so a failed renewal is findable in support.
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      req.log.error(
        { customerId: invoice.customer },
        "Stripe invoice payment failed",
      );
      break;
    }

    // Stripe sends far more event types than this app acts on. 200
    // acknowledges receipt so Stripe doesn't retry something nobody handles.
    default:
      break;
  }

  return res.status(StatusCodes.OK).json({ received: true });
}
