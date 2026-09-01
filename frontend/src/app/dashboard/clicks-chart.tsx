"use client";

import { useState } from "react";

import type { DailyClicks } from "./types";

/*
 * Bar colour is set as --bar on the root below, one validated step per mode.
 *
 * Both were checked against the surface they sit on rather than picked by eye.
 * Light (#DC321F) is the brand token itself and passes as-is. The dark UI
 * brand (#F96E52) fails the lightness band against a dark card, so the bars
 * use #EA6045 — the nearest step that passes, visibly the same hue and a
 * little deeper. The dark value is chosen, not derived from the light one.
 *
 * One series, so a single hue rather than a categorical set, and no legend:
 * the heading names what the bars are.
 */
const CHART_HEIGHT_PX = 160;

/** Zero days still get a visible tick, so the axis reads as days not gaps. */
const EMPTY_BAR_PX = 2;

const dayMonth = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});

const fullDate = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

// midday UTC keeps the label on the intended day whatever the reader's offset
const asDate = (iso: string) => new Date(`${iso}T12:00:00Z`);

export function ClicksChart({ series }: { series: DailyClicks[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  const peak = Math.max(...series.map((d) => d.clicks), 0);
  const busiest = series.reduce(
    (best, day) => (day.clicks > best.clicks ? day : best),
    series[0] ?? { date: "", clicks: 0 },
  );

  const summary =
    peak === 0
      ? "No clicks in the last 30 days."
      : `Daily clicks over the last 30 days. Busiest day ${fullDate.format(
          asDate(busiest.date),
        )} with ${busiest.clicks}.`;

  const active = hovered === null ? null : series[hovered];

  return (
    // --bar carries the validated step for each mode, so the dark value is a
    // chosen colour rather than a filter applied to the light one
    <div className="flex flex-col gap-2 [--bar:#DC321F] dark:[--bar:#EA6045]">
      {/* Peak gridline, deliberately recessive — one reference line is enough
          to read height against without competing with the bars. */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {peak}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div
        className="relative flex items-end gap-0.5"
        style={{ height: CHART_HEIGHT_PX }}
        role="img"
        aria-label={summary}
        onMouseLeave={() => setHovered(null)}
      >
        {series.map((day, index) => {
          const height =
            peak === 0
              ? EMPTY_BAR_PX
              : Math.max(EMPTY_BAR_PX, (day.clicks / peak) * CHART_HEIGHT_PX);

          return (
            <div
              key={day.date}
              className="group relative flex h-full flex-1 cursor-default items-end"
              onMouseEnter={() => setHovered(index)}
            >
              {/* full-height hit area: a 3px bar is far too small a target */}
              <span
                aria-hidden
                className="absolute inset-0 rounded-xs group-hover:bg-foreground/5"
              />
              <span
                aria-hidden
                className={`relative w-full rounded-t-xs transition-[filter] group-hover:brightness-110 ${
                  day.clicks === 0 ? "bg-border" : "bg-(--bar)"
                }`}
                style={{ height }}
              />
            </div>
          );
        })}

        {active && (
          <div
            className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 rounded-md border bg-popover px-2.5 py-1.5 text-center shadow-md"
            role="status"
          >
            <p className="font-mono text-xs font-medium tabular-nums">
              {active.clicks} click{active.clicks === 1 ? "" : "s"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {fullDate.format(asDate(active.date))}
            </p>
          </div>
        )}
      </div>

      {/* Three labels, not thirty. Enough to anchor the range. */}
      <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
        {[0, Math.floor(series.length / 2), series.length - 1].map((i) =>
          series[i] ? (
            <span key={series[i].date}>
              {dayMonth.format(asDate(series[i].date))}
            </span>
          ) : null,
        )}
      </div>

      {/* The same numbers, reachable without reading the bars. */}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
          View as table
        </summary>
        <div className="mt-2 max-h-48 overflow-y-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/50">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Date</th>
                <th className="px-3 py-1.5 text-right font-medium">Clicks</th>
              </tr>
            </thead>
            <tbody>
              {series.map((day) => (
                <tr key={day.date} className="border-t">
                  <td className="px-3 py-1">
                    {fullDate.format(asDate(day.date))}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums">
                    {day.clicks}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
