import Link from "next/link";

import { Badge } from "@/components/ui/badge";
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
import { formatMonthYear } from "@/lib/format";
import type { LeagueSeason } from "@/lib/league";

/**
 * THE ARCHIVE — finished seasons only.
 *
 * Board 4.2 puts the live season in row one and highlights it. That makes the
 * table's first row behave unlike every other row, which is a table teaching
 * you not to trust its shape; the live season leads the page instead.
 *
 * ── NO CHAMPION COLUMN, THOUGH THE BOARD DRAWS ONE ────────────────────────
 * Not an omission — a recorded decision. `league-records.ts` carries the note:
 * a `championsRoll` existed for one review cycle and was "removed on the
 * developer's review — the champions already read off the career table". So a
 * per-season winner is not derivable from anything this page reads, and the
 * titles live where that decision put them: the **Titles** column on the
 * members list below. Inventing the column back would need a per-season
 * standings read the record book deliberately does not expose.
 */
export function SeasonsTable({
  seasons,
  liveSeasonId,
}: {
  seasons: LeagueSeason[];
  liveSeasonId: string | null;
}) {
  const finished = seasons.filter(
    (s) => s.status === "completed" || s.status === "archived"
  );

  if (finished.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No finished seasons yet</EmptyTitle>
          <EmptyDescription>
            {liveSeasonId
              ? "The one running now appears here the day it ends."
              : "The first one appears here the day it ends."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="overflow-x-auto rounded border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Season</TableHead>
            <TableHead className="w-32">Ended</TableHead>
            <TableHead className="w-28">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {finished.map((season) => (
            <TableRow key={season.id}>
              <TableCell>
                <Link
                  href={`/seasons/${season.id}`}
                  className="type-h3 text-h3 hover:underline"
                >
                  {season.name}
                </Link>
              </TableCell>
              <TableCell className="type-numeral text-ui text-muted-foreground">
                {formatMonthYear(season.created_at.slice(0, 10))}
              </TableCell>
              <TableCell>
                <Badge variant="secondary">
                  {season.status === "archived" ? "Archived" : "Complete"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
