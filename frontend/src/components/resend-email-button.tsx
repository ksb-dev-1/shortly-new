"use client";

import { useEffect, useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";

const COOLDOWN_SECONDS = 60;

type ResendEmailButtonProps = {
  email: string;
  endpoint: "resend-verification" | "forgot-password";
  label: string;
  successMessage: string;
};

export function ResendEmailButton({
  email,
  endpoint,
  label,
  successMessage,
}: ResendEmailButtonProps) {
  const [isSending, setIsSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Every time cooldown changes, this effect runs.
  useEffect(() => {
    // Nothing to do when the timer reaches 0.
    if (cooldown <= 0) {
      return;
    }

    const timer = setTimeout(() => {
      setCooldown((seconds) => seconds - 1);
    }, 1000);

    // Clean up the timer.
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function resend() {
    setIsSending(true);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/${endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ email }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        toast.error(errorMessage(data));
        return;
      }

      toast.success(successMessage);

      setCooldown(COOLDOWN_SECONDS);
    } catch {
      toast.error("Couldn't reach the server. Please try again.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={resend}
      disabled={isSending || cooldown > 0}
    >
      {isSending
        ? "Sending..."
        : cooldown > 0
          ? `Resend again in ${cooldown}s`
          : label}
    </Button>
  );
}
