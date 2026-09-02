"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { WeekLedgerRow } from "@/lib/season-ledger";

/**
 * THE BANKROLL BURNDOWN — what is left, and how fast it went.
 *
 * ── IT ANSWERS A QUESTION THE GAME CREATES AND NO SCREEN ANSWERED ─────────
 * A bankroll is fixed for the season and never replenished, so the only real
 * strategic question a player has is one of pace: am I spending faster than the
 * season is running out? "Bankroll left $10" says where you are. It cannot say
 * whether $10 at week 10 of 10 is comfortable or ruinous, and those are
 * opposite situations.
 *
 * ── IT QUERIES NOTHING ────────────────────────────────────────────────────
 * Built entirely from the week ledger the page already holds: `paid` is the
 * dollars committed to films won in that week, and running it backwards from
 * the season bankroll gives the line. No composer, no round trip.
 *
 * ── AN AREA, NOT A LINE, AND IN INK RATHER THAN THE ACCENT ────────────────
 * The shape being read is the remaining quantity, and a filled area states a
 * quantity where a bare line states a trajectory. It is drawn in ink with a
 * wash fill rather than in vermilion: the accent means *live and yours* and is
 * already spent on the open week's call to action and on the viewer's own line
 * in the rank walk beside this. A third claim on it would break the rationing
 * that makes it work.
 *
 * ── SMOOTH, AND `monotone` FOR THE SAME REASON AS THE RANK WALK ───────────
 * Smooth curves are the developer's call and this chart follows the rank walk
 * beside it — two line charts in one row drawn with different interpolation
 * would read as two different kinds of claim.
 *
 * `monotone` matters more here than it looks: it cannot overshoot, so a
 * bankroll that fell from $50 to $25 never dips below $25 on the way. A
 * `natural` spline would, and a chart showing a player briefly holding less
 * money than they ever held is a chart stating something false about money.
 *
 * ── A PENDING WEEK IS NOT A FLAT LINE ─────────────────────────────────────
 * Weeks that have not opened have no spend and would draw a long horizontal
 * tail to the right, which reads as "you stopped spending" rather than "the
 * season has not got there yet". The series stops at the last week that has
 * actually resolved, and the caption says how many are left.
 */
const config = {
  remaining: { label: "Bankroll left", color: "var(--color-foreground)" },
} satisfies ChartConfig;

export function BankrollBurndown({
  bankroll,
  rows,
}: {
  /** The season's starting bankroll. Null if the league never set one. */
  bankroll: number | null;
  /** The week ledger, in week order. */
  rows: WeekLedgerRow[];
}) {
  // A season with no bankroll is playing without a budget, and a burndown of an
  // unbounded quantity is a line with no meaning. The figures beside this still
  // stand on their own.
  if (bankroll === null) return null;

  // Ledger order is not guaranteed to be ascending — the table sorts — so this
  // sorts its own copy rather than trusting the caller's.
  const byWeek = [...rows].sort((a, b) => a.number - b.number);
  const resolved = byWeek.filter((r) => !r.isUpcoming);

  if (resolved.length === 0) return null;

  // A RUNNING TOTAL WITHOUT A RUNNING VARIABLE. The obvious `let left` decremented
  // inside a `.map` is a reassignment after render completes, which the React
  // Compiler rejects outright — and rightly, since the same array would produce
  // different numbers if it were ever re-walked. `reduce` carries the total in
  // the accumulator instead, so the scan is pure.
  const data = resolved.reduce<{ week: string; remaining: number }[]>(
    (acc, r) => [
      ...acc,
      {
        week: `0${r.number}`.slice(-2),
        remaining: acc[acc.length - 1].remaining - (r.paid ?? 0),
      },
    ],
    [{ week: "Start", remaining: bankroll }]
  );

  const left = data[data.length - 1].remaining;
  const pending = byWeek.length - resolved.length;

  return (
    <div className="flex flex-col gap-2">
      <ChartContainer config={config} className="h-40 w-full">
        <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="week"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval="preserveStartEnd"
          />
          <YAxis
            width={36}
            tickLine={false}
            axisLine={false}
            domain={[0, bankroll]}
            tickFormatter={(v: number) => `$${v}`}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Area
            dataKey="remaining"
            type="monotone"
            stroke="var(--color-remaining)"
            strokeWidth={2}
            fill="var(--color-muted)"
            fillOpacity={1}
            dot={false}
          />
        </AreaChart>
      </ChartContainer>
      <p className="type-micro text-micro text-muted-foreground">
        ${bankroll} at the start · ${Math.max(0, left)} after{" "}
        {resolved.length} {resolved.length === 1 ? "week" : "weeks"}
        {pending > 0 && ` · ${pending} still to come`}
      </p>
    </div>
  );
}
