import type { WeekBidBoard } from "@/lib/week-bid";

import { DeadlineCountdown } from "@/components/deadline-countdown";
import { Card } from "@/components/ui/card";

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
    <Card variant="flat" className="flex-row flex-wrap items-center justify-between gap-6">
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
        {/* NAMED, because the sticky summary below carries a second "$X of $Y"
            about THIS WEEK'S BASKET. Two unlabelled pairs of the same shape,
            counting opposite things, were being read against each other. */}
        <span className="type-eyebrow text-eyebrow text-muted-foreground">Bankroll left</span>
        <span className="type-numeral text-numeral">${remaining}</span>
        <span className="type-eyebrow text-eyebrow text-muted-foreground">
          {bankroll === null ? "Still free" : `of $${bankroll} for the season`}
        </span>
      </div>
    </Card>
  );
}

/** THE TIMEZONE IS NAMED, and midnight is never written as 12:00 AM.
 *
 *  GOV.UK's style guide is explicit about both: "midnight is the first minute
 *  of the day, not the last", so a deadline written `Monday, Aug 31, 12:49 AM`
 *  is read as the end of Monday about as often as the start of it. Spelling the
 *  zone out removes the second ambiguity — a blind bid closes at one instant
 *  for everyone, and a player in another zone has no way to infer whose clock
 *  this is. */
function formatDeadline(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
