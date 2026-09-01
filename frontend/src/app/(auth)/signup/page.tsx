import type { Metadata } from "next";

import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Sign up",
  description: "Create a Shortly account to start shortening links.",
};

export default function SignupPage() {
  return (
    <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center p-6">
      <SignupForm />
    </div>
  );
}
