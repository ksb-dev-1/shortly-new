import { errorMessage } from "./api";

/**
 * POSTs to a billing endpoint and returns the Stripe-hosted URL it redirects
 * to. Shared between Checkout and the Customer Portal -- both endpoints take
 * an empty or one-field body, need the same 401-then-refresh retry as every
 * other authed request, and both return nothing but `{ url }`.
 */
async function requestBillingUrl(
  path: "checkout" | "portal",
  refreshSession: () => Promise<boolean>,
  body?: Record<string, unknown>,
): Promise<string> {
  const url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/billing/${path}`;
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body ?? {}),
  };

  let res = await fetch(url, init);

  // The access token only lasts 15 minutes, so a tab left open longer than
  // that meets a 401 on a session that is otherwise perfectly good. Spend one
  // rotation of the refresh token and send it again.
  if (res.status === 401) {
    const refreshed = await refreshSession();

    if (refreshed) {
      res = await fetch(url, init);
    }
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(errorMessage(data, "Couldn't reach billing"));
  }

  return data.url as string;
}

export function startCheckout(
  plan: "monthly" | "yearly",
  refreshSession: () => Promise<boolean>,
) {
  return requestBillingUrl("checkout", refreshSession, { plan });
}

export function openBillingPortal(refreshSession: () => Promise<boolean>) {
  return requestBillingUrl("portal", refreshSession);
}
