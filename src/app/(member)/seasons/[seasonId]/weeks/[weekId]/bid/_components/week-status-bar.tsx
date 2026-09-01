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
    // TWO ROWS ON A PHONE, not three. Stacked, the groups kept the alignments
    // they had in the desktop row — left, centre, right — and read as three
    // separate panels 265px tall, which pushed the slate off the screen.
    //
    // The countdown spans the card because it is the one figure this screen is
    // about, and at 72px it cannot share a 285px row with anything; the date
    // and the bankroll take the row beneath it. DOM order is render order at
    // every width, so nothing is placed out of sequence to get this layout.
    <Card
      variant="flat"
      className="grid grid-cols-2 items-center gap-x-6 gap-y-4 md:flex md:flex-row md:flex-wrap md:shrink-0 md:justify-between md:gap-6"
    >
      {week.bidDeadline && (
        <div className="col-span-2 flex flex-col items-center gap-1 md:col-auto">
          <span className="type-eyebrow text-eyebrow text-muted-foreground">Closes in</span>
          <DeadlineCountdown target={week.bidDeadline} />
        </div>
      )}
      {week.bidDeadline && (
        <div className="flex flex-col gap-1">
          <span className="type-eyebrow text-eyebrow text-muted-foreground">Bids due</span>
          <span className="text-sm font-semibold">{formatDeadline(week.bidDeadline)}</span>
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
