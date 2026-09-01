/**
 * A section title with a short brand rule above it.
 *
 * There used to be an uppercase, letter-spaced label on that rule — "THE FLOW",
 * "CAPABILITIES". It was dropped: a generic category word above every heading
 * is the most recognisable thing about a template, and none of them told the
 * reader anything the heading underneath did not.
 */
export function SectionHeading({ title }: { title: string }) {
  return (
    <div>
      <span className="block h-px w-8 bg-brand" />
      <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h2>
    </div>
  );
}
