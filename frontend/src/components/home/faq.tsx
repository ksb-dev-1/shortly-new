import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import { SectionHeading } from "./section-heading";

const FAQS = [
  {
    question: "Is Shortly free to use?",
    answer:
      "Yes. Every account gets up to 5 short links with full click analytics, no card required. Pro removes the link limit.",
  },
  {
    question: "Do short links expire?",
    answer:
      "No. A link works for as long as you keep it -- there's no time limit, only the plan's link count.",
  },
  {
    question: "Can I change where a link points after creating it?",
    answer:
      "Yes, at any time. You can also rename a link's alias later; the old alias stops working once you do.",
  },
  {
    question: "What do the click analytics actually track?",
    answer:
      "A running total per link plus a daily breakdown for the last 30 days. Only real visits are counted -- link previews and uptime checks are filtered out.",
  },
  {
    question: "Do I need to verify my email to sign up?",
    answer:
      "Yes. A verification link is sent when you create your account, and you'll need to confirm it before signing in.",
  },
  {
    question: "Can I cancel or switch plans later?",
    answer:
      "Yes, anytime, from your account's billing page -- switch between monthly and yearly, update your card, or cancel with no long-term commitment.",
  },
];

export function Faq() {
  return (
    <section className="border-b">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <SectionHeading title="Questions, answered" />

        <Accordion type="single" collapsible className="mt-10 max-w-3xl">
          {FAQS.map(({ question, answer }) => (
            <AccordionItem key={question} value={question}>
              <AccordionTrigger className="text-base">
                {question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">
                {answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
