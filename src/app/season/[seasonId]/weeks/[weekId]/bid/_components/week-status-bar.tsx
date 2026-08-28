import type { WeekBidBoard } from "@/lib/week-bid";

import { DeadlineCountdown } from "./deadline-countdown";

/**
 * THE CLOCK AND THE MONEY, and nothing else.
 *
 * This started as four tiles; on a 390px phone they stacked into a 200px block
 * and pushed the first poster — never mind the first input — off the screen.
 * The minimum-bid tile went first: every empty field already reads "$0 / $1+",
 * which is the same fact at the moment it is needed rather than 500px above it.
 */
export function WeekStatusBar({ board }: { board: WeekBidBoard }) {
  const { week, remaining, bankroll } = board;

  return (
    <div className="flex flex-wrap items-center justify-between gap-6 rounded-lg border bg-card p-5">
      {week.bidDeadline && (
        <div className="flex flex-col gap-1">
          <span className="type-eyebrow text-eyebrow text-muted-foreground">Bids due</span>
          <span className="text-sm font-semibold">{formatDeadline(week.bidDeadline)}</span>
        </div>
      )}
      {week.bidDeadline && (
        <div className="flex flex-col items-center gap-1">
          <span className="type-eyebrow text-eyebrow text-muted-foreground">Closes in</span>
          <DeadlineCountdown target={week.bidDeadline} />
        </div>
      )}
      <div className="flex flex-col items-end gap-1">
        {/* NOT the XL numeral. That is 72px and the system reserves it for the
            hero figure on a surface — here that is the COUNTDOWN, not the
            bankroll. Applied to this tile it made the money shout louder than
            the clock it sits beside. */}
        <span className="type-numeral text-numeral">${remaining}</span>
        <span className="type-eyebrow text-eyebrow text-muted-foreground">
          {bankroll === null ? "Still free" : `Of $${bankroll}`}
        </span>
      </div>
    </div>
  );
}

function formatDeadline(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
