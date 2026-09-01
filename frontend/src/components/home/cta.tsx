import Link from "next/link";

import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export function Cta() {
  return (
    <section className="border-b">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-20 sm:py-24 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-brand" />
            <span className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
              Get started
            </span>
          </div>
          <h2 className="mt-5 max-w-lg text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
            Your first short link is about ten seconds away
            <span className="text-brand">.</span>
          </h2>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <Button asChild size="lg" className="group">
            <Link href="/signup">
              Create your account
              <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">Log in</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
