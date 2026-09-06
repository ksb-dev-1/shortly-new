import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { pinoHttp } from "pino-http";

import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middlewares/errorHandler.middleware.js";
import authRoutes from "./routes/auth.routes.js";
import billingRoutes from "./routes/billing.routes.js";
import healthRoutes from "./routes/health.routes.js";
import linkRoutes from "./routes/links.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import redirectRoutes from "./routes/redirect.routes.js";
import stripeWebhookRoutes from "./routes/stripe-webhook.routes.js";

const app = express();

// Tells Express how many proxy hops to unwrap when resolving req.ip
app.set("trust proxy", env.TRUST_PROXY);

// One request id per request, attached as req.log; also logs a line per
// finished request (method, path, status, duration) on its own. Cookies carry
// the access/refresh tokens, so both directions are redacted rather than
// logged.
app.use(
  pinoHttp({
    logger,
    redact: ["req.headers.cookie", 'res.headers["set-cookie"]'],
  }),
);

// Mounted before express.json(): verifying Stripe's signature needs the raw
// body, which express.json() would already have consumed and parsed away.
app.use("/api/v1/billing/webhook", stripeWebhookRoutes);

app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use("/health", healthRoutes);

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/billing", billingRoutes);
app.use("/api/v1/profile", profileRoutes);
app.use("/api/v1/links", linkRoutes);

// Last route registered: /:code matches any single path segment, so it must
// come after the API routers or it would swallow /api itself.
app.use("/", redirectRoutes);

// Both must come after every route: the first catches URLs nothing matched,
// the second is the one place that turns an error into a response
app.use(notFoundHandler);
app.use(errorHandler);

// Built but not started. server.ts is what listens; the tests import this and
// drive it through Supertest without a port ever being opened.
export default app;
