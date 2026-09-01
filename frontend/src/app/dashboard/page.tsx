import type { Metadata } from "next";

import { LinksDashboard } from "./links-dashboard";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Create and manage your short links.",
};

export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <LinksDashboard />
    </div>
  );
}
