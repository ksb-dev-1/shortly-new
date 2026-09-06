"use client";

import { Suspense, useEffect } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { toast } from "sonner";

/**
 * Reports how Checkout ended, then strips `?checkout=...` so a refresh
 * doesn't repeat the toast. This is only ever a hint about the redirect --
 * the webhook is what actually grants Pro, and it can lag a moment behind
 * the browser landing back here. See billing.controller.ts.
 */
function CheckoutStatus() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const checkout = searchParams.get("checkout");

  useEffect(() => {
    if (checkout === "success") {
      toast.success("You're on Pro. Unlimited links from now on.");
    } else if (checkout === "cancelled") {
      toast.info("Checkout cancelled. You haven't been charged.");
    }

    if (checkout) {
      router.replace("/dashboard");
    }
  }, [checkout, router]);

  return null;
}

// useSearchParams needs a Suspense boundary above it, or a static build of
// this route fails.
export function CheckoutStatusToast() {
  return (
    <Suspense fallback={null}>
      <CheckoutStatus />
    </Suspense>
  );
}
