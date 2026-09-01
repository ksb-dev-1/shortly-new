import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import crypto from "node:crypto";

import { pool } from "../db/index.js";
import { ApiError } from "../middlewares/errorHandler.middleware.js";
import {
  type CreateLinkInput,
  type UpdateLinkInput,
  linkIdParamSchema,
  listLinksSchema,
} from "../schemas/links.schema.js";
import type { PublicLink } from "../types/db.js";

// Base62 alphabet.
// Both uppercase and lowercase are valid and remain case-sensitive.
const CODE_ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// 62^7 ≈ 3.5 trillion possible codes.
const CODE_LENGTH = 7;

// Number of times we retry when a generated code collides.
const MAX_CODE_ATTEMPTS = 5;

// Referrer and user agent are client-controlled headers and can arrive far
// larger than anything worth keeping, so they are capped before they reach
// the database rather than trusted to be sensible.
const MAX_REFERRER_LENGTH = 2048;
const MAX_USER_AGENT_LENGTH = 1024;

/**
 * Normalise a client-supplied header into something safe to store: trimmed,
 * length-capped, and null rather than an empty string when it is missing or
 * blank, so "absent" has one representation in the column instead of two.
 */
function clientHeader(value: string | undefined, maxLength: number) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

/**
 * Generate a cryptographically secure random Base62 code.
 *
 * crypto.randomInt() is used instead of randomBytes() % 62
 * because 256 is not evenly divisible by 62.
 */
function generateCode(): string {
  let code = "";

  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }

  return code;
}

/**
 * Check whether a PostgreSQL error is a unique-constraint violation.
 *
 * PostgreSQL error code 23505 = unique_violation.
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

// ─────────────────────────────────────────────
// 1. Create Link
// ─────────────────────────────────────────────

export async function createLinkController(
  req: Request,
  res: Response,
): Promise<Response> {
  // requireAuth should have populated this.
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Unauthorized");
  }

  // Input has already been validated by validate(createLinkSchema).
  const { originalUrl, code: customCode } = req.body as CreateLinkInput;

  // Custom aliases get one attempt.
  // Generated codes can be retried if a collision occurs.
  const maxAttempts = customCode ? 1 : MAX_CODE_ATTEMPTS;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const code = customCode ?? generateCode();

    try {
      /*
       * Do not SELECT first to check whether the code exists.
       *
       * SELECT -> INSERT has a race condition because another request
       * could claim the code between those two operations.
       *
       * PostgreSQL's UNIQUE constraint is the final authority.
       */
      const result = await pool.query<PublicLink>(
        `INSERT INTO links (user_id, code, original_url)
         VALUES ($1, $2, $3)
         RETURNING
           id,
           code,
           original_url,
           created_at,
           updated_at`,
        [userId, code, originalUrl],
      );

      const link = result.rows[0];

      if (!link) {
        throw new Error("Failed to create link");
      }

      return res.status(StatusCodes.CREATED).json({
        success: true,
        message: "Link created",
        link,
      });
    } catch (error) {
      // Code already exists.
      if (isUniqueViolation(error)) {
        // User explicitly requested this alias.
        if (customCode) {
          throw new ApiError(
            StatusCodes.CONFLICT,
            "That alias is already taken",
          );
        }

        // System-generated code collided.
        // Generate another code and retry.
        continue;
      }

      // Any unexpected database error should go to the
      // application's global error handler.
      throw error;
    }
  }

  // All generated-code attempts collided.
  throw new ApiError(
    StatusCodes.INTERNAL_SERVER_ERROR,
    "Could not generate a unique code, please try again",
  );
}

// ─────────────────────────────────────────────
// 2. List Links
// ─────────────────────────────────────────────

