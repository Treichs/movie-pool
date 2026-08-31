"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { TrendSeries } from "@/lib/leaderboard";

/**
 * THE BUMP CHART — every player's rank walk, week by week.
 *
 * ── RECHARTS, NOT HAND-DRAWN SVG ──────────────────────────────────────────
 * `ui/chart` is the vendored shadcn wrapper and recharts is what it wraps. A
 * first pass at this screen was going to draw the axes and the paths by hand,
 * which is a charting library rebuilt badly: no responsive container, no
 * tooltip, no keyboard or screen-reader story, and axis arithmetic that only
 * works for the data in front of me.
 *
 * ── THE SERIES HUES ARE THE APP'S OWN, NOT RECHARTS' ──────────────────────
 * `--series-1` through `--series-10` are real hues defined in both `:root` and
 * `.dark`, and the plan says not to substitute. They are handed to the chart
 * through `ChartConfig`, which is the wrapper's own mechanism for exactly this.
 *
 * ── THE Y AXIS IS REVERSED, BECAUSE 1st IS THE TOP ────────────────────────
 * A rank of 1 is the best position and the smallest number. Plotted normally it
 * would sit at the bottom of the chart, which is the opposite of what "leading"
 * looks like. `reversed` fixes it, and the ticks are whole ranks only — there
 * is no 2.5th place.
 *
 * ── `title` AND `desc` ARE THE HALF RECHARTS DOES NOT DEFAULT ─────────────
 * `accessibilityLayer` is already ON — recharts 3 defaults it to `true`, which
 * is what puts `role="application"` and `tabIndex={0}` on the `<svg>` and moves
 * the tooltip with the arrow keys. What it cannot supply is what this chart is
 * OF: an application-role element with no accessible name announces itself as
 * an unlabelled application and stops there. `Surface` renders these two props
 * as the SVG's own `<title>` and `<desc>`, which is the native mechanism and
 * the reason they are not `aria-label` — the name comes from the same element
 * a sighted user's tooltip does. `desc` carries the keyboard instruction,
 * because a control that is only navigable by a key nobody was told about is
 * navigable in theory.
 *
 * Motion needs nothing here: `isAnimationActive` defaults to `"auto"`, which
 * reads `prefers-reduced-motion` in JavaScript. It has to be JavaScript —
 * react-smooth interpolates inline styles frame by frame, so the media query
 * in `globals.css` cannot reach it.
 */
export function BumpChart({
  series,
  scoredWeeks,
}: {
  series: TrendSeries[];
  scoredWeeks: number[];
}) {
  if (scoredWeeks.length < 2) {
    return (
      <p className="text-ui text-muted-foreground">
        The chart needs two scored weeks before there is a line to draw. This
        season has {scoredWeeks.length}.
      </p>
    );
  }

  // One row per week, one column per player — recharts' long-to-wide shape.
  const data = scoredWeeks.map((week) => {
    const row: Record<string, number | string> = { week: `0${week}`.slice(-2) };
    for (const s of series) {
      const point = s.trend.find((p) => p.week === week);
      if (point) row[s.seasonMemberId] = point.pointsRank;
    }
    return row;
  });

  const config: ChartConfig = Object.fromEntries(
    series.map((s, i) => [
      s.seasonMemberId,
      { label: s.name, color: `var(--series-${(i % 10) + 1})` },
    ])
  );

  return (
    <ChartContainer config={config} className="h-72 w-full">
      <LineChart
        data={data}
        margin={{ left: 4, right: 16, top: 8 }}
        title={`Rank by week for ${series.length} ${series.length === 1 ? "player" : "players"}`}
        desc={`One line per player, plotting their place in the standings after each of ${scoredWeeks.length} scored weeks. First place is the top of the chart. Press the left and right arrow keys to move week by week.`}
      >
        <CartesianGrid vertical={false} />
        <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          reversed
          allowDecimals={false}
          width={28}
          tickLine={false}
          axisLine={false}
          domain={[1, series.length]}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        {series.map((s) => (
          <Line
            key={s.seasonMemberId}
            dataKey={s.seasonMemberId}
            type="monotone"
            stroke={`var(--color-${s.seasonMemberId})`}
            // THE VIEWER'S OWN LINE IS THICKER, and that is the only thing
            // distinguishing it — a second colour channel would fight ten hues
            // that already carry identity.
            strokeWidth={s.isMe ? 3 : 1.5}
            dot={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
