import Link from "next/link";
import { ArrowRightIcon, PlusIcon } from "lucide-react";

import { BidCta } from "@/components/bid-cta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
 * ── THE OPEN-WEEK STATE IS NO LONGER DRAWN HERE ───────────────────────────
 * It moved to `components/bid-cta.tsx` on 2026-09-02, because Season Home draws
 * the same thing and used to draw it differently. What is left in this file is
 * the two states only League Home has: NO SEASON AT ALL, and a season with
 * nothing taking bids. Neither has an equivalent on Season Home — you cannot be
 * on a season page when there is no season.
 *
 * This component also stopped being a client component with that move: the
 * clock went with the call to action, and nothing left needs one.
 */
export function SeasonThread({
  leagueId,
  seasonId,
  seasonName,
  bidTarget,
  playerCount,
  isCommissioner,
  lastChampion,
  finishedSeasons,
}: {
  leagueId: string;
  seasonId: string | null;
  seasonName: string | null;
  /** The open week the call to action points at — the earliest the viewer has
   *  not bid in. See `pickBidTarget`. */
  bidTarget: { week: LeagueWeek; hasBid: boolean } | null;
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
  if (!bidTarget) {
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

  return (
    <BidCta
      weekNumber={bidTarget.week.number}
      subject={seasonName}
      aside={`${playerCount} player${playerCount === 1 ? "" : "s"}`}
      deadline={bidTarget.week.bidDeadline}
      href={`/seasons/${seasonId}/weeks/${bidTarget.week.id}/bid`}
      hasBid={bidTarget.hasBid}
    />
  );
}