export async function listLinksController(
  req: Request,
  res: Response,
): Promise<Response> {
  // requireAuth should have populated this.
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Unauthorized");
  }

  // A ZodError thrown here reaches the global error handler, exactly as it
  // would from validate() on a route.
  const { page, limit } = listLinksSchema.parse(req.query);

  const offset = (page - 1) * limit;

  /*
   * Two queries rather than one COUNT(*) OVER() window.
   *
   * The window function rides along on the rows, so a page past the end comes
   * back with no rows and therefore no total -- and then "page 5 of 3" would
   * be indistinguishable from "this user has no links". A separate count is
   * always right.
   *
   * They do not need to see the same snapshot: a link added between them can
   * only make the total off by one until the next request.
   */
  const [linksResult, countResult] = await Promise.all([
    pool.query<PublicLink>(
      `SELECT
         id,
         code,
         original_url,
         created_at,
         updated_at
       FROM links
       WHERE user_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    ),

    // ::int because pg hands back bigint as a string
    pool.query<{ total: number }>(
      `SELECT count(*)::int AS total
       FROM links
       WHERE user_id = $1`,
      [userId],
    ),
  ]);

  const total = countResult.rows[0]?.total ?? 0;

  return res.status(StatusCodes.OK).json({
    success: true,
    links: linksResult.rows,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    },
  });
}

// ─────────────────────────────────────────────
// 3. Update Link
// ─────────────────────────────────────────────

export async function updateLinkController(
  req: Request,
  res: Response,
): Promise<Response> {
  // requireAuth should have populated this.
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Unauthorized");
  }

  const { id } = linkIdParamSchema.parse(req.params);

  // Body already validated by validate(updateLinkSchema) on the route.
  const { originalUrl, code } = req.body as UpdateLinkInput;

  // Reject an empty update rather than bumping updated_at for nothing.
  if (originalUrl === undefined && code === undefined) {
    throw new ApiError(
      StatusCodes.BAD_REQUEST,
      "Provide a URL or an alias to update",
    );
  }

  let result;

  try {
    /*
     * COALESCE leaves a column alone when its parameter is null, so one
     * statement covers all three combinations of fields.
     *
     * user_id sits in the WHERE rather than being checked afterwards: the
     * same statement finds the row and proves it belongs to the caller.
     */
    result = await pool.query<PublicLink>(
      `UPDATE links
       SET
         original_url = COALESCE($1, original_url),
         code = COALESCE($2, code),
         updated_at = now()
       WHERE id = $3
         AND user_id = $4
       RETURNING
         id,
         code,
         original_url,
         created_at,
         updated_at`,
      [originalUrl ?? null, code ?? null, id, userId],
    );
  } catch (error) {
    /*
     * The requested alias is already on another row -- which may well be one
     * of this same user's other links, not a stranger's. The index does not
     * fire when a row conflicts with itself, so re-saving an unchanged alias
     * still succeeds.
     */
    if (isUniqueViolation(error)) {
      throw new ApiError(StatusCodes.CONFLICT, "That alias is already taken");
    }

    throw error;
  }

  const link = result.rows[0];

  /*
   * No row matched: the link does not exist, or it belongs to someone else.
   * Both answer 404. A 403 would confirm the id is real, which lets anyone
   * probe for other people's links.
   */
  if (!link) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Link not found");
  }

  return res.status(StatusCodes.OK).json({
    success: true,
    message: "Link updated",
    link,
  });
}

// ─────────────────────────────────────────────
// 4. Delete Link
// ─────────────────────────────────────────────

export async function deleteLinkController(
  req: Request,
  res: Response,
): Promise<Response> {
  // requireAuth should have populated this.
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Unauthorized");
  }

  const { id } = linkIdParamSchema.parse(req.params);

  /*
   * No try/catch here, unlike the update: a DELETE cannot violate the unique
   * index, so there is no database error worth translating. Anything that does
   * go wrong belongs to the global handler.
   *
   * user_id sits in the WHERE for the same reason as everywhere else: one
   * statement finds the row and proves it belongs to the caller, leaving no
   * window between the check and the delete.
   */
  const result = await pool.query<Pick<PublicLink, "id">>(
    `DELETE FROM links
     WHERE id = $1
       AND user_id = $2
     RETURNING id`,
    [id, userId],
  );

  /*
   * Nothing came back: the link does not exist, or it belongs to someone else.
   * Both answer 404, so a caller cannot use this endpoint to discover which
   * ids are real.
   */
  if (!result.rows[0]) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Link not found");
  }

  return res.status(StatusCodes.OK).json({
    success: true,
    message: "Link deleted",
  });
}

// ─────────────────────────────────────────────
// 5. Link Analytics
// ─────────────────────────────────────────────

// Length of the daily series, today included. Fixed rather than caller-chosen:
// a client-supplied range drags in start/end validation, a maximum span, a
// granularity argument and a timezone argument, none of which this needs.
const ANALYTICS_DAYS = 30;

export async function linkAnalyticsController(
  req: Request,
  res: Response,
): Promise<Response> {
  // requireAuth should have populated this.
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Unauthorized");
  }

  const { id } = linkIdParamSchema.parse(req.params);

  /*
   * Ownership is checked on its own rather than folded into the queries below.
   * Those aggregate, so a link with no clicks would come back as zero and an
   * empty series -- exactly what someone else's link would look like. Only a
   * separate lookup can tell "yours, never clicked" from "not yours".
   */
  const owned = await pool.query<Pick<PublicLink, "id">>(
    `SELECT id
     FROM links
     WHERE id = $1
       AND user_id = $2`,
    [id, userId],
  );

  if (!owned.rows[0]) {
    // 404 rather than 403, so this cannot be used to discover real ids.
    throw new ApiError(StatusCodes.NOT_FOUND, "Link not found");
  }

  const [totalResult, seriesResult] = await Promise.all([
    // All-time, deliberately not limited to the window the series covers.
    pool.query<{ total_clicks: number }>(
      `SELECT count(*)::int AS total_clicks
       FROM link_clicks
       WHERE link_id = $1`,
      [id],
    ),

    /*
     * The daily series, with empty days filled in.
     *
     * A plain GROUP BY only produces rows for days that actually had clicks,
     * so a quiet week would simply be missing and a chart would join across
     * the gap as though those days never existed. generate_series supplies
     * all 30 days and the join fills in what happened on each.
     *
     * Days are UTC: clicked_at is a timestamptz, and without the explicit
     * conversion the server's own timezone would silently decide where one
     * day ends and the next begins.
     *
     * recent is narrowed by clicked_at before grouping to keep the predicate
     * index-friendly: it leaves the planner free to use the
     * (link_id, clicked_at DESC) index when it costs that cheaper than
     * reading every click the link has ever had. Whether it actually does is
     * its decision, taken from table statistics -- on a small table a
     * sequential scan really is cheaper.
     *
     * What this shape does settle is the other half: comparing clicked_at
     * directly, rather than wrapping it as the grouping below does, is what
     * lets this particular index apply. A plain b-tree over the raw column
     * cannot answer a range stated over an expression of that column.
     *
     * Not that expressions are unindexable in general -- an index on
     * (clicked_at AT TIME ZONE 'UTC') would serve the wrapped form perfectly
     * well. There simply isn't one here, and adding a second index to support
     * a predicate the raw column already handles would be a poor trade.
     */
    pool.query<{ date: string; clicks: number }>(
      `WITH days AS (
         SELECT generate_series(
                  (now() AT TIME ZONE 'UTC')::date - $2::int,
                  (now() AT TIME ZONE 'UTC')::date,
                  interval '1 day'
                )::date AS day
       ),
       recent AS (
         SELECT
           (clicked_at AT TIME ZONE 'UTC')::date AS day,
           count(*)::int AS clicks
         FROM link_clicks
         WHERE link_id = $1
           AND clicked_at >= (
                 ((now() AT TIME ZONE 'UTC')::date - $2::int)::timestamp
                 AT TIME ZONE 'UTC'
               )
         GROUP BY 1
       )
       SELECT
         to_char(days.day, 'YYYY-MM-DD') AS date,
         COALESCE(recent.clicks, 0) AS clicks
       FROM days
       LEFT JOIN recent ON recent.day = days.day
       ORDER BY days.day`,
      [id, ANALYTICS_DAYS - 1],
    ),
  ]);

  return res.status(StatusCodes.OK).json({
    success: true,
    analytics: {
      total_clicks: totalResult.rows[0]?.total_clicks ?? 0,
      series: seriesResult.rows,
    },
  });
}

// ─────────────────────────────────────────────
// 6. Redirect To Original URL
// ─────────────────────────────────────────────

export async function redirectController(
  req: Request,
  res: Response,
): Promise<void> {
  // noUncheckedIndexedAccess makes this string | undefined, and the route
  // cannot match without it, so this is really just to satisfy the type.
  const code = req.params.code;

  if (!code) {
    throw new ApiError(StatusCodes.NOT_FOUND, "This short link does not exist");
  }

  // Matched exactly: codes are case-sensitive, so /Sale is not /sale.
  // This uses the UNIQUE index on links.code.
  // id comes back too, because the click row references it.
  const result = await pool.query<Pick<PublicLink, "id" | "original_url">>(
    `SELECT id, original_url
     FROM links
     WHERE code = $1`,
    [code],
  );

  const link = result.rows[0];

  if (!link) {
    throw new ApiError(StatusCodes.NOT_FOUND, "This short link does not exist");
  }

  /*
   * A click is a GET that successfully resolved a short link.
   *
   * HEAD is answered with the same redirect but never counted: it is almost
   * never a person. Link checkers, uptime monitors, crawlers and chat-app
   * unfurlers all use it, and a Slack preview should not read as a visit.
   *
   * This does not make the numbers bot-free -- crawlers that use GET still
   * count. Telling those apart needs the user agent, which is why it is
   * stored, but that is an analytics refinement rather than something the
   * redirect should be doing.
   */
  if (req.method !== "HEAD") {
    /*
     * Dispatched before the redirect and deliberately not awaited: the request
     * pays for scheduling the query, never for the database round trip. It
     * carries on after the response has been sent.
     *
     * void marks the floating promise as intentional rather than an oversight.
     *
     * The .catch() is not optional: without it a rejected query becomes an
     * unhandled rejection, and it cannot fall through to errorHandler either,
     * because by then the response has gone out and the headersSent guard
     * hands straight back to Express. Logging is all that is left to do.
     *
     * The trade is that a click can be lost -- if the insert fails, or the
     * process dies before it finishes, nobody is left to retry it. For
     * analytics that is the right way round: an occasional missing click is a
     * rounding error, a slow redirect is felt by every visitor.
     */
    void pool
      .query(
        `INSERT INTO link_clicks (link_id, referrer, user_agent)
         VALUES ($1, $2, $3)`,
        [
          link.id,
          // Express resolves both the correct spelling and the misspelt
          // "Referer" that actually travels on the wire.
          clientHeader(req.get("referer"), MAX_REFERRER_LENGTH),
          clientHeader(req.get("user-agent"), MAX_USER_AGENT_LENGTH),
        ],
      )
      .catch((error: unknown) => {
        console.error("Failed to record link click:", error);
      });
  }

  /*
   * 302, deliberately not 301.
   *
   * A 301 tells the browser the move is permanent, so it caches the target
   * more or less forever. Editing or deleting the link afterwards would never
   * reach anyone who had already followed it, and repeat clicks would stop
   * touching the server at all -- which would also stop them being counted
   * just above.
   *
   * The stored URL is safe to hand to the browser because createLinkSchema
   * only accepts http and https, so this cannot become a javascript: redirect.
   */
  res.redirect(StatusCodes.MOVED_TEMPORARILY, link.original_url);
}
