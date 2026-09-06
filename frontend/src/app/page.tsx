import type { Metadata } from "next";

import { Faq } from "@/components/home/faq";
import { Features } from "@/components/home/features";
import { Footer } from "@/components/home/footer";
import { Hero } from "@/components/home/hero";
import { HowItWorks } from "@/components/home/how-it-works";

export const metadata: Metadata = {
  title: "Home",
  description: "Shorten, manage, and track your links with Shortly.",
};

export default function Home() {
  return (
    <div className="flex flex-col">
      <Hero />
      <HowItWorks />
      <Features />
      <Faq />
      <Footer />
    </div>
  );
}
