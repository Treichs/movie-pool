"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
  useTable,
  type SortingState,
} from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ordinal } from "@/lib/format";
import type { PlayerSeason } from "@/lib/player-profile";

/**
 * SEASON BY SEASON — the first table in this app built on TanStack.
 *
 * ── WHY TANSTACK, AND WHY NOT THE DATA GRID ───────────────────────────────
 * `@tanstack/react-table` is headless: it supplies the sorting model and
 * nothing else, so the markup stays the vendored `ui/table` and this table
 * looks like every other table in the app. `@reui/data-grid` is also
 * TanStack-based and was the obvious alternative — rejected here because it
 * ships ten files plus `dnd-kit` and virtualisation to give a player, who has
 * a handful of seasons, column drag-and-drop nobody asked for.
 *
 * ── SORTING IS THE REASON THE LIBRARY IS HERE ─────────────────────────────
 * Board 2.4 draws the rows newest-first and static. "Which season did I
 * actually play best?" is the question this table exists to answer, and it is
 * unanswerable by reading down a six-column list. Hand-rolling it is one
 * `useState` and a comparator per column — the thing that gets written six
 * times and diverges on the seventh.
 *
 * ── THIS IS THE **v9** API, WHICH IS NOT THE ONE MOST EXAMPLES SHOW ───────
 * v9 renamed `useReactTable` to `useTable` and moved the row models behind an
 * explicit `tableFeatures()` call, so nothing is bundled that the table does
 * not ask for. Every v8 snippet online — including shadcn's own data-table
 * page — will not compile against it. There is a `useLegacyTable` shim; it is
 * deliberately not used, because adopting a library through its compatibility
 * layer means writing the migration twice.
 *
 * ── `invertSorting` IS WHY FINISH SORTS CORRECTLY ─────────────────────────
 * Every other numeric column is better when bigger. `place` is better when
 * smaller, and v9 has a first-class answer for exactly this case — its own
 * docs call it "golf score-like". A table that answered "best finish" with 8th
 * at the top would be sorted and useless.
 */

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    text: sortFn_text,
  },
});

const columnHelper = createColumnHelper<typeof features, PlayerSeason>();

function SortIcon({ dir }: { dir: false | "asc" | "desc" }) {
  if (dir === "asc") return <ArrowUpIcon className="size-3" aria-hidden />;
  if (dir === "desc") return <ArrowDownIcon className="size-3" aria-hidden />;
  return (
    <ChevronsUpDownIcon
      className="size-3 text-muted-foreground/50"
      aria-hidden
    />
  );
}

const NUMERIC = "type-numeral text-right text-ui";

export function SeasonsTable({
  seasons,
  spansLeagues,
}: {
  seasons: PlayerSeason[];
  spansLeagues: boolean;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("seasonName", {
          header: "Season",
          sortFn: "text",
          cell: (c) => (
            <Link
              href={`/seasons/${c.row.original.seasonId}`}
              className="type-ui text-ui hover:underline"
            >
              {c.getValue()}
            </Link>
          ),
        }),
        ...(spansLeagues
          ? [
              columnHelper.accessor("leagueName", {
                header: "League",
                sortFn: "text",
                cell: (c) => (
                  <span className="text-muted-foreground">{c.getValue()}</span>
                ),
              }),
            ]
          : []),
        columnHelper.accessor("place", {
          header: "Finish",
          // Smaller is better. See the docblock — this is the one column where
          // the sort must run backwards to mean anything.
          invertSorting: true,
          cell: (c) => {
            const live = c.row.original.status === "active";
            return (
              <Badge
                variant={c.getValue() === 1 && !live ? "default" : "secondary"}
              >
                {ordinal(c.getValue())}
                {live && " · live"}
              </Badge>
            );
          },
        }),
        columnHelper.accessor("points", {
          header: "Points",
          cell: (c) =>
            c.getValue().toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
        }),
        columnHelper.accessor("spent", {
          header: "Spent",
          cell: (c) => `$${Math.round(c.getValue())}`,
        }),
        columnHelper.accessor("filmsOwned", { header: "Films" }),
        columnHelper.accessor((r) => (r.spent > 0 ? r.points / r.spent : null), {
          id: "efficiency",
          header: "Pts / $",
          sortUndefined: "last",
          // A season with nothing spent has no ratio — a dash, never a zero,
          // because zero is a real and much worse result.
          cell: (c) => {
            const v = c.getValue();
            return v === null ? "—" : v.toFixed(2);
          },
        }),
      ]),
    [spansLeagues]
  );

  const numericColumns = new Set([
    "points",
    "spent",
    "filmsOwned",
    "efficiency",
  ]);

  /**
   * `aria-sort` MUST DESCRIBE WHAT IS ON SCREEN, NOT THE INTERNAL STATE.
   *
   * `invertSorting` flips the rows but not what `getIsSorted()` reports, so on
   * the Finish column the table said "descending" while visibly running 1st,
   * 3rd, 3rd — ascending, to anyone who could see it. A screen reader would
   * have been told the opposite of the truth. Caught by driving it.
   */
  const inverted = new Set(["place"]);
  /** What the reader actually sees, which on an inverted column is the
   *  opposite of the state TanStack holds. Both the arrow and `aria-sort` read
   *  from this, so they can never disagree with each other or with the rows. */
  const effectiveDir = (columnId: string, dir: false | "asc" | "desc") =>
    !dir ? false : inverted.has(columnId) ? (dir === "asc" ? "desc" : "asc") : dir;

  const table = useTable({
    features,
    columns,
    data: seasons,
    state: { sorting },
    onSortingChange: setSorting,
  });

  return (
    <Card variant="flat" className="gap-0 overflow-x-auto p-0">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => {
                const numeric = numericColumns.has(header.column.id);
                const dir = header.column.getIsSorted();
                const shown = effectiveDir(header.column.id, dir);
                return (
                  <TableHead
                    key={header.id}
                    className={numeric ? "text-right" : undefined}
                    aria-sort={
                      shown === false
                        ? "none"
                        : shown === "asc"
                          ? "ascending"
                          : "descending"
                    }
                  >
                    {/* A real button, so a header is reachable by keyboard and
                        announces itself. `aria-sort` on the cell is what a
                        screen reader reads; the glyph is for everyone else. */}
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className={`flex items-center gap-1.5 ${numeric ? "ml-auto" : ""}`}
                    >
                      <table.FlexRender header={header} />
                      <SortIcon dir={shown} />
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              // The live season is tinted, as the board draws it.
              className={
                row.original.status === "active" ? "bg-muted/60" : undefined
              }
            >
              {row.getAllCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={
                    numericColumns.has(cell.column.id) ? NUMERIC : undefined
                  }
                >
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
