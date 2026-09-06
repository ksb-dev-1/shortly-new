import { logger } from "../config/logger.js";
import { pool } from "./index.js";

/**
 * How long a token row is kept after it can no longer be redeemed.
 *
 * Deliberately not zero, and deliberately keyed on age rather than on
 * used_at / revoked_at, because both of those columns are still load-bearing
 * after the token itself is dead:
 *
 * - A revoked refresh token that gets presented again is how reuse detection
 *   catches a stolen copy. Delete the row and that request becomes
 *   indistinguishable from an unknown token — a plain 401 that teaches
 *   nothing. See refreshController.
 *
 * - The per-recipient mail budget in resendVerificationController and
 *   forgotPasswordController counts rows by created_at over a one-hour
 *   window, with no used_at filter. Those rows *are* the ledger, so deleting
 *   a spent one inside the hour hands its quota back.
 *
 * Seven days past expiry clears both uses by a wide margin: the longest token
 * lives 7 days, and the mail window is 1 hour.
 */
const RETENTION_DAYS = 7;

/**
 * Interpolated into the statement rather than parameterised, because a table
 * name cannot be a bind parameter. Safe here only because this list is a
 * literal in this file and nothing outside it can reach the value.
 */
const TOKEN_TABLES = [
  "refresh_tokens",
  "email_verification_tokens",
  "password_reset_tokens",
] as const;

async function cleanupTokens() {
  let total = 0;

  for (const table of TOKEN_TABLES) {
    const result = await pool.query(
      `DELETE FROM ${table}
       WHERE expires_at < now() - ($1 || ' days')::interval`,
      [RETENTION_DAYS],
    );

    const deleted = result.rowCount ?? 0;
    total += deleted;

    logger.info(`${table}: deleted ${deleted}`);
  }

  logger.info(`Cleanup complete, ${total} rows removed`);
  await pool.end();
}

cleanupTokens().catch(function (err) {
  logger.error(err, "Token cleanup failed");
  process.exit(1);
});
