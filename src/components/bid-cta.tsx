"use client";

import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useNow } from "@/hooks/use-now";
import { timeUntil } from "@/lib/format";

/**
 * THE OPEN WEEK'S CALL TO ACTION — the one control in this app with a clock on
 * it, and now the same object on League Home and on Season Home.
 *
 * ── IT WAS TWO DIFFERENT THINGS SAYING THE SAME THING ─────────────────────
 * League Home drew a bordered ticket inside `SeasonThread`; Season Home drew an
 * eyebrow, a countdown and a button in the fourth column of the hero's
 * register; and the desktop nav band added a third pointer, a `Bid` item that
 * appeared only while a week was open. Three surfaces, one deadline, and each
 * of them free to drift. Lifted here 2026-09-02 so there is one.
 *
 * ── IT NAMES THE WEEK *YOU* STILL OWE, NOT THE EARLIEST OPEN ONE ──────────
 * Two weeks can be open at once (`league.ts`, and the reason `getNavLeagues`
 * sorts). Every surface used to point at the earliest regardless of whether the
 * viewer had already settled it, so a player who had bid in week 3 and not in
 * week 4 was sent back to week 3. `pickBidTarget` in `lib/unbid-weeks.ts` holds
 * that rule; this component renders whichever week it hands back.
 *
 * `hasBid` therefore means "you have bid in EVERY open week" — it is only true
 * when the target fell back to the earliest open week for want of an unbid one.
 * It is the viewer's own answer about their own bids, so it leaks nothing:
 * sealed bidding hides AMOUNTS and hides them from OTHER players (ADR-022).
 *
 * ── THE COUNTDOWN IS THE BUTTON'S CONDITION, SO THEY ARE ONE CONTROL ──────
 * This much rope, then that button stops working. Drawn as one two-cell ticket
 * rather than a statistic parked beside an action.
 *
 * INSIDE THE LAST HOUR THE METER TAKES THE INK GROUND. A change of GROUND, not
 * of size: nothing reflows as the deadline closes in, and the accent moves to
 * `--nav-primary`, the only red legible on ink. `--primary` would be 3.80:1
 * there.
 *
 * NULL BEFORE MOUNT, per the rule the bid page's countdown records: a
 * time-dependent value has no correct server render, and producing one
 * guarantees both a wrong number and a hydration mismatch.
 */
function Gate({
  deadline,
  href,
  hasBid,
}: {
  deadline: string | null;
  href: string;
  hasBid: boolean;
}) {
  // HALF A MINUTE, not a second: this is a label in hours, and a per-second
  // clock on a league page is motion with no decision attached.
  const now = useNow(30_000);

  const ms = now && deadline ? Date.parse(deadline) - now.getTime() : null;
  const urgent = ms !== null && ms <= 3_600_000;
  // INSIDE THE HOUR, MINUTES. `timeUntil` rounds to whole hours, so 38 minutes
  // reads as "1 hour" — generous everywhere else and wrong in the one window
  // the escalation exists for. The shared helper keeps its coarseness for its
  // other callers; this branch does its own arithmetic.
  const left =
    ms === null || !deadline || !now
      ? null
      : urgent && ms > 0
        ? `${Math.max(1, Math.ceil(ms / 60_000))} min`
        : timeUntil(deadline, now);

  const label = hasBid ? "Review your bids" : "Place your bids";

  // NO DEADLINE, NO METER. A commissioner who has not set one gets the action
  // alone rather than a ticket counting to an invented moment.
  if (!deadline || !left) {
    return (
      <Link
        href={href}
        data-done={hasBid || undefined}
        className="type-ui flex items-center gap-2 rounded-4xl bg-primary px-5 py-2.5 text-ui whitespace-nowrap text-primary-foreground hover:bg-primary/85 data-done:border data-done:border-edge data-done:bg-card data-done:text-foreground data-done:hover:bg-muted"
      >
        {label}
        <ArrowRightIcon className="size-4" />
      </Link>
    );
  }

  return (
    <div
      data-urgent={urgent || undefined}
      data-done={hasBid || undefined}
      className="group/gate flex shrink-0 items-stretch overflow-hidden rounded-4xl border border-primary data-done:border-edge data-urgent:border-foreground"
    >
      <div className="flex flex-col justify-center gap-px bg-card px-4 py-2 group-data-urgent/gate:bg-nav">
        <span className="type-numeral text-h3 leading-none group-data-urgent/gate:text-nav-primary">
          {left.replace(/^in /, "")}
        </span>
        <span className="type-micro text-micro text-muted-foreground group-data-urgent/gate:text-nav-muted-foreground">
          {urgent ? "left to bid" : "until bids close"}
        </span>
      </div>
      <Link
        href={href}
        className="type-ui flex items-center gap-2 bg-primary px-5 text-ui whitespace-nowrap text-primary-foreground hover:bg-primary/85 group-data-done/gate:bg-card group-data-done/gate:text-foreground group-data-done/gate:shadow-[inset_1px_0_0_var(--edge)] group-data-done/gate:hover:bg-muted"
      >
        {label}
        <ArrowRightIcon className="size-4" />
      </Link>
    </div>
  );
}

export function BidCta({
  weekNumber,
  subject,
  aside,
  deadline,
  href,
  hasBid,
}: {
  weekNumber: number;
  /** What the week belongs to. League Home names the season, because the page
   *  is about the league and the season is the thing that has weeks. Season
   *  Home passes null: its own H1 already names it, and repeating it three
   *  inches down is the duplication this component was extracted to remove. */
  subject: string | null;
  /** One page-specific fact to sit before the bid status — League Home's player
   *  count. The bid status itself is not optional and is written here. */
  aside?: string;
  deadline: string | null;
  href: string;
  hasBid: boolean;
}) {
  const week = String(weekNumber).padStart(2, "0");
  // THE SAME TWO PHRASES THE LEAGUE ROWS AND THE BELL USE. A player who reads
  // "you have not bid" on /leagues must not read anything else here, and one
  // wording across three surfaces is cheaper than a rule saying so.
  const status = hasBid ? "Your bids are in" : "You have not bid yet";

  return (
    <Card
      variant="flat"
      role="region"
      aria-label="This week"
      className={`flex-row flex-wrap items-center justify-between gap-6 ${
        hasBid ? "" : "border-primary"
      }`}
    >
      <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge variant={hasBid ? "outline" : "default"}>Week {week} open</Badge>
          {subject && <span className="type-h3 text-h3">{subject}</span>}
        </div>
        <span className="type-body text-ui text-muted-foreground">
          {aside ? `${aside} · ` : ""}
          {status}
        </span>
      </div>
      <Gate deadline={deadline} href={href} hasBid={hasBid} />
    </Card>
  );
}
