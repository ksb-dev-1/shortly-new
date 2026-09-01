"use client";

import { useEffect } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { errorMessage, shortUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

import { linksKey } from "./queries";
import type { ShortLink } from "./types";

/** Carries the status so a 409 can be shown under the alias field. */
class UpdateLinkError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/*
 * Both fields are required here, unlike on create: the form opens prefilled
 * with the link's current values, so an empty one means the user cleared it
 * rather than declined to fill it in.
 */
const editLinkSchema = z.object({
  originalUrl: z
    .string()
    .trim()
    .min(1, "A URL is required")
    .max(2048, "URL must be at most 2048 characters")
    .refine((value) => {
      try {
        return ["http:", "https:"].includes(new URL(value).protocol);
      } catch {
        return false;
      }
    }, "Enter a valid http:// or https:// URL"),

  code: z
    .string()
    .trim()
    .min(3, "Alias must be at least 3 characters")
    .max(32, "Alias must be at most 32 characters")
    .regex(
      /^[A-Za-z0-9_-]+$/,
      "Alias can only contain letters, numbers, hyphens and underscores",
    ),
});

type EditLinkValues = z.infer<typeof editLinkSchema>;

export function EditLinkDialog({
  link,
  open,
  onOpenChange,
}: {
  link: ShortLink;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  /*
   * No "use no memo" here, unlike create-link-form.tsx.
   *
   * That form needs it because its inputs stay mounted across reset(), so a
   * ref the React Compiler memoised is never re-invoked and react-hook-form
   * ends up holding no DOM node. Here the inputs live inside DialogContent,
   * which Radix unmounts on close — they mount fresh on every open, and React
   * always invokes a ref callback on mount regardless of its identity.
   */
  const queryClient = useQueryClient();
  const { refreshSession } = useAuth();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<EditLinkValues>({
    resolver: zodResolver(editLinkSchema),
    defaultValues: { originalUrl: link.original_url, code: link.code },
  });

  // Reopening for a different link — or after cancelling an edit — has to
  // start from what is actually stored, not whatever was typed last time.
  useEffect(() => {
    if (open) {
      reset({ originalUrl: link.original_url, code: link.code });
    }
  }, [open, link.original_url, link.code, reset]);

  const updateLink = useMutation({
    mutationFn: async (values: EditLinkValues) => {
      /*
       * Only what actually changed. The API rejects an empty body with 400,
       * but this never sends one — the caller returns early when nothing
       * differs, so a no-op save closes the dialog without a request and
       * without bumping updated_at.
       */
      const changes: Record<string, string> = {};
      if (values.originalUrl !== link.original_url) {
        changes.originalUrl = values.originalUrl;
      }
      if (values.code !== link.code) {
        changes.code = values.code;
      }

      const url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/links/${link.id}`;
      const init: RequestInit = {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(changes),
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
        throw new UpdateLinkError(errorMessage(data), res.status);
      }

      return data.link as ShortLink;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: linksKey });
      onOpenChange(false);
      toast.success("Link updated");
    },

    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Something went wrong";

      const isAliasProblem =
        (error instanceof UpdateLinkError && error.status === 409) ||
        message.toLowerCase().includes("alias");

      if (isAliasProblem) {
        setError("code", { message });
        return;
      }

      toast.error(message);
    },
  });

  function onSubmit(values: EditLinkValues) {
    const unchanged =
      values.originalUrl === link.original_url && values.code === link.code;

    if (unchanged) {
      onOpenChange(false);
      return;
    }

    updateLink.mutate(values);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit link</DialogTitle>
          <DialogDescription>
            Change where this link points, or what it&apos;s called.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.originalUrl}>
              <FieldLabel htmlFor={`url-${link.id}`}>
                Destination URL
              </FieldLabel>
              <Input
                id={`url-${link.id}`}
                inputMode="url"
                autoComplete="off"
                {...register("originalUrl")}
              />
              <FieldError errors={[errors.originalUrl]} />
            </Field>

            <Field data-invalid={!!errors.code}>
              <FieldLabel htmlFor={`code-${link.id}`}>Alias</FieldLabel>
              <Input
                id={`code-${link.id}`}
                autoComplete="off"
                {...register("code")}
              />
              {/* Stated up front rather than after the fact: by the time a
                  conditional warning appears, the reader has already typed the
                  new name and decided. */}
              <FieldDescription>
                Changing this breaks the old link —{" "}
                <span className="font-mono">
                  {shortUrl(link.code).replace(/^https?:\/\//, "")}
                </span>{" "}
                will stop working for anyone you&apos;ve already shared it with.
              </FieldDescription>
              <FieldError errors={[errors.code]} />
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateLink.isPending}>
              {updateLink.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
