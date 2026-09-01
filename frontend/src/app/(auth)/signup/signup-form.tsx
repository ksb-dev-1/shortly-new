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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { SignupValues, signupSchema } from "@/validation/auth";

// ============================================================
// Component: CheckYourEmail
// ============================================================
interface CheckYourEmailProps {
  email: string;
}

function CheckYourEmail({ email }: CheckYourEmailProps) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          We sent a verification link to {email}. Click it to activate your
          account — it expires in one hour.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-center text-sm text-muted-foreground">
          Didn&apos;t get it? Check your spam folder first.
        </p>
        <ResendEmailButton
          email={email}
          endpoint="resend-verification"
          label="Resend verification link"
          successMessage="If that email still needs verifying, a new link is on its way."
        />
      </CardContent>
    </Card>
  );
}

// ============================================================
// Component: SignUpCard
// ============================================================
interface SignUpCardProps {
  onSubmit: (values: SignupValues) => Promise<void>;
  isSubmitting?: boolean;
}

function SignUpCard({ onSubmit, isSubmitting = false }: SignUpCardProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
  });

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Create an account</CardTitle>
        <CardDescription>Enter your details below to sign up</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" autoComplete="name" {...register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>

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
              <FieldLabel htmlFor="password">Password</FieldLabel>
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

            <Field>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating account..." : "Sign up"}
              </Button>
            </Field>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
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
// Component: SignupForm (Parent)
// ============================================================
export function SignupForm() {
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(values: SignupValues) {
    setIsSubmitting(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/signup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(values),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        toast.error(errorMessage(data));
        return;
      }
      setSubmittedEmail(values.email);
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submittedEmail) {
    return <CheckYourEmail email={submittedEmail} />;
  }

  return <SignUpCard onSubmit={onSubmit} isSubmitting={isSubmitting} />;
}
