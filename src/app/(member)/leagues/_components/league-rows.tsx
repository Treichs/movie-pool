"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";

import { timeUntil } from "@/lib/format";
import type { HomeLeague } from "@/lib/home";

/** The mark a league carries, matching the switcher's: its chosen glyph, or its
 *  first letter. One shape, two places, and they must not diverge. */
function LeagueMark({ league }: { league: HomeLeague }) {
  return (
    <span
      aria-hidden
      className="type-h3 flex size-11 shrink-0 items-center justify-center rounded-lg bg-foreground text-h3 text-background"
    >
      {league.avatarGlyph ?? league.name.charAt(0).toUpperCase()}
    </span>
  );
}

/** What the league is doing, in the fewest words that are still true. */
function state(league: HomeLeague): string {
  if (!league.currentSeason) return "No season started yet";
  const season = league.currentSeason.name;
  const players = `${league.memberCount} player${league.memberCount === 1 ? "" : "s"}`;
  return `${season} · ${players}`;
}

/**
 * THE DEADLINE, AS TIME REMAINING RATHER THAN A WALL CLOCK.
 *
 * Board 4.1 draws "Bids due 8pm". Eight o'clock where? The deadline is one
 * instant and every player reads it from a different timezone, so a wall clock
 * is either wrong or needs the viewer's zone — which the server does not have.
 * "In 3 hours" is the same fact, is timezone-free, and is the thing the row is
 * actually for: how much rope is left.
 *
 * Null before mount, for the reason the bid page's countdown records: a
 * time-dependent value has no correct server render.
 */
function Closing({ at }: { at: string }) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setLabel(timeUntil(at, new Date()));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [at]);

  if (!label) return null;
  return (
    <span className="type-micro text-micro text-muted-foreground">
      Bids close {label}
    </span>
  );
}

/**
 * THE LEAGUE LIST — one row per league, ordered by urgency (see `byUrgency` in
 * `src/lib/home.ts`), each row a door with its state written on it.
 *
 * ── NO RANK, THOUGH THE BOARD DRAWS ONE ───────────────────────────────────
 * Board 4.1's rows read "Season 34 · nine players · you are 2nd". The rank is
 * left out, and the reason is written at the top of `src/lib/home.ts`: this
 * module replaced a Dashboard whose job was to aggregate, and "if a statistic
 * ever appears in this file, that is the regression". A per-league rank is
 * still a standing, it costs a leaderboard query per league on the one page
 * built to be thin, and it already has a home — League Home, scoped to a
 * season. Raised with the developer on 2026-08-29 rather than quietly dropped.
 *
 * WHAT SURVIVES IS STATE THAT EXPIRES: which season, how many players, whether
 * bidding is open and how long is left. That is what helps you choose which
 * door to open, which is this page's whole job.
 */
export function LeagueRows({ leagues }: { leagues: HomeLeague[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {leagues.map((league) => (
        <li key={league.id}>
          {/* THE WHOLE ROW IS THE LINK, so the target is the row rather than a
              chevron nobody can hit. One link per row also means one tab stop,
              which is what makes a list of leagues keyboard-navigable. */}
          <Link
            href={`/leagues/${league.id}`}
            className="flex items-center gap-4 rounded border bg-card p-3.5 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
          >
            <LeagueMark league={league} />
            <span className="flex min-w-0 grow flex-col gap-0.5">
              <span className="type-h3 truncate text-h3">{league.name}</span>
              <span className="type-micro text-micro text-muted-foreground">
                {state(league)}
              </span>
            </span>

            <span className="flex shrink-0 items-center gap-3.5">
              {league.openWeekNumber !== null && (
                <span className="type-micro rounded-xs bg-primary px-2 py-1 text-micro text-primary-foreground">
                  Week {String(league.openWeekNumber).padStart(2, "0")} open
                </span>
              )}
              {league.isCommissioner && league.openWeekNumber === null && (
                <span className="type-micro text-micro text-muted-foreground">
                  You commission
                </span>
              )}
              {league.closesAt && <Closing at={league.closesAt} />}
              <ChevronRightIcon aria-hidden className="size-4" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
