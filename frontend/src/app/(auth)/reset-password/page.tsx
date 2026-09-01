import { Suspense } from "react";

import type { Metadata } from "next";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Choose a new password for your Shortly account.",
};

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center p-6">
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
