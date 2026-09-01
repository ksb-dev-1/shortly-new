import type { Metadata } from "next";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot password",
  description: "Reset the password for your Shortly account.",
};

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center p-6">
      <ForgotPasswordForm />
    </div>
  );
}
