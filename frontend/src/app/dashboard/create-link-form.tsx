"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

import { linksKey } from "./queries";

/**
 * A rejection the form can attribute to a specific field, rather than a
 * general failure. Carrying the status lets the caller tell "that alias is
 * taken" apart from "the server is down".
 */
class CreateLinkError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// mirrors backend/src/schemas/links.schema.ts createLinkSchema
const createLinkSchema = z.object({
  originalUrl: z
    .string()
    .trim()
    .min(1, "A URL is required")
    .max(2048, "URL must be at most 2048 characters")
    // same single check the server makes: new URL() answers "does this parse?"
    // and "is the scheme allowed?" together
    .refine((value) => {
      try {
        return ["http:", "https:"].includes(new URL(value).protocol);
      } catch {
        return false;
      }
    }, "Enter a valid http:// or https:// URL"),

  /*
   * An untouched optional input arrives as "", not undefined, so every rule
   * has to let the empty string through and onSubmit drops it before sending.
   *
   * The server's reserved-alias list is deliberately not mirrored here. Length
   * and charset are stable, but that list grows every time a frontend route is
   * added, and a stale copy would reject aliases the server would accept — or
   * worse, accept ones it rejects. The server owns it and says so clearly.
   */
  code: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || value.length >= 3,
      "Alias must be at least 3 characters",
    )
    .refine(
      (value) => value === "" || value.length <= 32,
      "Alias must be at most 32 characters",
    )
    .refine(
      (value) => value === "" || /^[A-Za-z0-9_-]+$/.test(value),
      "Alias can only contain letters, numbers, hyphens and underscores",
    ),
});

type CreateLinkValues = z.infer<typeof createLinkSchema>;

export function CreateLinkForm({ onCreated }: { onCreated: () => void }) {
  /*
   * Opted out of the React Compiler, which is on globally via
   * `reactCompiler: true` in next.config.ts.
   *
   * react-hook-form registers uncontrolled inputs through a `ref` callback
   * that `register()` returns fresh on every render, and it depends on React
   * re-invoking that callback to re-attach after `reset()` clears its field
   * refs. The compiler memoises the props object, so the ref keeps its
   * identity, React skips it, and the form is left holding no DOM node —
   * every submit after the first one then reads `defaultValues` instead of
   * what is on screen, and reports the URL as missing.
   *
   * The auth forms never hit this because none of them call reset(): they
   * navigate away or swap to a success card instead.
   */
  "use no memo";

  const queryClient = useQueryClient();
  const { refreshSession } = useAuth();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CreateLinkValues>({
    resolver: zodResolver(createLinkSchema),
    defaultValues: { originalUrl: "", code: "" },
  });

  const createLink = useMutation({
    mutationFn: async (values: CreateLinkValues) => {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/links`;
      const init: RequestInit = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          originalUrl: values.originalUrl,
          // omit rather than send "", which would fail the server's min(3)
          ...(values.code ? { code: values.code } : {}),
        }),
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
        throw new CreateLinkError(errorMessage(data), res.status);
      }

      return data.link;
    },

    onSuccess: () => {
      /*
       * Invalidate every page of the list, not just the one on screen. The
       * new link is newest-first so it belongs on page 1, and the totals the
       * pager reads have changed on every page at once.
       */
      queryClient.invalidateQueries({ queryKey: linksKey });

      reset();
      onCreated();
      toast.success("Link created");
    },

    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Something went wrong";

      // A taken or reserved alias is about one field, so it belongs under that
      // field rather than in a toast the user has to map back to an input.
      const isAliasProblem =
        (error instanceof CreateLinkError && error.status === 409) ||
        message.toLowerCase().includes("alias");

      if (isAliasProblem) {
        setError("code", { message });
        return;
      }

      toast.error(message);
    },
  });

  function onSubmit(values: CreateLinkValues) {
    createLink.mutate(values);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shorten a link</CardTitle>
        <CardDescription>
          Paste a long URL. Leave the alias blank and we&apos;ll generate one.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.originalUrl}>
              <FieldLabel htmlFor="originalUrl">Destination URL</FieldLabel>
              <Input
                id="originalUrl"
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder="https://example.com/a/very/long/path"
                {...register("originalUrl")}
              />
              <FieldError errors={[errors.originalUrl]} />
            </Field>

            <Field data-invalid={!!errors.code}>
              <FieldLabel htmlFor="code">Custom alias (optional)</FieldLabel>
              <Input
                id="code"
                autoComplete="off"
                placeholder="spring-sale"
                {...register("code")}
              />
              <FieldDescription>
                Letters, numbers, hyphens and underscores. Case-sensitive, so
                /Sale and /sale are different links.
              </FieldDescription>
              <FieldError errors={[errors.code]} />
            </Field>

            <Field>
              <Button type="submit" disabled={createLink.isPending}>
                {createLink.isPending ? "Shortening..." : "Shorten"}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
