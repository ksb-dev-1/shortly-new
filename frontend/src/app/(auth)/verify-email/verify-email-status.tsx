"use client";

import { useEffect, useRef, useState } from "react";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { errorMessage } from "@/lib/api";

// ============================================================
// Types
// ============================================================
type Status = "verifying" | "success" | "error";

// ============================================================
// Component: VerifyingCard
// ============================================================
function VerifyingCard() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Verifying your email...</CardTitle>
        <CardDescription>This will just take a moment.</CardDescription>
      </CardHeader>
    </Card>
  );
}

// ============================================================
// Component: VerifyErrorCard
// ============================================================
interface VerifyErrorCardProps {
  message: string;
}

function VerifyErrorCard({ message }: VerifyErrorCardProps) {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Verification failed</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button asChild className="w-full">
          <Link href="/resend-verification">Get a new link</Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link href="/signup">Back to sign up</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Component: VerifySuccessCard
// ============================================================
function VerifySuccessCard() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Email verified</CardTitle>
        <CardDescription>
          Your email has been verified. You can now log in.
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
// Component: VerifyEmailStatus (Parent)
// ============================================================
export function VerifyEmailStatus() {
  const token = useSearchParams().get("token");

  // A missing token is knowable at first render, so it's the initial state
  const [status, setStatus] = useState<Status>(token ? "verifying" : "error");
  const [message, setMessage] = useState(
    token ? "" : "This verification link is missing or invalid.",
  );

  /*
   * Run this exactly once.
   *
   * React invokes effects twice in development, and the token is single-use:
   * the second run would present one the first has already spent, and report
   * that as an invalid link over a verification that actually worked.
   *
   * There is deliberately no "is it still mounted?" flag alongside this one.
   * The two cannot coexist: StrictMode's cleanup runs while the request is
   * still in flight, so the flag it clears belongs to the one run that is ever
   * going to finish — its result was dropped, status stayed "verifying", and
   * the card span for good even though the email had been verified. Since
   * React 18 a state update after unmount is a silent no-op, so there was
   * nothing for that flag to protect against in the first place.
   */
  const hasFired = useRef(false);

  useEffect(() => {
    if (!token || hasFired.current) return;
    hasFired.current = true;

    async function verifyEmail() {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/verify-email`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ token }),
          },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(errorMessage(data));
        }

        setStatus("success");
      } catch (error) {
        setStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "Couldn't reach the server. Please try again.",
        );
      }
    }

    verifyEmail();
  }, [token]);

  // Render based on status
  if (status === "verifying") {
    return <VerifyingCard />;
  }

  if (status === "error") {
    return <VerifyErrorCard message={message} />;
  }

  return <VerifySuccessCard />;
}
