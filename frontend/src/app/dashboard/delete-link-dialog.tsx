"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { errorMessage, shortUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

import { linksKey } from "./queries";
import type { ShortLink } from "./types";

export function DeleteLinkDialog({
  link,
  open,
  onOpenChange,
  onDeleted,
}: {
  link: ShortLink;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const { refreshSession } = useAuth();

  const deleteLink = useMutation({
    mutationFn: async () => {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/links/${link.id}`;
      const init: RequestInit = {
        method: "DELETE",
        credentials: "include",
      };

      let res = await fetch(url, init);

      // The access token only lasts 15 minutes, so a tab left open longer than
      // that meets a 401 on a session that is otherwise perfectly good. Spend
      // one rotation of the refresh token and send it again.
      if (res.status === 401) {
        const refreshed = await refreshSession();

        if (refreshed) {
          res = await fetch(url, init);
        }
      }

      const data = await res.json();

      if (!res.ok) {
        throw new Error(errorMessage(data));
      }
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: linksKey });

      // Lets the dashboard step back a page if this was the only link on it,
      // so deleting the last item doesn't strand the reader on an empty page.
      onDeleted();

      onOpenChange(false);
      toast.success("Link deleted");
    },

    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Couldn't delete that link",
      );
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this link?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                <span className="font-mono text-foreground">
                  {shortUrl(link.code).replace(/^https?:\/\//, "")}
                </span>{" "}
                will stop working immediately for everyone you&apos;ve shared it
                with.
              </p>
              {/* Worth stating plainly: the click rows cascade with the link,
                  so this destroys the analytics too, not just the redirect. */}
              <p>
                Its click history is deleted with it, and neither can be
                recovered.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteLink.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            /*
             * The component's own variant, not hand-written classes.
             * AlertDialogAction renders <Button asChild>, and Radix's Slot
             * concatenates the two class strings rather than running them
             * through tailwind-merge — so a hand-written bg- sits next to the
             * variant's bg- and Tailwind's source order picks the winner.
             */
            variant="destructive"
            disabled={deleteLink.isPending}
            onClick={(event) => {
              // the dialog closes on its own action by default; hold it open
              // until the request actually succeeds
              event.preventDefault();
              deleteLink.mutate();
            }}
          >
            {deleteLink.isPending ? "Deleting..." : "Delete link"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
