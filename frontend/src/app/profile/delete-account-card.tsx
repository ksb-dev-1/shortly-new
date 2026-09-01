"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

/** Carries the status so a wrong password can be shown under the field. */
class DeleteAccountError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// The server checks the password against the stored hash; presence is all
// there is to validate here.
const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

type DeleteAccountValues = z.infer<typeof deleteAccountSchema>;

export function DeleteAccountCard() {
  const router = useRouter();
  const { logout, refreshSession } = useAuth();
  const [open, setOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<DeleteAccountValues>({
    resolver: zodResolver(deleteAccountSchema),
    defaultValues: { password: "" },
  });

  const deleteAccount = useMutation({
    mutationFn: async (values: DeleteAccountValues) => {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/profile`;
      const init: RequestInit = {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(values),
      };

      let res = await fetch(url, init);

      /*
       * A 401 here is only ever an expired access token — a wrong password
       * answers 403, so a typo cannot trigger this retry and quietly spend a
       * second attempt against the rate limiter.
       */
      if (res.status === 401) {
        const refreshed = await refreshSession();

        if (refreshed) {
          res = await fetch(url, init);
        }
      }

      const data = await res.json();

      if (!res.ok) {
        throw new DeleteAccountError(
          errorMessage(data, "Couldn't delete your account"),
          res.status,
        );
      }
    },

    onSuccess: async () => {
      /*
       * The account and its cookies are already gone, so this is not really a
       * logout — it is reused because it is what clears the cached queries and
       * the signed-in user, and leaving either behind would show a deleted
       * account's links to whoever signs in next on this browser. Its request
       * is a harmless no-op: /auth/logout answers 200 with or without a
       * session.
       */
      await logout();

      toast.success("Your account has been deleted");

      // replace, so Back cannot return to a profile page for an account that
      // no longer exists.
      router.replace("/");
    },

    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Couldn't delete your account";

      // A wrong password belongs under the field it is about.
      if (error instanceof DeleteAccountError && error.status === 403) {
        setError("password", { message });
        return;
      }

      toast.error(message);
    },
  });

  function onSubmit(values: DeleteAccountValues) {
    deleteAccount.mutate(values);
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>Delete account</CardTitle>
        <CardDescription>
          Permanently delete your account, every link on it, and all of their
          click history. This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);

            // Never leave a password sitting in a closed dialog, and start the
            // next attempt without the error from the last one.
            if (!next) reset();
          }}
        >
          <AlertDialogTrigger asChild>
            <Button variant="destructive">Delete account</Button>
          </AlertDialogTrigger>

          <AlertDialogContent>
            {/* A form rather than AlertDialogAction, so Enter submits and so
                the dialog stays open when the password is wrong — Radix closes
                on its action button by default. */}
            <form onSubmit={handleSubmit(onSubmit)} noValidate>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2">
                    <p>
                      Every short link you have created will stop working
                      immediately for everyone you have shared it with, and
                      their click history goes with them.
                    </p>
                    <p>Enter your password to confirm.</p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>

              <Field data-invalid={!!errors.password} className="my-6">
                <FieldLabel htmlFor="delete-password">Password</FieldLabel>
                <Input
                  id="delete-password"
                  type="password"
                  autoComplete="current-password"
                  {...register("password")}
                />
                <FieldError errors={[errors.password]} />
              </Field>

              <AlertDialogFooter>
                <AlertDialogCancel
                  type="button"
                  disabled={deleteAccount.isPending}
                >
                  Cancel
                </AlertDialogCancel>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={deleteAccount.isPending}
                >
                  {deleteAccount.isPending ? "Deleting..." : "Delete account"}
                </Button>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
