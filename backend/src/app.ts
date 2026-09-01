import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";

import { env } from "./config/env.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middlewares/errorHandler.middleware.js";
import authRoutes from "./routes/auth.routes.js";
import linkRoutes from "./routes/links.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import redirectRoutes from "./routes/redirect.routes.js";

const app = express();

// Tells Express how many proxy hops to unwrap when resolving req.ip
app.set("trust proxy", env.TRUST_PROXY);

app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use("/api/v1/auth", authRoutes);
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
