/**
 * Query keys for the links feature.
 *
 * Kept in one file so a mutation and the query it invalidates cannot drift
 * apart — a key typed out by hand in two places eventually disagrees, and the
 * symptom is a list that silently stops updating.
 *
 * The shared "links" prefix is what lets a single invalidation cover every
 * page at once: invalidating ["links"] matches ["links", "list", 1],
 * ["links", "list", 2] and so on, so a create or delete refreshes whichever
 * page the user happens to be looking at.
 */
export const linksKey = ["links"] as const;

/**
 * Links shown per page.
 *
 * The API defaults to 10 and accepts up to 100, so this is the frontend's
 * choice rather than a server limit. It is part of the query key as well as
 * the request: two different page sizes describe different results, and
 * caching them under one key would serve the wrong rows if this ever becomes
 * something the reader picks.
 */
export const LINKS_PER_PAGE = 5;

export const linksQueryKey = (page: number) =>
  [...linksKey, "list", { page, limit: LINKS_PER_PAGE }] as const;

/**
 * Analytics sits outside the `links` prefix on purpose.
 *
 * Creating, renaming or deleting a link invalidates every list page — but none
 * of those change what a *different* link's clicks look like, and a rename
 * doesn't change its own. Sharing the prefix would throw away good cached
 * charts on every unrelated mutation.
 */
export const linkAnalyticsQueryKey = (linkId: string) =>
  ["link-analytics", linkId] as const;

// mirrors backend/src/config/plans.ts FREE_LINK_LIMIT
export const FREE_LINK_LIMIT = 5;
