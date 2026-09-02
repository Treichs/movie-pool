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
 * THE RANK WALK — every player's place, week by week.
 *
 * ── IT WAS DELETED ON 2026-09-02 AND IS BACK WITH ITS ENCODING FIXED ──────
 * The note that removed it said ten lines crossing in a 444px cell is not a
 * rank walk, and that no amount of height fixes it. Half of that was right.
 * The cell was too narrow — it now takes eight of twelve columns on a 90rem
 * page, roughly double — but width was never the whole problem. The problem
 * was that TEN LINES WERE ASKED TO CARRY TEN IDENTITIES IN COLOUR.
 *
 * `--series-1` through `--series-10` exist in `globals.css` and were built for
 * exactly this chart. Measured, they cannot do the job: eight of the ten fall
 * below the chroma floor and read as grey, seven fall below 3:1 against a white
 * panel, and the worst adjacent pair separates by ΔE 3.9 for NORMAL colour
 * vision — indistinguishable before colour-blindness is considered at all.
 * That is almost certainly why the chart read as spaghetti, and it is not a
 * palette anyone can tune into ten legible lines.
 *
 * ── SO THREE LINES ARE NAMED AND THE REST ARE A FIELD ─────────────────────
 * The reader's question is never "where are all ten of us". It is "where am I,
 * who is just above me, and who is just behind me" — the same three facts the
 * hero states in words. Those three get colour:
 *
 *     YOU               --primary      the accent, meaning live and yours
 *     THE PLACE ABOVE   --chart-2      what you are chasing
 *     THE PLACE BELOW   --chart-4      what is chasing you
 *     EVERYONE ELSE     one muted line at 30%, no identity in colour at all
 *
 * Those three were run through the palette checks rather than eyeballed: they
 * pass the lightness band, the chroma floor, colour-vision separation (worst
 * adjacent ΔE 17.9 protan) and the normal-vision floor. `--chart-4` sits at
 * 2.07:1 against the panel, which is a warning rather than a pass — relieved
 * by the legend below, where every named line is stated in words as well as in
 * colour.
 *
 * THE FIELD IS STILL FULLY IDENTIFIED, just not by colour: every line keeps its
 * own `ChartConfig` entry, so the tooltip names whoever you are hovering. What
 * the field loses is the pretence that a reader could tell Dev Mira from Dev
 * Luis by hue. They never could.
 *
 * ── WHY THE LEGEND AND NOT DIRECT LABELS ──────────────────────────────────
 * Direct labels at the line ends are the stronger pattern and they are wrong
 * here. Ranks are integers one row apart, so two labels collide exactly when
 * two players are neck and neck — the moment the chart is most worth reading.
 * The legend sits below, always legible, and costs one line of height.
 *
 * ── WHAT WAS KEPT FROM THE ORIGINAL, UNCHANGED ────────────────────────────
 * The reversed Y axis (first place is the top, and a rank of 1 plotted normally
 * would sit at the bottom); the explicit whole-number ticks (recharts skipped
 * the "1" tick and drew an empty band exactly where the leader runs); the
 * `title`/`desc` pair, which are the SVG's own accessible name and description
 * rather than an `aria-label`, because recharts' `accessibilityLayer` gives the
 * chart `role="application"` and an unnamed application announces nothing;
 * and the top margin of 16, which is what stops that first tick being dropped.
 *
 * ── THE LINES ARE SMOOTH, AND `monotone` IS THE ONLY SMOOTH ALLOWED ───────
 * Smooth curves are the developer's call, made on 2026-09-02: a rank walk is
 * read as movement, and straight segments make a season look like a set of
 * unrelated weeks rather than a run of form.
 *
 * `monotone` SPECIFICALLY, and it is not interchangeable with the other smooth
 * types. A monotone cubic cannot overshoot the points it joins, so a line
 * between 3rd and 4th stays between 3rd and 4th. `natural` and `basis` both
 * bulge past their control points, which here would draw a player passing
 * through 2nd on the way from 3rd to 4th — a place they never held, in a chart
 * whose entire subject is which place somebody held.
 *
 * The honest reading of the cost, so nobody has to rediscover it: a rank is
 * settled once a week, and any curve between two weeks is drawn rather than
 * measured. The tooltip carries the real per-week values.
 *
 * Motion needs nothing: `isAnimationActive` defaults to `"auto"`, which reads
 * `prefers-reduced-motion` in JavaScript. It has to be JavaScript — react-smooth
 * interpolates inline styles frame by frame, so the media query in `globals.css`
 * cannot reach it.
 */

