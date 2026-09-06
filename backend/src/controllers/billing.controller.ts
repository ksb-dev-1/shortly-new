import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

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
