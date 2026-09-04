import { Router } from "express";

import { redirectController } from "../controllers/links.controller.js";
import { redirectLimiter } from "../middlewares/link-rate-limiters.middleware.js";

const router = Router();

// Mounted at the root, because the whole point is a short URL: /<code>.
// Registered after the /api/v1 routers in app.ts so it cannot shadow them.
//
// The limiter counts only misses, so following real links never builds a
// tally. Once an address is over the line it is refused outright, though --
// see the note on redirectLimiter.
router.get("/:code", redirectLimiter, redirectController);

export default router;
