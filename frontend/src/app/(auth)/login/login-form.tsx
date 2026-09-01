"use client";

import { useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

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
import { useAuth } from "@/lib/auth-context";
import { LoginValues, loginSchema } from "@/validation/auth";

// ============================================================
// Component: UnverifiedEmailNotice
// ============================================================
interface UnverifiedEmailNoticeProps {
  email: string;
}

function UnverifiedEmailNotice({ email }: UnverifiedEmailNoticeProps) {
  return (
    <Field>
      <p className="text-center text-sm text-muted-foreground">
        Your email isn&apos;t verified yet.
      </p>
      <ResendEmailButton
        email={email}
        endpoint="resend-verification"
        label="Resend verification link"
        successMessage="If that email still needs verifying, a new link is on its way."
      />
    </Field>
  );
}

// ============================================================
// Component: LoginCard
// ============================================================
interface LoginCardProps {
  onSubmit: (values: LoginValues) => Promise<void>;
  isSubmitting: boolean;
  unverifiedEmail: string | null;
}

function LoginCard({
  onSubmit,
  isSubmitting,
  unverifiedEmail,
}: LoginCardProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
  });

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Log in</CardTitle>
        <CardDescription>
          Enter your email and password to continue
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

            <Field data-invalid={!!errors.password}>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Link
                  href="/forgot-password"
                  className="text-sm underline underline-offset-4"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register("password")}
              />
              <FieldError errors={[errors.password]} />
            </Field>

            <Field>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Logging in..." : "Log in"}
              </Button>
            </Field>

            {unverifiedEmail && (
              <UnverifiedEmailNotice email={unverifiedEmail} />
            )}

            <p className="text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="underline underline-offset-4">
                Sign up
              </Link>
            </p>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Component: LoginForm (Parent)
// ============================================================
export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(values: LoginValues) {
    setIsSubmitting(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
          credentials: "include",
        },
      );

      const data = await res.json();

      if (!res.ok) {
        // Show unverified notice for 403 status
        setUnverifiedEmail(res.status === 403 ? values.email : null);
        toast.error(errorMessage(data));
        return;
      }

      login(data.user);
      toast.success("Logged in");
      router.push("/dashboard");
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <LoginCard
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      unverifiedEmail={unverifiedEmail}
    />
  );
}
