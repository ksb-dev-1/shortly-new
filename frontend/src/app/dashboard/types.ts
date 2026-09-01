/**
 * A link exactly as GET /api/v1/links returns it.
 *
 * The timestamps are strings, not Dates: they are TIMESTAMPTZ in Postgres, but
 * everything in between is JSON, and JSON has no date type. Anything that wants
 * to format one has to parse it first.
 */
export type ShortLink = {
  id: string;
  code: string;
  original_url: string;
  created_at: string;
  updated_at: string;
};

/**
 * One day of the analytics series.
 *
 * `date` is a plain YYYY-MM-DD string, not a timestamp — the API formats it
 * server-side so the day is settled in UTC before it leaves, rather than
 * depending on where the reader happens to be.
 */
export type DailyClicks = {
  date: string;
  clicks: number;
};

/** What GET /api/v1/links/:id/analytics returns. */
export type LinkAnalytics = {
  total_clicks: number;
  series: DailyClicks[];
};

/** The pagination block that travels alongside the list. */
export type Pagination = {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
};
