import express, { Router } from "express";

import { stripeWebhookController } from "../controllers/billing.controller.js";

const router = Router();

// Verifying Stripe's signature needs the exact raw bytes it signed, so this
// route reads the body itself instead of the app-wide express.json(). It is
// mounted before that middleware in app.ts for the same reason -- once
// express.json() has consumed the stream, the raw body is gone.
router.post(
  "/",
  express.raw({ type: "application/json" }),
  stripeWebhookController,
);

export default router;
