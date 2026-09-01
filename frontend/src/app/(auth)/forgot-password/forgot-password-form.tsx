"use client";

import { useState } from "react";

import Link from "next/link";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { ResendEmailButton } from "@/components/resend-email-button";
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { ForgotPasswordValues, forgotPasswordSchema } from "@/validation/auth";

// ============================================================
// Component: ForgotPasswordSuccessCard
// ============================================================
interface ForgotPasswordSuccessCardProps {
  email: string;
}

function ForgotPasswordSuccessCard({ email }: ForgotPasswordSuccessCardProps) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          If {email} is registered, we&apos;ve sent a link to reset your
          password. It expires in one hour.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ResendEmailButton
          email={email}
          endpoint="forgot-password"
          label="Resend reset link"
          successMessage="If that email is registered, a reset link is on its way."
        />
        <Button asChild variant="ghost" className="w-full">
          <Link href="/login">Back to login</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Component: ForgotPasswordFormCard
// ============================================================
interface ForgotPasswordFormCardProps {
  onSubmit: (values: ForgotPasswordValues) => Promise<void>;
  isSubmitting: boolean;
}

function ForgotPasswordFormCard({
  onSubmit,
  isSubmitting,
}: ForgotPasswordFormCardProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Forgot password</CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you a reset link
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.email}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                {...register("email")}
              />
              <FieldError errors={[errors.email]} />
            </Field>

            <Field>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Sending..." : "Send reset link"}
              </Button>
            </Field>

            <p className="text-center text-sm text-muted-foreground">
              Remembered your password?{" "}
              <Link href="/login" className="underline underline-offset-4">
                Log in
              </Link>
            </p>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Component: ForgotPasswordForm (Parent)
// ============================================================
export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(values: ForgotPasswordValues) {
    setIsSubmitting(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/forgot-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
          credentials: "include",
        },
      );

      const data = await res.json();

      if (!res.ok) {
        toast.error(errorMessage(data));
        return;
      }

      setSentTo(values.email);
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (sentTo) {
    return <ForgotPasswordSuccessCard email={sentTo} />;
  }

  return (
    <ForgotPasswordFormCard onSubmit={onSubmit} isSubmitting={isSubmitting} />
  );
}
