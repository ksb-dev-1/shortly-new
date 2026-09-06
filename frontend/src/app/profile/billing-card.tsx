"use client";

import Link from "next/link";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { type User, useAuth } from "@/lib/auth-context";
import { openBillingPortal } from "@/lib/billing";

export function BillingCard({ user }: { user: User }) {
  const { refreshSession } = useAuth();
  const isPro = user.plan === "pro";

  const portal = useMutation({
    mutationFn: () => openBillingPortal(refreshSession),

    // A full navigation -- the destination is Stripe's own origin.
    onSuccess: (url) => {
      window.location.href = url;
    },

    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't open the billing portal",
      );
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Billing
          <Badge variant={isPro ? "default" : "secondary"}>
            {isPro ? "Pro" : "Free"}
          </Badge>
        </CardTitle>
        <CardDescription>
          {isPro
            ? "Manage your subscription, payment method, and invoices."
            : `Up to 5 links on the free plan. Upgrade for unlimited.`}
        </CardDescription>
        <CardAction>
          {isPro ? (
            <Button
              variant="outline"
              disabled={portal.isPending}
              onClick={() => portal.mutate()}
            >
              {portal.isPending ? "Redirecting..." : "Manage billing"}
            </Button>
          ) : (
            <Button asChild>
              <Link href="/pricing">Upgrade to Pro</Link>
            </Button>
          )}
        </CardAction>
      </CardHeader>
    </Card>
  );
}
