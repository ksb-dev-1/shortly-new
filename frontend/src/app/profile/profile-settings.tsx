"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { AvatarPicker, type PendingImage } from "@/components/avatar-picker";
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
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api";
import { type User, useAuth } from "@/lib/auth-context";

import { BillingCard } from "./billing-card";
import { ChangePasswordForm } from "./change-password-form";
import { DeleteAccountCard } from "./delete-account-card";

// mirrors backend/src/schemas/profile.schema.ts updateProfileSchema
const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Name must be at least 3 characters")
    .max(50, "Name must be at most 50 characters"),
});

type ProfileValues = z.infer<typeof profileSchema>;

// ============================================================
// Component: ProfileCard
// ============================================================
interface ProfileCardProps {
  user: User;
}

function ProfileCard({ user }: ProfileCardProps) {
  const { updateUser, refreshSession } = useAuth();

  // Held here rather than inside AvatarPicker because this is what uploads the
  // file and what clears it once the save has gone through.
  const [pending, setPending] = useState<PendingImage | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user.name },
  });

  const saveProfile = useMutation({
    mutationFn: async (values: ProfileValues) => {
      const body = new FormData();

      /*
       * Only what actually changed. The API rejects a request carrying neither
       * field with a 400, but this never sends one: onSubmit returns early
       * when nothing differs, so a no-op save costs no request and leaves
       * updated_at alone.
       */
      if (values.name !== user.name) {
        body.append("name", values.name);
      }

      if (pending) {
        body.append("image", pending.file);
      }

      const url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/profile`;
      const init: RequestInit = {
        method: "PATCH",
        credentials: "include",
        // No Content-Type header on purpose: the browser has to set it itself
        // so it can attach the multipart boundary multer needs to parse this.
        body,
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
        throw new Error(errorMessage(data, "Couldn't update your profile"));
      }

      return data.user as User;
    },

    onSuccess: (updated) => {
      // The navbar reads its name and avatar from the auth context, so this is
      // what makes the change visible anywhere outside this page.
      updateUser(updated);

      // Dropping the pending photo revokes its preview through the effect
      // above, and the saved avatar_url takes over as what the picker shows.
      setPending(null);
      toast.success("Profile updated");
    },

    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Couldn't update your profile",
      );
    },
  });

  function onSubmit(values: ProfileValues) {
    const unchanged = values.name === user.name && !pending;

    if (unchanged) {
      toast.info("Nothing to save yet");
      return;
    }

    saveProfile.mutate(values);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>How you appear across Shortly.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field>
              {/* FieldTitle, not FieldLabel: the control here is a hidden file
                  input driven by a button, so there is no single element for a
                  label to point at. */}
              <FieldTitle>Photo</FieldTitle>
              <AvatarPicker
                currentUrl={user.avatar_url}
                name={user.name}
                pending={pending}
                onChange={setPending}
                disabled={saveProfile.isPending}
              />
            </Field>

            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" autoComplete="name" {...register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" value={user.email} disabled readOnly />
              <FieldDescription>
                Changing your email isn&apos;t available yet — a new address has
                to be verified before it can replace this one.
              </FieldDescription>
            </Field>

            <Field>
              <Button type="submit" disabled={saveProfile.isPending}>
                {saveProfile.isPending ? "Saving..." : "Save changes"}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Component: ProfileSettings (Parent)
// ============================================================
export function ProfileSettings() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  /*
   * The same client-side guard the dashboard uses, for the same reason: the
   * cookies are httpOnly and read by the Express API, so nothing on the Next
   * server knows who is signed in and there is nothing to check any earlier.
   *
   * replace rather than push, so Back does not land on the page that just
   * bounced you.
   */
  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  // Covers the session restore and the redirect that follows a failed one, so
  // a signed-out visitor never sees the form flash into view.
  if (isLoading || !user) {
    return (
      <div className="flex flex-col gap-8">
        <Skeleton className="h-125 w-full rounded-xl" />
        <Skeleton className="h-100 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <ProfileCard user={user} />
      <BillingCard user={user} />
      <ChangePasswordForm />
      <DeleteAccountCard />
    </div>
  );
}
