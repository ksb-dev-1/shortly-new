import { SectionHeading } from "./section-heading";

const STEPS = [
  {
    title: "Paste the long one",
    description:
      "Any URL, however sprawling — query strings, tracking parameters and all.",
  },
  {
    title: "Get a short one",
    description:
      "Pick the ending yourself, or leave it blank and Shortly generates one.",
  },
  {
    title: "Share it, watch it",
    description:
      "Send it anywhere, then check back to see how often it actually got opened.",
  },
];

export function HowItWorks() {
  return (
    <section className="border-b">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <SectionHeading title="How it works" />

        <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.title} className="border-t pt-6">
              <span className="block font-mono text-4xl font-medium text-muted-foreground/30 tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-5 text-lg font-semibold tracking-tight">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
