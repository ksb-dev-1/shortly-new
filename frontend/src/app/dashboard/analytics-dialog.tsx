"use client";

import { useQuery } from "@tanstack/react-query";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, shortUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

import { ClicksChart } from "./clicks-chart";
import { linkAnalyticsQueryKey } from "./queries";
import type { LinkAnalytics, ShortLink } from "./types";

async function fetchAnalytics(
  linkId: string,
  refreshSession: () => Promise<boolean>,
): Promise<LinkAnalytics> {
  const url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/links/${linkId}/analytics`;
  const init: RequestInit = { credentials: "include" };

  let res = await fetch(url, init);

  // The access token only lasts 15 minutes, so a tab left open longer than
  // that meets a 401 on a session that is otherwise perfectly good. Spend one
  // rotation of the refresh token and ask again.
  if (res.status === 401) {
    const refreshed = await refreshSession();

    if (refreshed) {
      res = await fetch(url, init);
    }
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(errorMessage(data, "Couldn't load analytics"));
  }

  return data.analytics;
}

export function AnalyticsDialog({
  link,
  open,
  onOpenChange,
}: {
  link: ShortLink;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { refreshSession } = useAuth();

  const { data, isPending, isError, error } = useQuery({
    queryKey: linkAnalyticsQueryKey(link.id),
    queryFn: () => fetchAnalytics(link.id, refreshSession),

    // Nothing is fetched until the dialog is actually opened — a dashboard
    // page holds five of these mounted at once.
    enabled: open,
  });

  // All-time and the window differ on purpose: the API returns a lifetime
  // total alongside 30 days, so a link that was busy months ago still says so.
  const windowClicks =
    data?.series.reduce((sum, day) => sum + day.clicks, 0) ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Analytics</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {shortUrl(link.code).replace(/^https?:\/\//, "")}
          </DialogDescription>
        </DialogHeader>

        {isError ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Couldn't load analytics"}
          </p>
        ) : isPending ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* The headline is a number, not a chart — a single value has no
                shape worth drawing. */}
            <div className="flex gap-8">
              <div>
                <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                  All time
                </p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">
                  {data.total_clicks}
                </p>
              </div>
              <div>
                <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                  Last 30 days
                </p>
                <p className="mt-1 text-3xl font-semibold tabular-nums text-muted-foreground">
                  {windowClicks}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm font-medium">Clicks per day</p>
              <ClicksChart series={data.series} />
            </div>

            {data.total_clicks === 0 && (
              <p className="text-sm text-muted-foreground">
                No clicks yet. Only <code className="text-xs">GET</code>{" "}
                requests count — link previews and uptime checks use{" "}
                <code className="text-xs">HEAD</code> and are ignored.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
