import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ordinal } from "@/lib/format";
import type { LeaderboardData } from "@/lib/leaderboard";
import type { PayoutLadder } from "@/lib/payout";
import type { SeasonStory } from "@/lib/season-story";
import { cn } from "@/lib/utils";

import { BumpChart } from "./bump-chart";
import { HeadToHead } from "./head-to-head";
import { PositionBlock } from "./position-block";
import { TopFilms } from "./top-films";
import { WeekStory } from "./week-story";

/**
 * LEADERBOARD — the season's payoff surface.
 *
 * ── THREE REGISTERS, TOP TO BOTTOM ────────────────────────────────────────
 * Where am I, what just happened, and prove it. Until 2026-08-31 this tab was
 * the third register alone: an accurate six-column table, two season awards
 * and a rank chart, opening on the proof of a question it never asked. The
 * position block and the week's briefs are the first two, and they are the
 * reason the screen leads with a person rather than with a column heading.
 *
 * ── `hasScores` STILL GATES THE WHOLE TAB ─────────────────────────────────
 * Before anything is captured every player has zero points and dense ranking
 * would put the entire league in 1st. `getLeaderboard` returns the flag for
 * exactly this, and an honest empty state is better than a table of ties — or
 * than a hero position nobody holds.
 *
 * ── THE TWO SEASON AWARDS ARE ABOUT ONE FILM, NOT ONE PLAYER ──────────────
 * `leaderboard.ts` carries the warning in its own types: a row's `efficiency`
 * is a PLAYER's season points ÷ dollars, while `bestEfficiency` is the best
 * single PICK of the season. A player can lead the ranking and not hold the
 * pick, so the two are labelled apart rather than sat side by side. They sit
 * below the standings now because the week's own briefs answer the fresher
 * question and these barely move after a few weeks.
 */
export function LeaderboardTab({
  data,
  story,
  ladder,
}: {
  data: LeaderboardData;
  story: SeasonStory;
  ladder: PayoutLadder | null;
}) {
  if (!data.hasScores) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Nothing scored yet</EmptyTitle>
          <EmptyDescription>
            Standings appear the first Monday a week is captured. Until then
            everybody is level, and a table would only say so eleven times.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const { awards } = data;
  // What each place is worth, keyed by place, so the standings table can mark
  // the money without recomputing the ladder per row.
  const prizeOf = new Map<number, number>();
  if (ladder) {
    if (ladder.first > 0) prizeOf.set(1, ladder.first);
    if (ladder.second > 0) prizeOf.set(2, ladder.second);
    if (ladder.third > 0) prizeOf.set(3, ladder.third);
  }
  // A TIED PLACE IS NOT TWO FULL PRIZES. Dense ranking puts two level players
  // in 1st, and printing the first-place figure against both would promise the
  // pot twice. How a shared place divides is the rulebook's answer, not this
  // table's, so it says the place is shared and stops there.
  const holdersOf = new Map<number, number>();
  for (const row of data.rows) {
    holdersOf.set(row.pointsRank, (holdersOf.get(row.pointsRank) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-8">
      {story.position && <PositionBlock position={story.position} />}

      {story.lastScoredWeek !== null && (
        <WeekStory headlines={story.headlines} week={story.lastScoredWeek} />
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2>Standings</h2>
          {prizeOf.size > 0 && (
            <span className="type-micro text-micro text-muted-foreground">
              Prize is a projection until the season is finalised
            </span>
          )}
        </div>
        <div className="overflow-x-auto rounded border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">#</TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="w-24 text-right">Points</TableHead>
                <TableHead className="w-20 text-right">Spent</TableHead>
                <TableHead className="w-16 text-right">Films</TableHead>
                <TableHead className="w-20 text-right">Pts / $</TableHead>
                {prizeOf.size > 0 && (
                  <TableHead className="w-24 text-right">Pays</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => {
                const prize = prizeOf.get(row.pointsRank);
                return (
                  <TableRow
                    key={row.seasonMemberId}
                    className={row.isMe ? "bg-muted" : ""}
                  >
                    <TableCell className="type-numeral text-ui">
                      {ordinal(row.pointsRank)}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/players/${row.profileId}`}
                        className={`text-ui hover:underline ${row.isMe ? "type-h3" : "type-ui"}`}
                      >
                        {row.name}
                      </Link>
                      {row.isMe && (
                        <Badge variant="secondary" className="ml-2">
                          You
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="type-numeral text-right text-ui">
                      {row.points.toFixed(2)}
                    </TableCell>
                    <TableCell className="type-numeral text-right text-ui text-muted-foreground">
                      ${row.spent}
                    </TableCell>
                    <TableCell className="type-numeral text-right text-ui text-muted-foreground">
                      {row.filmsOwned}
                    </TableCell>
                    <TableCell className="type-numeral text-right text-ui">
                      {row.efficiency === null ? "—" : row.efficiency.toFixed(2)}
                    </TableCell>
                    {prizeOf.size > 0 && (
                      <TableCell
                        className={cn(
                          "type-numeral text-right text-ui",
                          prize === undefined && "text-muted-foreground",
                        )}
                      >
                        {prize === undefined ? (
                          "—"
                        ) : (
                          <>
                            ${prize}
                            {(holdersOf.get(row.pointsRank) ?? 1) > 1 && (
                              <span className="type-micro ml-1.5 text-micro text-muted-foreground">
                                Shared
                              </span>
                            )}
                          </>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <HeadToHead rivals={story.rivals} nearest={story.nearest} />

      <TopFilms films={data.rail} />

      {(awards.bestEfficiency || awards.dessert) && (
        <section className="flex flex-col gap-3">
          <h2>Season awards so far</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {awards.bestEfficiency && (
              <Card variant="flat" size="sm" className="gap-1.5">
                <span className="type-eyebrow text-eyebrow text-muted-foreground">
                  Best pick of the season
                </span>
                <span className="type-h3 text-h3">
                  {awards.bestEfficiency.winners.map((w) => w.name).join(", ")}
                </span>
                <span className="type-body text-ui text-muted-foreground">
                  {awards.bestEfficiency.films.join(", ")} ·{" "}
                  <span className="type-numeral">
                    {awards.bestEfficiency.ratio.toFixed(2)}
                  </span>{" "}
                  points per dollar
                </span>
              </Card>
            )}
            {awards.dessert && (
              <Card variant="flat" size="sm" className="gap-1.5">
                <span className="type-eyebrow text-eyebrow text-muted-foreground">
                  Dessert of the season
                </span>
                <span className="type-h3 text-h3">
                  {awards.dessert.winners.map((w) => w.name).join(", ")}
                </span>
                <span className="type-body text-ui text-muted-foreground">
                  {awards.dessert.films.join(", ")} ·{" "}
                  <span className="type-numeral">
                    {awards.dessert.ratio.toFixed(2)}
                  </span>{" "}
                  points per dollar
                </span>
              </Card>
            )}
          </div>
        </section>
      )}

      <Card variant="flat" size="sm" className="gap-3">
        <h3 className="type-eyebrow text-eyebrow text-muted-foreground">
          How the season has moved
        </h3>
        <BumpChart series={data.allTrends} scoredWeeks={data.scoredWeeks} />
      </Card>
    </div>
  );
}
