import type { Request } from "express";
import { rateLimit } from "express-rate-limit";
import { StatusCodes } from "http-status-codes";

import { env } from "../config/env.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** Same reasoning as the auth limiters: off under `npm test`. */
const skipInTests = () => env.IS_TEST;

/**
 * Caps how many links one account can create.
 *
 * Keyed on the authenticated user, not the IP. Every route this guards sits
 * behind requireAuth, so req.userId is always set by the time it runs, and it
 * is the fairer key: two colleagues sharing an office NAT should not spend
 * each other's budget. It also cannot be shed by changing address.
 *
 * The ?? is unreachable while the middleware stays after requireAuth, and is
 * there so a future reordering degrades to one shared bucket rather than
 * throwing.
 */
export const createLinkLimiter = rateLimit({
  windowMs: HOUR,
  limit: 60,
  keyGenerator: (req: Request) => req.userId ?? "anonymous",
  statusCode: StatusCodes.TOO_MANY_REQUESTS,
  message: {
    success: false,
    message: "Too many links created, please try again later",
  },
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: skipInTests,
});

/**
 * Guards the public redirect against someone walking the keyspace looking for
 * other people's links.
 *
 * skipSuccessfulRequests is the whole reason this is safe to put on the hot
 * path. A 302 is under 400, so a resolved link never counts and a real visitor
 * is never throttled however many links they follow. Only misses accumulate,
 * and a long run of misses is exactly what scanning looks like.
 *
 * Keyed on IP, since there is no account here. That means a scanner can spend
 * the budget for everyone behind the same address, but only for codes that do
 * not exist -- working links keep working for them throughout.
 */
export const redirectLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 100,
  skipSuccessfulRequests: true,
  statusCode: StatusCodes.TOO_MANY_REQUESTS,
  message: {
    success: false,
    message: "Too many requests, please try again later",
  },
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: skipInTests,
});
