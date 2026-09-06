import { Router } from "express";

import { createCheckoutSessionController } from "../controllers/billing.controller.js";
import { requireAuth } from "../middlewares/requireAuth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { checkoutSchema } from "../schemas/billing.schema.js";

const router = Router();

router.post(
  "/checkout",
  requireAuth,
  validate(checkoutSchema),
  createCheckoutSessionController,
);

export default router;
