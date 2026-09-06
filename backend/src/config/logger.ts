import pino from "pino";

import { env } from "./env.js";

/**
 * JSON in production so Render's log viewer (or anything else reading stdout)
 * can filter by field; pretty-printed in dev because a human is watching.
 */
export const logger = pino({
  // Tests fire hundreds of requests through app.ts via Supertest; a line per
  // request would drown the actual test output.
  level: env.IS_TEST ? "silent" : env.IS_PRODUCTION ? "info" : "debug",
  ...(env.IS_PRODUCTION
    ? {}
    : { transport: { target: "pino-pretty", options: { colorize: true } } }),
});
