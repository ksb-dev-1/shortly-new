/**
 * Shared styling for every Shortly email.
 *
 * These mirror the design tokens in frontend/src/app/globals.css, which are
 * authored in oklch — a color space no email client understands. The hex values
 * below are those same tokens converted to sRGB, so the emails and the site
 * stay visually in step. If a token changes there, convert and change it here.
 *
 * Everything is an inline style object: email clients strip <style> blocks, and
 * layout is kept to blocks and spacing because flexbox and grid are unreliable
 * across Outlook and older webmail.
 */

export const colors = {
  /** --brand */
  brand: "#DC321F",
  /** --brand-subtle: --brand at 8%, pre-blended over white */
  brandSubtle: "#FCEFED",
  /** the border brandSubtle needs to read as a panel rather than a smudge */
  brandBorder: "#F6D9D4",
  /** --foreground */
  foreground: "#090B0C",
  /** body copy: --foreground is too harsh at 15px, --muted-foreground too faint */
  bodyText: "#3F4C50",
  /** --muted-foreground */
  mutedForeground: "#67787C",
  /** --border */
  border: "#E3E7E8",
  surface: "#FFFFFF",
  /** --muted, used as the page behind the card */
  canvas: "#F1F3F3",
} as const;

const sansStack =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Matches the site, which sets technical labels and URLs in mono. */
const monoStack =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

export const body = {
  backgroundColor: colors.canvas,
  fontFamily: sansStack,
  margin: "0",
  padding: "32px 12px",
};

export const container = {
  backgroundColor: colors.surface,
  margin: "0 auto",
  maxWidth: "520px",
  borderRadius: "14px",
  border: `1px solid ${colors.border}`,
  // the brand rule across the top of the card. Declared as a border rather than
  // a filled Section because an empty table cell collapses in several clients
  borderTop: `4px solid ${colors.brand}`,
};

export const header = {
  padding: "28px 36px 0",
};

export const wordmark = {
  fontFamily: sansStack,
  fontSize: "19px",
  fontWeight: "600",
  letterSpacing: "-0.02em",
  color: colors.foreground,
  margin: "0",
};

/** The orange full stop the site's logo and headlines end on. */
export const wordmarkDot = {
  color: colors.brand,
};

/** The tracked mono label above each headline, as on the marketing hero. */
export const eyebrow = {
  fontFamily: monoStack,
  fontSize: "11px",
  fontWeight: "500",
  letterSpacing: "0.18em",
  textTransform: "uppercase" as const,
  color: colors.brand,
  margin: "26px 0 0",
};

export const content = {
  padding: "0 36px 32px",
};

export const heading = {
  fontSize: "26px",
  lineHeight: "32px",
  fontWeight: "600",
  letterSpacing: "-0.02em",
  color: colors.foreground,
  margin: "10px 0 14px",
};

export const text = {
  fontSize: "15px",
  lineHeight: "24px",
  color: colors.bodyText,
  margin: "0 0 14px",
};

/** Small pill carrying the one detail people actually need: the expiry. */
export const chip = {
  display: "inline-block",
  backgroundColor: colors.brandSubtle,
  color: colors.brand,
  fontFamily: monoStack,
  fontSize: "11px",
  fontWeight: "500",
  letterSpacing: "0.06em",
  padding: "6px 12px",
  borderRadius: "999px",
  margin: "0 0 20px",
};

export const button = {
  backgroundColor: colors.brand,
  color: "#FFFFFF",
  borderRadius: "8px",
  padding: "14px 26px",
  fontSize: "15px",
  fontWeight: "600",
  textDecoration: "none",
  display: "inline-block",
  margin: "0",
};

/**
 * The same URL again, in full. Some clients strip the button and some
 * corporate filters rewrite it, so the raw link has to be reachable too.
 */
export const fallbackBox = {
  backgroundColor: colors.brandSubtle,
  border: `1px solid ${colors.brandBorder}`,
  borderRadius: "8px",
  padding: "14px 16px",
  margin: "22px 0 0",
};

export const fallbackLabel = {
  fontFamily: monoStack,
  fontSize: "10px",
  fontWeight: "500",
  letterSpacing: "0.14em",
  textTransform: "uppercase" as const,
  color: colors.mutedForeground,
  margin: "0 0 8px",
};

export const fallbackLink = {
  fontFamily: monoStack,
  fontSize: "12px",
  lineHeight: "18px",
  color: colors.brand,
  textDecoration: "none",
  wordBreak: "break-all" as const,
};

export const divider = {
  borderColor: colors.border,
  borderStyle: "solid",
  borderWidth: "1px 0 0",
  margin: "28px 0 20px",
};

export const muted = {
  fontSize: "13px",
  lineHeight: "20px",
  color: colors.mutedForeground,
  margin: "0",
};

export const footer = {
  fontFamily: monoStack,
  fontSize: "11px",
  lineHeight: "18px",
  color: colors.mutedForeground,
  textAlign: "center" as const,
  margin: "24px 0 0",
};
