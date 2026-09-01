import { rateLimit } from "express-rate-limit";
import { StatusCodes } from "http-status-codes";

import { env } from "../config/env.js";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * Disables every limiter under `npm test`.
 *
 * The counters are per-process and in-memory, so without this a test file that
 * signs up six users is throttled on the sixth and fails for a reason unrelated
 * to what it asserts. Rate limiting is worth its own focused test, where being
 * throttled is the expected outcome rather than an accident.
 */
const skipInTests = () => env.IS_TEST;

/**
 * Rate limits are based on client IP.
 * Configure Express trust proxy correctly when the app is behind
 * a reverse proxy so req.ip represents the real client IP.
 */
function authLimiter(windowMs: number, limit: number, message: string) {
  return rateLimit({
    windowMs,
    limit,
    statusCode: StatusCodes.TOO_MANY_REQUESTS,
    message: {
      success: false,
      message,
    },
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: skipInTests,
  });
}

/**
 * Limits failed login attempts from one IP.
 * Successful logins do not consume the limit.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 10,
  skipSuccessfulRequests: true,
  statusCode: StatusCodes.TOO_MANY_REQUESTS,
  message: {
    success: false,
    message: "Too many login attempts, please try again later",
  },
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: skipInTests,
});

/**
 * Limits wrong guesses at the current password from one IP.
 *
 * The endpoint is behind requireAuth, so this is not an open door — but a
 * stolen access token would otherwise buy unlimited attempts at the password
 * it needs to take the account outright. Successful changes do not count.
 */
export const changePasswordLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 10,
  skipSuccessfulRequests: true,
  statusCode: StatusCodes.TOO_MANY_REQUESTS,
  message: {
    success: false,
    message: "Too many attempts, please try again later",
  },
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: skipInTests,
});

/**
 * Limits wrong guesses at the password from one IP when deleting an account.
 *
 * Same shape and reasoning as changePasswordLimiter: the endpoint is behind
 * requireAuth, but a stolen access token should not buy unlimited attempts at
 * the password guarding an irreversible action. Successful deletes cannot
 * repeat, so skipping them costs nothing.
 */
export const deleteAccountLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 10,
  skipSuccessfulRequests: true,
  statusCode: StatusCodes.TOO_MANY_REQUESTS,
  message: {
    success: false,
    message: "Too many attempts, please try again later",
  },
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: skipInTests,
});

/**
 * Limits account creation attempts from one IP.
 */
export const signupLimiter = authLimiter(
  HOUR,
  5,
  "Too many signup attempts, please try again later",
);

/**
 * Limits endpoints that can send emails.
 * The controllers also apply account-level limits,
 * providing a second layer of protection.
 */
export const emailLimiter = authLimiter(
  HOUR,
  3,
  "Too many emails requested, please try again later",
);

/**
 * Limits verification/reset token submissions from one IP.
 * Tokens are already cryptographically unguessable;
 * this additionally limits endpoint abuse.
 */
export const tokenLimiter = authLimiter(
  HOUR,
  10,
  "Too many attempts, please try again later",
);

/**
 * Limits refresh requests from one IP.
 */
export const refreshLimiter = authLimiter(
  15 * MINUTE,
  30,
  "Too many refresh attempts, please try again later",
);
