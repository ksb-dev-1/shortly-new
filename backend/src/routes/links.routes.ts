import { Router } from "express";

import {
  createLinkController,
  deleteLinkController,
  linkAnalyticsController,
  listLinksController,
  updateLinkController,
} from "../controllers/links.controller.js";
import { createLinkLimiter } from "../middlewares/link-rate-limiters.middleware.js";
import { requireAuth } from "../middlewares/requireAuth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { createLinkSchema, updateLinkSchema } from "../schemas/links.schema.js";

const router = Router();

// No validate(): the pagination params live in the query string, which
// listLinksController parses itself.
router.get("/", requireAuth, listLinksController);

// The limiter sits after requireAuth because it keys on req.userId, which
// requireAuth is what populates.
router.post(
  "/",
  requireAuth,
  createLinkLimiter,
  validate(createLinkSchema),
  createLinkController,
);

// validate() covers the body; the :id param is parsed in the controller.
router.patch(
  "/:id",
  requireAuth,
  validate(updateLinkSchema),
  updateLinkController,
);

// No validate(): a delete carries no body, only the :id param.
router.delete("/:id", requireAuth, deleteLinkController);

// No validate(): the window is fixed server-side, so there is nothing to read
// from the query string.
router.get("/:id/analytics", requireAuth, linkAnalyticsController);

export default router;
