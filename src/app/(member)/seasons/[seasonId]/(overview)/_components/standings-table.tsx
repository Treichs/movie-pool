import Link from "next/link";

import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";

/**
 * STANDINGS — the league's table, lifted out of the retired Leaderboard tab
 * unchanged except for losing its own heading, which the bento cell now owns.
 *
 * ── A TIED PLACE IS NOT TWO FULL PRIZES ───────────────────────────────────
 * Dense ranking puts two level players in 1st, and printing the first-place
 * figure against both would promise the pot twice. How a shared place divides
 * is the rulebook's answer, not this table's, so it says the place is shared
 * and stops there.
 *
 * ── THE PRIZE COLUMN IS A PROJECTION ──────────────────────────────────────
 * Nothing is owed until the commissioner finalises the season. The column is
 * absent entirely for a practice league, which is playing for nothing, rather
 * than present and full of zeros.
 */
export function StandingsTable({
  data,
  ladder,
}: {
  data: LeaderboardData;
  ladder: PayoutLadder | null;
}) {
  // What each place is worth, keyed by place, so the table can mark the money
  // without recomputing the ladder per row.
  const prizeOf = new Map<number, number>();
  if (ladder) {
    if (ladder.first > 0) prizeOf.set(1, ladder.first);
    if (ladder.second > 0) prizeOf.set(2, ladder.second);
    if (ladder.third > 0) prizeOf.set(3, ladder.third);
  }
  const holdersOf = new Map<number, number>();
  for (const row of data.rows) {
    holdersOf.set(row.pointsRank, (holdersOf.get(row.pointsRank) ?? 0) + 1);
  }

  return (
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
  );
}