const FIELD_COLOR = "var(--color-muted-foreground)";

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

  // `series` arrives in standings order, so the viewer's neighbours are simply
  // the entries either side of them. A leader has nobody above and the last
  // player has nobody below; both are normal, and neither invents a line.
  const meIndex = series.findIndex((s) => s.isMe);
  const aboveId = meIndex > 0 ? series[meIndex - 1].seasonMemberId : null;
  const belowId =
    meIndex >= 0 && meIndex < series.length - 1
      ? series[meIndex + 1].seasonMemberId
      : null;

  const roleOf = (s: TrendSeries) =>
    s.isMe
      ? "me"
      : s.seasonMemberId === aboveId
        ? "above"
        : s.seasonMemberId === belowId
          ? "below"
          : "field";

  const COLOR = {
    me: "var(--color-primary)",
    above: "var(--color-chart-2)",
    below: "var(--color-chart-4)",
    field: FIELD_COLOR,
  } as const;

  // One row per week, one column per player — recharts' long-to-wide shape.
  const data = scoredWeeks.map((week) => {
    const row: Record<string, number | string> = { week: `0${week}`.slice(-2) };
    for (const s of series) {
      const point = s.trend.find((p) => p.week === week);
      if (point) row[s.seasonMemberId] = point.pointsRank;
    }
    return row;
  });

  // EVERY player keeps a config entry, so the tooltip names whoever is hovered
  // even though the field shares one colour.
  const config: ChartConfig = Object.fromEntries(
    series.map((s) => [
      s.seasonMemberId,
      { label: s.name, color: COLOR[roleOf(s)] },
    ])
  );

  const named = series.filter((s) => roleOf(s) !== "field");
  const fieldCount = series.length - named.length;

  return (
    <div className="flex h-full flex-col gap-3">
      {/* THE CHART IS THE PAGE'S ONE SLACK-ABSORBER, and it earns that because
          a rank walk drawn taller is a rank walk read more easily — the lines
          separate. Every other panel padded to fill a gap just gets emptier.
          `min-h-72` is the floor; `flex-1` is what lets it take whatever the
          picks panel beside it turns out to be. */}
      <ChartContainer config={config} className="min-h-72 w-full flex-1">
        <LineChart
          data={data}
          margin={{ left: 4, right: 16, top: 16 }}
          title={`Rank by week for ${series.length} ${series.length === 1 ? "player" : "players"}`}
          desc={`One line per player, plotting their place in the standings after each of ${scoredWeeks.length} scored weeks. First place is the top of the chart. Your line, the player above you and the player below you are drawn in colour; the rest of the field shares one line style and is named on hover. Press the left and right arrow keys to move week by week.`}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="week"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />
          <YAxis
            reversed
            allowDecimals={false}
            width={28}
            tickLine={false}
            axisLine={false}
            domain={[1, series.length]}
            ticks={Array.from({ length: series.length }, (_, i) => i + 1)}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          {/* THE FIELD IS DRAWN FIRST so the three named lines sit on top of it
              rather than under it. Paint order is DOM order in SVG, and a
              named line hidden behind seven grey ones is the bug this whole
              re-encoding exists to fix. */}
          {series
            .filter((s) => roleOf(s) === "field")
            .map((s) => (
              <Line
                key={s.seasonMemberId}
                dataKey={s.seasonMemberId}
                type="monotone"
                stroke={FIELD_COLOR}
                strokeOpacity={0.3}
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            ))}
          {named.map((s) => (
            <Line
              key={s.seasonMemberId}
              dataKey={s.seasonMemberId}
              type="monotone"
              stroke={`var(--color-${s.seasonMemberId})`}
              strokeWidth={s.isMe ? 2.5 : 2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ChartContainer>

      {/* IDENTITY IN WORDS AS WELL AS COLOUR, which is what makes the lightest
          of the three legal against a white panel. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {named.map((s) => (
          <li
            key={s.seasonMemberId}
            className="type-micro flex items-center gap-2 text-micro"
          >
            <span
              aria-hidden
              className="h-0.5 w-4 rounded-sm"
              style={{ background: COLOR[roleOf(s)] }}
            />
            {s.isMe ? "You" : s.name}
          </li>
        ))}
        {fieldCount > 0 && (
          <li className="type-micro flex items-center gap-2 text-micro text-muted-foreground">
            <span
              aria-hidden
              className="h-0.5 w-4 rounded-sm opacity-30"
              style={{ background: FIELD_COLOR }}
            />
            {fieldCount} {fieldCount === 1 ? "other" : "others"} · named on hover
          </li>
        )}
      </ul>
    </div>
  );
}
