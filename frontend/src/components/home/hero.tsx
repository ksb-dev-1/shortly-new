"use client";

import { useEffect, useState } from "react";

import { ArrowDown, Check, Copy } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { StartShorteningButton } from "@/components/home/start-shortening-button";
import { cn } from "@/lib/utils";

const PAIRS = [
  {
    long: "example.com/blog/2026/how-we-grew-from-zero-to-ten-thousand-users",
    short: "shortly.sh/gr0wth",
  },
  {
    long: "example.com/products/wireless-noise-cancelling-headphones?ref=nl",
    short: "shortly.sh/h3adph0nes",
  },
  {
    long: "example.com/docs/getting-started/installation-and-setup-guide-v2",
    short: "shortly.sh/qu1ckstart",
  },
];

/*
 * The long link is fed into the machine, the machine works, a short link drops
 * out the bottom.
 *
 * Both rows are fixed-height boxes with overflow hidden, which is what sells
 * it: the long URL slides down past its own bottom edge and is genuinely
 * clipped out of sight, and the short one slides in from above its top edge.
 * Nothing fades in place, so neither row looks like text merely swapping.
 */
type Phase = "ready" | "feeding" | "working" | "out";

const PHASE_MS: Record<Phase, number> = {
  ready: 700,
  feeding: 550,
  working: 650,
  out: 2200,
};

const NEXT_PHASE: Record<Phase, Phase> = {
  ready: "feeding",
  feeding: "working",
  working: "out",
  out: "ready",
};

const ROW_HEIGHT = "2.75rem";

export function Hero() {
  const reduceMotion = useReducedMotion();
  const [state, setState] = useState({ index: 0, phase: "ready" as Phase });
  const [copied, setCopied] = useState(false);

  const pair = PAIRS[state.index];

  /*
   * One timeout per phase. Every state change happens inside the callback
   * rather than in the effect body — which is what the react-hooks lint rule
   * asks for, and what stops two phases from ever being in flight at once.
   */
  useEffect(() => {
    if (reduceMotion) return;

    const id = setTimeout(() => {
      setState(({ index, phase }) => {
        const next = NEXT_PHASE[phase];

        return next === "ready"
          ? { index: (index + 1) % PAIRS.length, phase: next }
          : { index, phase: next };
      });
    }, PHASE_MS[state.phase]);

    return () => clearTimeout(id);
  }, [state, reduceMotion]);

  // Reduced motion: no machinery, just the finished pairs rotating.
  useEffect(() => {
    if (!reduceMotion) return;

    const id = setInterval(() => {
      setState(({ index }) => ({
        index: (index + 1) % PAIRS.length,
        phase: "out",
      }));
    }, PHASE_MS.out);

    return () => clearInterval(id);
  }, [reduceMotion]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`https://${pair.short}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused outright — a denied permission, or an
      // insecure origin. Nothing is broken, so nothing needs saying.
    }
  }

  const { phase } = state;
  const swallowed = !reduceMotion && (phase === "working" || phase === "out");
  const running = !reduceMotion && phase === "working";
  const delivered = reduceMotion || phase === "out";

  /*
   * The dotted-grid backdrop that used to cover this section is gone. It and
   * the glow behind the panel were two decorative effects competing over the
   * same area, and the grid was the one doing nothing the layout needed.
   */
  return (
    <section className="relative overflow-hidden border-b">
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 py-20 sm:py-28 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
        <div>
          <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            Long links,
            <br />
            cut down to size<span className="text-brand">.</span>
          </h1>

          <p className="mt-5 max-w-md text-lg leading-relaxed text-muted-foreground">
            Shortly turns long, unshareable URLs into clean links you can send
            anywhere, and keeps count of how often each one gets opened.
          </p>

          <div className="mt-8">
            <StartShorteningButton />
          </div>

          {/* Was a monospace line of facts separated by middots. Three claims
              punctuated like a spec sheet drew more attention than they earn
              sitting under the main call to action. */}
          <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
            Free to use, with email-verified accounts and no visitor tracking.
          </p>
        </div>

        <div className="relative">
          <div
            aria-hidden
            className="absolute -inset-6 -z-10 rounded-[2rem] bg-brand/5 blur-2xl"
          />

          <div className="overflow-hidden rounded-2xl border bg-card shadow-xl shadow-foreground/5">
            <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2.5">
              <span className="font-mono text-xs text-muted-foreground">
                shortly
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "size-1.5 rounded-full bg-brand transition-opacity",
                    running ? "animate-pulse" : "opacity-60",
                  )}
                />
                <span className="font-mono text-[11px] text-muted-foreground">
                  {running ? "working" : "live"}
                </span>
              </span>
            </div>

            <div aria-hidden className="px-5 py-7">
              {/* IN — clipped, so the link is cut off as it descends */}
              <div className="overflow-hidden" style={{ height: ROW_HEIGHT }}>
                <motion.div
                  key={pair.long}
                  animate={
                    swallowed
                      ? { y: "100%", opacity: 0, scale: 0.94 }
                      : { y: 0, opacity: 1, scale: 1 }
                  }
                  transition={{ duration: 0.45, ease: "easeIn" }}
                  className="flex items-center rounded-lg border bg-muted/30 px-3"
                  style={{ height: ROW_HEIGHT }}
                >
                  <span className="truncate font-mono text-[13px] text-muted-foreground">
                    {pair.long}
                  </span>
                </motion.div>
              </div>

              {/* THE MACHINE */}
              <div className="relative my-2.5 overflow-hidden rounded-lg border border-brand/30 bg-brand-subtle py-3.5">
                {/* the mouth it goes in through */}
                <div className="mx-auto h-1 w-20 rounded-full bg-foreground/15" />

                <p className="mt-2.5 text-center font-mono text-[10px] tracking-[0.2em] text-brand/70 uppercase">
                  shortening
                </p>

                {/* a pass of the scanner, only while it is actually working */}
                {running && (
                  <motion.div
                    initial={{ y: -2, opacity: 0 }}
                    animate={{ y: 56, opacity: [0, 1, 0] }}
                    transition={{
                      duration: PHASE_MS.working / 1000,
                      ease: "linear",
                    }}
                    className="absolute inset-x-0 top-0 h-px bg-brand"
                  />
                )}
              </div>

              {/* OUT — clipped, so the short link rises out of the machine */}
              <div className="overflow-hidden" style={{ height: ROW_HEIGHT }}>
                <AnimatePresence mode="wait">
                  {delivered ? (
                    <motion.div
                      key={pair.short}
                      initial={{ y: "-100%", opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="flex items-center justify-between rounded-lg border border-brand/30 bg-brand-subtle px-3"
                      style={{ height: ROW_HEIGHT }}
                    >
                      <span className="font-mono text-[13px] font-medium text-brand">
                        {pair.short}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopy}
                        aria-label={`Copy ${pair.short}`}
                        className="rounded-md p-1 text-brand/70 transition-colors hover:bg-brand/10 hover:text-brand"
                      >
                        {copied ? (
                          <Check className="size-3.5" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="empty"
                      exit={{ opacity: 0 }}
                      className="flex items-center justify-center rounded-lg border border-dashed px-3"
                      style={{ height: ROW_HEIGHT }}
                    >
                      <ArrowDown className="size-3.5 text-muted-foreground/30" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <p className="sr-only">
              Demonstration: the long URL {pair.long} becomes {pair.short}.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
