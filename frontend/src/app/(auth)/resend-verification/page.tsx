import type { Metadata } from "next";

import { ResendVerificationForm } from "./resend-verification-form";

export const metadata: Metadata = {
  title: "Resend verification",
  description: "Request a new verification link for your Shortly account.",
};

export default function ResendVerificationPage() {
  return (
    <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center p-6">
      <ResendVerificationForm />
    </div>
  );
}
