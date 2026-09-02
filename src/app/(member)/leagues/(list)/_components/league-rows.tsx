"use client";

import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";

import { LeagueMark } from "@/components/league-mark";
import { Badge } from "@/components/ui/badge";
import { useNow } from "@/hooks/use-now";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { ordinal, timeUntil } from "@/lib/format";
import type { HomeLeague } from "@/lib/home";

/** What the league is doing and where you stand in it, in the fewest words that
 *  are still true. The placing is only ever this league's live season — see the
 *  header of `src/lib/home.ts` for why one statistic is allowed here and an
 *  aggregate never will be. */
function State({ league }: { league: HomeLeague }) {
  if (!league.currentSeason) return "No season started yet";
  const players = `${league.memberCount} player${league.memberCount === 1 ? "" : "s"}`;
  return (
    <>
      {league.currentSeason.name} · {players}
      {league.standing && (
        // ONE PHRASE, ONE LINE. Joined into the sentence it broke as "you are
        // 4th / of 5" the moment a row carried a badge and a countdown beside
        // it, which is every row that matters. `whitespace-nowrap` keeps the
        // placing whole and lets the break fall before it.
        //
        // "You are 2nd" rather than "2nd": the row is about a league, and
        // without the pronoun the ordinal reads as the league's own rank.
        <>
          {" · "}
          <span className="whitespace-nowrap">
            you are {ordinal(league.standing.rank)} of {league.standing.players}
          </span>
        </>
      )}
    </>
  );
}

/**
 * THE DEADLINE, AS TIME REMAINING RATHER THAN A WALL CLOCK.
 *
 * Board 4.1 draws "Bids due 8pm". Eight o'clock where? The deadline is one
 * instant and every player reads it from a different timezone, so a wall clock
 * is either wrong or needs the viewer's zone — which the server does not have.
 *
 * NOT `DeadlineCountdown`, deliberately, and this is the one place the two
 * differ on purpose: that component ticks every second and takes the accent
 * inside three hours, which is right on a bid slate and wrong on a list of
 * leagues, where a per-second clock on every row is motion with no decision
 * attached. This reads in hours and re-reads once a minute.
 */
function Closing({ at }: { at: string }) {
  const now = useNow(60_000);
  if (!now) return null;
  return (
    <span className="type-micro text-micro text-muted-foreground">
      Bids close {timeUntil(at, now)}
    </span>
  );
}

/**
 * THE LEAGUE LIST — one row per league, ordered by urgency (see `byUrgency` in
 * `src/lib/home.ts`), each row a door with its state written on it.
 *
 * ── ROWS ARE `ui/item` ────────────────────────────────────────────────────
 * Rebuilt on the vendored primitive on 2026-08-29. The first version was a
 * hand-rolled flex row that re-derived what `Item` already does — media,
 * title, description, trailing actions, and the description-aware alignment
 * that keeps a 44px mark from centring against two lines of text.
 *
 * ── THE RANK IS BACK, AND THE BOARD ALWAYS HAD IT ─────────────────────────
 * Board 4.1's rows read "Season 34 · nine players · you are 2nd". That last
 * clause was dropped because Home replaced a Dashboard and "if a statistic ever
 * appears in this file, that is the regression". ADR-443 made this the page
 * everyone lands on, and ADR-075 — which wrote that rule — had already said the
 * door was open: "if cross-league aggregation ever returns it is a fresh
 * decision". The decision was taken on 2026-09-02 and the board's own line is
 * restored. It is per league, per LIVE season, and nothing is summed.
 */
export function LeagueRows({ leagues }: { leagues: HomeLeague[] }) {
  return (
    <ItemGroup className="gap-2.5">
      {leagues.map((league) => (
        <Item
          key={league.id}
          variant="outline"
          // THE ROW GOES WHERE THE WORK IS. When this league is waiting on your
          // bid, the door is the bid form; otherwise it is the league's FRONT
          // DOOR — its live season, or the league itself when nothing is
          // running (ADR-443, `leagueFrontDoor`). The badge and the "you have
          // not bid" line beside it say which, so the destination is never a
          // surprise.
          //
          // Not a second link inside the row: `Item` already renders as one,
          // and an <a> inside an <a> is invalid HTML that fails hydration.
          render={
            <Link href={league.awaitingYourBid && league.bidHref ? league.bidHref : league.frontDoor} />
          }
          className="hover:bg-muted"
        >
          <ItemMedia>
            <LeagueMark id={league.id} name={league.name} className="size-11" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="type-h3 text-h3">{league.name}</ItemTitle>
            <ItemDescription>
              <State league={league} />
            </ItemDescription>
          </ItemContent>
          <ItemActions className="gap-3.5">
            {/* RED ONLY WHEN IT IS ASKING FOR SOMETHING. `badge.tsx` spends the
                accent on "the one thing asking to be acted on"; a week you have
                already bid in is not asking, so it goes quiet and keeps the
                clock beside it from reading as a debt. */}
            {league.openWeekNumber !== null && (
              <Badge variant={league.awaitingYourBid ? "default" : "outline"}>
                Week {String(league.openWeekNumber).padStart(2, "0")} open
              </Badge>
            )}
            {league.openWeekNumber !== null && (
              <span className="type-micro text-micro text-muted-foreground">
                {league.awaitingYourBid ? "You have not bid" : "Your bids are in"}
              </span>
            )}
            {league.isCommissioner && league.openWeekNumber === null && (
              <span className="type-micro text-micro text-muted-foreground">
                You commission
              </span>
            )}
            {league.closesAt && <Closing at={league.closesAt} />}
            <ChevronRightIcon aria-hidden className="size-4" />
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}
