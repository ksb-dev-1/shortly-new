"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

import { CreateLinkForm } from "./create-link-form";
import { LinksList } from "./links-list";
import { LINKS_PER_PAGE, linksQueryKey } from "./queries";
import type { Pagination, ShortLink } from "./types";

type LinksPage = { links: ShortLink[]; pagination: Pagination };

async function fetchLinks(
  page: number,
  refreshSession: () => Promise<boolean>,
): Promise<LinksPage> {
  const url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/links?page=${page}&limit=${LINKS_PER_PAGE}`;
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

  // Throwing is how a query reports failure — returning a shape it can't use
  // would look like success and blank the list instead.
  if (!res.ok) {
    throw new Error(errorMessage(data, "Couldn't load your links"));
  }

  return { links: data.links, pagination: data.pagination };
}

export function LinksDashboard() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading, refreshSession } = useAuth();
  const [page, setPage] = useState(1);

  /*
   * The guard is client-side because that is where the session lives: the
   * cookies are httpOnly and read by the Express API, and AuthProvider is what
   * turns them back into a user. Nothing on the Next server knows who is
   * signed in, so there is nothing to check earlier than this.
   *
   * replace rather than push, so Back doesn't land on the page that just
   * bounced you.
   */
  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.replace("/login");
    }
  }, [isAuthLoading, user, router]);

  const { data, isPending, isError, error } = useQuery({
    queryKey: linksQueryKey(page),
    queryFn: () => fetchLinks(page, refreshSession),

    // Waits for the session: firing while AuthProvider is still restoring
    // would send a request with no cookie yet and get a 401 for it.
    enabled: !isAuthLoading && !!user,

    /*
     * Paging keeps the previous page on screen while the next one loads, so
     * the list doesn't collapse into skeletons and back on every click. The
     * pager itself stays honest because `pagination` comes from whichever
     * page is currently rendered.
     */
    placeholderData: keepPreviousData,
  });

  // A failed load is worth saying out loud once, rather than leaving an empty
  // list that looks like "you have no links".
  useEffect(() => {
    if (isError) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't load your links",
      );
    }
  }, [isError, error]);

  /*
   * Deleting the only link on a page would otherwise strand the reader on an
   * empty one — the refetch returns no rows for a page that no longer exists,
   * and the pager reads "Page 3 of 2". Stepping back happens here rather than
   * in the dialog because this is the component that knows how many rows the
   * current page is holding.
   */
  function handleLinkDeleted() {
    const wasOnlyLinkOnPage = (data?.links.length ?? 0) === 1;

    if (wasOnlyLinkOnPage && page > 1) {
      setPage((current) => current - 1);
    }
  }

  // Covers both the session restore and the redirect that follows a failed one,
  // so a signed-out visitor never sees the dashboard frame flash into view.
  if (isAuthLoading || !user) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-75 w-full rounded-xl" />
        <Skeleton className="h-26 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Your links<span className="text-brand">.</span>
        </h1>
        <p className="mt-1 text-muted-foreground">
          Every short link on your account, newest first.
        </p>
      </div>

      <CreateLinkForm onCreated={() => setPage(1)} />

      <LinksList
        links={data?.links ?? []}
        pagination={data?.pagination ?? null}
        isLoading={isPending}
        onPageChange={setPage}
        onLinkDeleted={handleLinkDeleted}
      />
    </div>
  );
}
