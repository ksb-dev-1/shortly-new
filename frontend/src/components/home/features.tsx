import { BarChart3, LayoutDashboard, Link2, Pencil } from "lucide-react";

import { SectionHeading } from "./section-heading";

/*
 * These used to be four claims with numbers attached — a "42 ms average", a
 * list of links with 1.2k and 834 clicks against them, a bar chart. All of it
 * was invented. Made-up figures presented as measurements are the fastest way
 * to make a page read as filler, so every one of them is gone, and what is
 * left is only things the app actually does.
 */
const FEATURES = [
  {
    icon: Link2,
    title: "Aliases you choose",
    description:
      "Name a link yourself, or leave it blank and get a generated one. Aliases are case-sensitive, so /Sale and /sale are two different links.",
  },
  {
    icon: BarChart3,
    title: "Clicks, counted honestly",
    description:
      "A running total per link plus a daily breakdown for the last 30 days. Only real visits count — link previews and uptime checks are ignored.",
  },
  {
    icon: Pencil,
    title: "Nothing is set in stone",
    description:
      "Change where a link points, or rename it, long after you made it. Renaming retires the old alias, and Shortly says so before you commit.",
  },
  {
    icon: LayoutDashboard,
    title: "Every link in one place",
    description:
      "Your dashboard lists everything you have shortened, newest first, with its destination and click count — editable or deletable from the same row.",
  },
];

export function Features() {
  return (
    <section className="border-b">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <SectionHeading title="What it does" />

        <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="border-t pt-6">
              <Icon className="size-5 text-brand" />
              <h3 className="mt-5 text-lg font-semibold tracking-tight">
                {title}
              </h3>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
