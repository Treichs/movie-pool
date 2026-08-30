"use client";

import Link from "next/link";
import { ArrowRightIcon, PlusIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useNow } from "@/hooks/use-now";
import { timeUntil } from "@/lib/format";
import type { LeagueWeek } from "@/lib/league";

/**
 * THE LIVE THREAD — the one band on this page that changes with the league's
 * state, and the reason the archive below it can hold still.
 *
 * Board 4.2 puts the running season in the first row of the seasons table, as a
 * chip. That buries the only thing that moves three inches from three rows that
 * look identical, and it makes the table's first row behave unlike every other
 * row. Settled with the developer on 2026-08-29 from the League Home prototype:
 * the live season leads, the table becomes the archive.
 *
 * ── THE GATE: ONE CONTROL, NOT A CLOCK BESIDE A BUTTON ────────────────────
 * The countdown is the button's own condition — this much rope, then that
 * button stops working — so they are drawn as one two-cell ticket rather than
 * as a statistic parked next to an action.
 *
 * INSIDE THE LAST HOUR THE METER TAKES THE INK GROUND. That is a change of
 * GROUND, not of size: nothing on the page reflows as the deadline closes in,
 * and the accent moves to `--nav-primary`, the only value legal on ink.
 * `--primary` would be 3.80:1 there.
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
      <Button
        render={<Link href={href} />}
        nativeButton={false}
        variant={hasBid ? "outline" : "default"}
      >
        {label}
        <ArrowRightIcon />
      </Button>
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

export function SeasonThread({
  leagueId,
  seasonId,
  seasonName,
  openWeek,
  playerCount,
  isCommissioner,
  lastChampion,
  finishedSeasons,
}: {
  leagueId: string;
  seasonId: string | null;
  seasonName: string | null;
  openWeek: LeagueWeek | null;
  playerCount: number;
  isCommissioner: boolean;
  /** Only ever set when ONE member holds the most titles. A tie names nobody. */
  lastChampion: string | null;
  /** How many seasons have actually ended. Distinct from having a champion to
   *  name: a league can finish a season and still have no single titleholder. */
  finishedSeasons: number;
}) {
  const shell = "flex-row flex-wrap items-center justify-between gap-6";

  // NO SEASON AT ALL. The commissioner is offered the next one; everyone else
  // is told plainly that there is nothing to play and who to expect it from,
  // which beats an empty page that looks broken.
  if (!seasonId) {
    return (
      <Card variant="flat" role="region" aria-label="This season" className={shell}>
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge variant="secondary">No season running</Badge>
            <span className="type-h3 text-h3">
              {/* THREE DIFFERENT TRUE THINGS, and the first draft collapsed two
                  of them. A league with no champion to name is not the same as
                  a league that has never played: Dev Closing Credits has a
                  finished season whose title is shared, and it was being told
                  it had never played one. */}
              {lastChampion
                ? `${lastChampion} won the last one`
                : finishedSeasons > 0
                  ? `${finishedSeasons} season${finishedSeasons === 1 ? "" : "s"} played, and the next one is not started`
                  : "This league has not played a season yet"}
            </span>
          </div>
          <span className="type-body text-ui text-muted-foreground">
            {isCommissioner
              ? "A season needs a first Friday and a bankroll — about a minute."
              : "Nothing to play until your commissioner starts one."}
          </span>
        </div>
        {isCommissioner && (
          <Button
            render={<Link href={`/leagues/${leagueId}/seasons/new`} />}
            nativeButton={false}
          >
            <PlusIcon />
            Start a season
          </Button>
        )}
      </Card>
    );
  }

  // A SEASON WITH NO OPEN WEEK — between weeks, or not yet begun. The season is
  // still the destination; there is simply no clock on it.
  if (!openWeek) {
    return (
      <Card variant="flat" role="region" aria-label="This season" className={shell}>
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge variant="secondary">Between weeks</Badge>
            <span className="type-h3 text-h3">{seasonName}</span>
          </div>
          <span className="type-body text-ui text-muted-foreground">
            {playerCount} player{playerCount === 1 ? "" : "s"} · nothing taking
            bids right now
          </span>
        </div>
        <Button
          render={<Link href={`/seasons/${seasonId}`} />}
          nativeButton={false}
          variant="ink"
        >
          Open the season
          <ArrowRightIcon />
        </Button>
      </Card>
    );
  }

  const week = String(openWeek.number).padStart(2, "0");
  return (
    <Card
      variant="flat"
      role="region"
      aria-label="This week"
      className={`${shell} border-primary`}
    >
      <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge>Week {week} open</Badge>
          <span className="type-h3 text-h3">{seasonName}</span>
        </div>
        <span className="type-body text-ui text-muted-foreground">
          {playerCount} player{playerCount === 1 ? "" : "s"} · bidding is open
        </span>
      </div>
      <Gate
        deadline={openWeek.bidDeadline}
        href={`/seasons/${seasonId}/weeks/${openWeek.id}/bid`}
        hasBid={false}
      />
    </Card>
  );
}
