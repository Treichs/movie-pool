"use client";

import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
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
/** Six rows a page — the same page size the season's week ledger uses, so the
 *  two archives on the two pages cost the same height. A league runs seasons
 *  for years: at ten this table was already the tallest thing on the page and
 *  at thirty-three it would set the height of the whole grid on its own. Paged,
 *  it is a fixed ~330px whatever the league's history turns out to be. */
const PAGE_SIZE = 6;

export function SeasonsTable({
  seasons,
  liveSeasonId,
}: {
  seasons: LeagueSeason[];
  liveSeasonId: string | null;
}) {
  const [page, setPage] = useState(0);
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

  const pageCount = Math.ceil(finished.length / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const shown = finished.slice(start, start + PAGE_SIZE);

  return (
    <div className="flex flex-col">
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
          {shown.map((season) => (
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
    {pageCount > 1 && (
      <div className="flex items-center justify-between gap-4 border-t px-1 pt-2.5">
        <span className="type-micro text-micro text-muted-foreground">
          {start + 1}&ndash;{Math.min(start + PAGE_SIZE, finished.length)} of{" "}
          {finished.length} seasons
        </span>
        <div className="flex items-center gap-1.5">
          {/* A rule per page, the same marker the week ledger and the nav band
              use. Hidden from assistive technology: the range beside it already
              says where you are, and these are not controls. */}
          <div aria-hidden className="mr-1.5 flex items-center gap-1">
            {Array.from({ length: pageCount }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1 rounded-sm transition-all",
                  i === page ? "w-5 bg-foreground" : "w-2 bg-border",
                )}
              />
            ))}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="size-11 sm:size-7"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeftIcon />
            <span className="sr-only">More recent seasons</span>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-11 sm:size-7"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            <ChevronRightIcon />
            <span className="sr-only">Older seasons</span>
          </Button>
        </div>
      </div>
    )}
    </div>
  );
}
