"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { LinkCard } from "./link-card";
import { LINKS_PER_PAGE } from "./queries";
import type { Pagination, ShortLink } from "./types";

export function LinksList({
  links,
  pagination,
  isLoading,
  onPageChange,
  onLinkDeleted,
}: {
  links: ShortLink[];
  pagination: Pagination | null;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onLinkDeleted: () => void;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {/* one per row the page will actually hold, so the list doesn't jump
            in height when the real cards arrive */}
        {Array.from({ length: LINKS_PER_PAGE }, (_, i) => (
          <Skeleton key={i} className="h-26 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (links.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="font-medium">No links yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Shorten your first URL above and it&apos;ll show up here.
          </p>
        </CardContent>
      </Card>
    );
  }

  // total_pages is 0 when there are no links at all, so this also covers the
  // case where the empty state above didn't catch it
  const showPager = (pagination?.total_pages ?? 0) > 1;

  return (
    <div className="flex flex-col gap-3">
      {links.map((link) => (
        <LinkCard key={link.id} link={link} onDeleted={onLinkDeleted} />
      ))}

      {showPager && pagination && (
        <div className="mt-2 flex items-center justify-between gap-4">
          <p className="font-mono text-xs text-muted-foreground">
            Page {pagination.page} of {pagination.total_pages} ·{" "}
            {pagination.total} link{pagination.total === 1 ? "" : "s"}
          </p>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.total_pages}
              onClick={() => onPageChange(pagination.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
