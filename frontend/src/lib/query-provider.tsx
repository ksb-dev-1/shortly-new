"use client";

import { useState } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  /*
   * Created in state rather than at module scope.
   *
   * A module-level client would be shared by every request the Next server
   * handles, so one visitor's cached data could be handed to the next. In
   * state it belongs to this browser tab, and the lazy initialiser keeps it
   * from being rebuilt on every render.
   */
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            /*
             * A short window where data is considered current, so moving
             * between pages reads the cache instead of refetching. Long enough
             * to make navigation instant, short enough that a link created in
             * another tab shows up quickly.
             */
            staleTime: 30_000,

            /*
             * Off by default. Nearly every query here is behind requireAuth,
             * and the honest failure is a 401 — retrying that three times
             * just delays the redirect to /login by a second. Queries that
             * genuinely benefit can opt back in.
             */
            retry: false,

            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
