"use client";

import { useState } from "react";

import Link from "next/link";

import { useMutation } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { openBillingPortal, startCheckout } from "@/lib/billing";

type BillingCycle = "monthly" | "yearly";

// Mirrors the two Stripe Prices on the one Product in the dashboard --
// there is nowhere else in the app that knows these amounts.
const MONTHLY_PRICE_INR = 499;
const YEARLY_PRICE_INR = 3799;
const YEARLY_MONTHLY_EQUIVALENT_INR = Math.round(YEARLY_PRICE_INR / 12);
const YEARLY_SAVINGS_PERCENT = Math.round(
  (1 - YEARLY_PRICE_INR / (MONTHLY_PRICE_INR * 12)) * 100,
);

function formatInr(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

const FREE_FEATURES = ["Up to 5 short links", "Click analytics, 30-day chart"];

const PRO_FEATURES = [
  "Unlimited short links",
  "Click analytics, 30-day chart",
  "Cancel or switch plans anytime",
];

export function PricingPlans() {
  const { user, isLoading: isAuthLoading, refreshSession } = useAuth();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  const checkout = useMutation({
    mutationFn: (plan: BillingCycle) => startCheckout(plan, refreshSession),

    // A full navigation, not router.push -- the destination is Stripe's own
    // origin, not a route this app knows.
    onSuccess: (url) => {
      window.location.href = url;
    },

    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Couldn't start checkout",
      );
    },
  });

  const portal = useMutation({
    mutationFn: () => openBillingPortal(refreshSession),

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

  const isPro = !isAuthLoading && user?.plan === "pro";

  return (
    <div className="mt-12">
      <div className="mx-auto flex w-fit rounded-lg border p-1">
        <Button
          type="button"
          size="sm"
          variant={cycle === "monthly" ? "default" : "ghost"}
          onClick={() => setCycle("monthly")}
        >
          Monthly
        </Button>
        <Button
          type="button"
          size="sm"
          variant={cycle === "yearly" ? "default" : "ghost"}
          onClick={() => setCycle("yearly")}
        >
          Yearly
          <Badge variant="secondary" className="ml-1">
            Save {YEARLY_SAVINGS_PERCENT}%
          </Badge>
        </Button>
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">Free</CardTitle>
              {!isAuthLoading && user?.plan === "free" && (
                <Badge variant="secondary">Current plan</Badge>
              )}
            </div>
            <CardDescription>For trying Shortly out.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-6">
            <div className="text-3xl font-semibold tracking-tight">
              {formatInr(0)}
              <span className="text-sm font-normal text-muted-foreground">
                /month
              </span>
            </div>
            <ul className="flex flex-col gap-2.5 text-sm">
              {FREE_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand" />
                  {feature}
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button asChild variant="outline" className="w-full">
              <Link href={!isAuthLoading && user ? "/dashboard" : "/signup"}>
                {!isAuthLoading && user ? "Go to dashboard" : "Get started"}
              </Link>
            </Button>
          </CardFooter>
        </Card>

        <Card className="ring-2 ring-brand">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">Pro</CardTitle>
              <Badge>{isPro ? "Current plan" : "Most popular"}</Badge>
            </div>
            <CardDescription>For links you rely on.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-6">
            <div>
              <div className="text-3xl font-semibold tracking-tight">
                {cycle === "monthly"
                  ? formatInr(MONTHLY_PRICE_INR)
                  : formatInr(YEARLY_PRICE_INR)}
                <span className="text-sm font-normal text-muted-foreground">
                  /{cycle === "monthly" ? "month" : "year"}
                </span>
              </div>
              {cycle === "yearly" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Works out to {formatInr(YEARLY_MONTHLY_EQUIVALENT_INR)}/month
                </p>
              )}
            </div>
            <ul className="flex flex-col gap-2.5 text-sm">
              {PRO_FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand" />
                  {feature}
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            {isAuthLoading ? null : isPro ? (
              <Button
                variant="outline"
                className="w-full"
                disabled={portal.isPending}
                onClick={() => portal.mutate()}
              >
                {portal.isPending ? "Redirecting..." : "Manage billing"}
              </Button>
            ) : user ? (
              <Button
                className="w-full"
                disabled={checkout.isPending}
                onClick={() => checkout.mutate(cycle)}
              >
                {checkout.isPending ? "Redirecting..." : "Subscribe"}
              </Button>
            ) : (
              <Button asChild className="w-full">
                <Link href="/signup">Get started</Link>
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
