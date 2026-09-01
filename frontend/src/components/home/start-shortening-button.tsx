"use client";

import Link from "next/link";

import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

export function StartShorteningButton() {
  const { user, isLoading } = useAuth();

  /*
   * /dashboard while the session is still being restored, rather than /login.
   *
   * Both cases then land in the right place: the dashboard's own guard sends a
   * signed-out visitor on to /login, so the worst case is one redirect. The
   * other default has no such safety net — it would show a login form to
   * someone already signed in, which is the more confusing way to be wrong.
   */
  const href = isLoading || user ? "/dashboard" : "/login";

  return (
    <Button asChild size="lg" className="group">
      <Link href={href}>
        Start shortening
        <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
      </Link>
    </Button>
  );
}
