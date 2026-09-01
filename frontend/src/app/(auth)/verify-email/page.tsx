import { Suspense } from "react";

import type { Metadata } from "next";

import { VerifyEmailStatus } from "./verify-email-status";

export const metadata: Metadata = {
  title: "Verify email",
  description: "Verify your email address to activate your Shortly account.",
};

export default function VerifyEmailPage() {
  return (
    <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center p-6">
      <Suspense>
        <VerifyEmailStatus />
      </Suspense>
    </div>
  );
}
