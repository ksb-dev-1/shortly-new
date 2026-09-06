import type { Metadata } from "next";

import { PricingPlans } from "./pricing-plans";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Free for up to 5 links. Pro removes the cap.",
};

export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-16 sm:py-20">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Simple pricing<span className="text-brand">.</span>
        </h1>
        <p className="mt-3 text-muted-foreground">
          Start free. Upgrade when 5 links stop being enough.
        </p>
      </div>

      <PricingPlans />
    </div>
  );
}
