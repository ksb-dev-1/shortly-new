"use client";

import { useState } from "react";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { zodResolver } from "@hookform/resolvers/zod";
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
import {
  ResetPasswordValues,
  resetPasswordFormSchema,
} from "@/validation/auth";

// ============================================================
// Component: InvalidTokenCard
// ============================================================
function InvalidTokenCard() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Invalid link</CardTitle>
        <CardDescription>
          This password reset link is missing or invalid. Request a new one from
          the{" "}
          <Link
            href="/forgot-password"
            className="underline underline-offset-4"
          >
            forgot password
          </Link>{" "}
          page.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

// ============================================================
// Component: ResetSuccessCard
// ============================================================
function ResetSuccessCard() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Password reset</CardTitle>
        <CardDescription>
          Your password has been reset. You can now log in with your new
          password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="w-full">
          <Link href="/login">Go to login</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Component: ResetPasswordFormCard
// ============================================================
interface ResetPasswordFormCardProps {
  onSubmit: (values: ResetPasswordValues) => Promise<void>;
  isSubmitting: boolean;
}

function ResetPasswordFormCard({
  onSubmit,
  isSubmitting,
}: ResetPasswordFormCardProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordFormSchema),
  });

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Reset password</CardTitle>
        <CardDescription>Enter your new password below</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="password">New password</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                {...register("password")}
              />
              <FieldDescription>
                At least 8 characters, with an uppercase and a lowercase letter,
                a number, and a special character.
              </FieldDescription>
              <FieldError errors={[errors.password]} />
            </Field>

            <Field data-invalid={!!errors.confirmPassword}>
              <FieldLabel htmlFor="confirmPassword">
                Confirm password
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
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Resetting..." : "Reset password"}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Component: ResetPasswordForm (Parent)
// ============================================================
export function ResetPasswordForm() {
  const token = useSearchParams().get("token");
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(values: ResetPasswordValues) {
    setIsSubmitting(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/reset-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password: values.password }),
          credentials: "include",
        },
      );

      const data = await res.json();

      if (!res.ok) {
        toast.error(errorMessage(data));
        return;
      }

      setSubmitted(true);
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Check for missing token first
  if (!token) {
    return <InvalidTokenCard />;
  }

  // Show success state
  if (submitted) {
    return <ResetSuccessCard />;
  }

  // Show the form
  return (
    <ResetPasswordFormCard onSubmit={onSubmit} isSubmitting={isSubmitting} />
  );
}
