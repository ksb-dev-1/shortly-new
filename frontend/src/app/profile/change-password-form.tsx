"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

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
import {
  ChangePasswordValues,
  changePasswordFormSchema,
} from "@/validation/auth";

/**
 * A rejection this form can put under a specific field rather than in a toast.
 * The status is what separates "that is not your password" from "the server is
 * down", which read identically once they are both just a message.
 */
class ChangePasswordError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function ChangePasswordForm() {
  /*
   * Opted out of the React Compiler, which is on globally via
   * `reactCompiler: true` in next.config.ts.
   *
   * This form calls reset() on success and stays mounted while it does, which
   * is the exact shape that breaks: react-hook-form re-attaches its inputs
   * through a ref callback that register() returns fresh each render, the
   * compiler memoises the props object so React never re-invokes it, and the
   * second submit reads defaultValues instead of what is on screen — reporting
   * every field as empty.
   *
   * Same reason create-link-form.tsx carries this. The edit and delete dialogs
   * do not need it: their inputs live in DialogContent, which Radix unmounts.
   */
  "use no memo";

  const { refreshSession } = useAuth();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const changePassword = useMutation({
    mutationFn: async (values: ChangePasswordValues) => {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/change-password`;
      const init: RequestInit = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        // confirmPassword stays here: it exists to catch a typo, and the
        // server has no field for it.
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      };

      let res = await fetch(url, init);

      /*
       * A 401 here is only ever an expired access token. A wrong current
       * password answers 403, precisely so this retry cannot be triggered by a
       * typo — that would burn a token rotation and spend two attempts against
       * the rate limiter for one mistake.
       */
      if (res.status === 401) {
        const refreshed = await refreshSession();

        if (refreshed) {
          res = await fetch(url, init);
        }
      }

      const data = await res.json();

      if (!res.ok) {
        throw new ChangePasswordError(
          errorMessage(data, "Couldn't change your password"),
          res.status,
        );
      }

      return data.message as string | undefined;
    },

    onSuccess: (message) => {
      // Clearing the fields matters more here than on most forms: they are
      // holding two live passwords.
      reset();

      // The server's own wording, because it carries the part the user most
      // needs to know — that their other devices have been signed out.
      toast.success(message ?? "Password changed");
    },

    onError: (error) => {
      const message =
        error instanceof Error
          ? error.message
          : "Couldn't change your password";

      /*
       * "That is not your current password" belongs under the field it is
       * about, not in a toast the reader has to map back to an input. 403 is
       * the only thing this endpoint rejects that way.
       */
      if (error instanceof ChangePasswordError && error.status === 403) {
        setError("currentPassword", { message });
        return;
      }

      toast.error(message);
    },
  });

  function onSubmit(values: ChangePasswordValues) {
    changePassword.mutate(values);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>
          Changing your password signs you out everywhere else. You stay signed
          in here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.currentPassword}>
              <FieldLabel htmlFor="currentPassword">
                Current password
              </FieldLabel>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                {...register("currentPassword")}
              />
              <FieldError errors={[errors.currentPassword]} />
            </Field>

            <Field data-invalid={!!errors.newPassword}>
              <FieldLabel htmlFor="newPassword">New password</FieldLabel>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                {...register("newPassword")}
              />
              <FieldDescription>
                At least 8 characters, with an uppercase and a lowercase letter,
                a number, and a special character.
              </FieldDescription>
              <FieldError errors={[errors.newPassword]} />
            </Field>

            <Field data-invalid={!!errors.confirmPassword}>
              <FieldLabel htmlFor="confirmPassword">
                Confirm new password
              </FieldLabel>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                {...register("confirmPassword")}
              />
              <FieldError errors={[errors.confirmPassword]} />
            </Field>

            <Field>
              <Button type="submit" disabled={changePassword.isPending}>
                {changePassword.isPending ? "Changing..." : "Change password"}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
