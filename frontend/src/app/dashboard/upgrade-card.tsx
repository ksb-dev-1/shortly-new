import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { FREE_LINK_LIMIT } from "./queries";

/**
 * Shown instead of the create-link form once a free account hits its cap.
 * The server still rejects the request either way -- this just gives the
 * reader something better to do than find that out by submitting the form.
 */
export function UpgradeCard() {
  return (
    <Card className="border-brand/40">
      <CardHeader>
        <CardTitle>You&apos;ve used all {FREE_LINK_LIMIT} free links</CardTitle>
        <CardDescription>
          Upgrade to Pro for unlimited links. Your existing links keep
          working either way.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button asChild>
          <Link href="/pricing">Upgrade to Pro</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
