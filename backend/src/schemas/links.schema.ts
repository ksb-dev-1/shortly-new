import { z } from "zod";

// Only http and https may be shortened. Without this the shortener would
// happily hand out links to javascript: and data: URLs, which turns every
// redirect into an XSS vector aimed at whoever clicks it.
const ALLOWED_PROTOCOLS = ["http:", "https:"];

/**
 * Codes that must never be handed out, because a link owning one would shadow
 * a real page. Frontend routes are here alongside "api" and the paths we are
 * likely to add later — cheaper to reserve them now than to discover the clash
 * once someone already owns the alias.
 *
 * Matched case-insensitively: codes themselves are case-sensitive, but
 * reserving "login" while leaving "Login" free defeats the point.
 */
const RESERVED_CODES = new Set([
  "api",
  "login",
  "signup",
  "logout",
  "verify-email",
  "resend-verification",
  "forgot-password",
  "reset-password",
  "profile",
  "settings",
  "dashboard",
  "links",
  "admin",
  "about",
  "pricing",
  "terms",
  "privacy",
  "help",
  "support",
  "static",
  "public",
  "assets",
]);

export const createLinkSchema = z.object({
  originalUrl: z
    .string()
    .trim()
    .min(1, "A URL is required")
    .max(2048, "URL must be at most 2048 characters")
    // one refine rather than z.url() plus a protocol check: new URL() already
    // answers both questions, and a single failure message reads better
    .refine((value) => {
      try {
        return ALLOWED_PROTOCOLS.includes(new URL(value).protocol);
      } catch {
        return false;
      }
    }, "Enter a valid http:// or https:// URL"),

  // Optional: omitted means the server generates one.
  code: z
    .string()
    .trim()
    .min(3, "Alias must be at least 3 characters")
    .max(32, "Alias must be at most 32 characters")
    .regex(
      /^[A-Za-z0-9_-]+$/,
      "Alias can only contain letters, numbers, hyphens and underscores",
    )
    .refine(
      (value) => !RESERVED_CODES.has(value.toLowerCase()),
      "That alias is reserved",
    )
    .optional(),
});

export type CreateLinkInput = z.infer<typeof createLinkSchema>;

/**
 * Both fields optional, so a client can change the destination, the alias, or
 * both. Derived from createLinkSchema with .partial() rather than rewritten,
 * so the URL and alias rules cannot drift apart from the create endpoint's --
 * including the protocol restriction and the reserved-code list.
 *
 * The controller rejects a request that carries neither field.
 */
export const updateLinkSchema = createLinkSchema.partial();

export type UpdateLinkInput = z.infer<typeof updateLinkSchema>;

/**
 * Query string for the list endpoint.
 *
 * Parsed inside the controller rather than by validate() on the route: that
 * middleware replaces req.body, and Express 5 exposes req.query as a getter
 * with no setter, so the same trick cannot work here.
 *
 * Everything arrives as a string, hence coerce. A missing param takes the
 * default, so /links and /links?page=1&limit=10 mean the same thing.
 */
export const listLinksSchema = z.object({
  page: z.coerce
    .number()
    .int("Page must be a whole number")
    .min(1, "Page must be at least 1")
    .default(1),

  // Capped so one request cannot ask for the entire table.
  limit: z.coerce
    .number()
    .int("Limit must be a whole number")
    .min(1, "Limit must be at least 1")
    .max(100, "Limit must be at most 100")
    .default(10),
});

export type ListLinksInput = z.infer<typeof listLinksSchema>;

/**
 * The :id path param, for the routes that act on a single link.
 *
 * Checked before the value reaches Postgres: comparing a malformed string to
 * a uuid column raises 22P02 (invalid_text_representation), which the error
 * handler does not recognise and would report as a 500 rather than the 400
 * it actually is.
 */
export const linkIdParamSchema = z.object({
  id: z.uuid("Invalid link id"),
});

export type LinkIdParam = z.infer<typeof linkIdParamSchema>;
