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

import { BumpChart } from "./bump-chart";

/**
 * LEADERBOARD — the standings, the two provisional awards, and the rank walk.
 *
 * ── `hasScores` GATES THE WHOLE TAB ───────────────────────────────────────
 * Before anything is captured every player has zero points, and dense ranking
 * would put the entire league in 1st. `getLeaderboard` returns the flag for
 * exactly this, and an honest empty state is better than a table of ties.
 *
 * ── THE TWO AWARDS ARE ABOUT ONE FILM, NOT ONE PLAYER ─────────────────────
 * `leaderboard.ts` carries the warning in its own types: a row's `efficiency`
 * is a PLAYER's season points ÷ dollars, while `bestEfficiency` is the best
 * single PICK of the season. A player can lead the ranking and not hold the
 * pick, so the two are labelled apart rather than sat side by side.
 */
export function LeaderboardTab({ data }: { data: LeaderboardData }) {
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

  return (
    <div className="flex flex-col gap-6">
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((row) => (
              <TableRow key={row.seasonMemberId} className={row.isMe ? "bg-muted" : ""}>
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {(awards.bestEfficiency || awards.dessert) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {awards.bestEfficiency && (
            <Card variant="flat" size="sm" className="gap-1.5">
              <span className="type-eyebrow text-eyebrow text-muted-foreground">
                Best pick so far
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
                Dessert so far
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
