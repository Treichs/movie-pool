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

import { PlayerAvatar } from "@/components/player-avatar";
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
import type { CareerRow } from "@/lib/league-records";

/**
 * CAREERS — board 4.3's table, and the app's second one on TanStack.
 *
 * ── IT COPIES `players/[profileId]/_components/seasons-table.tsx` ────────
 * That file is the reference implementation and carries the reasoning: v9's
 * `useTable`/`tableFeatures` API, why `@reui/data-grid` was rejected, and why
 * an inverted column needs `aria-sort` derived rather than read. Nothing here
 * is inverted — every column is better when bigger — so this one needs only
 * the shape.
 *
 * ── THE DEFAULT ORDER IS THE COMPOSER'S, NOT A SORT ─────────────────────
 * `buildCareerTable` returns titles-then-points, which is how a record book
 * ranks a career. Sorting starts empty so that order is what a reader sees
 * first; the columns are there because "who is most efficient" and "who has
 * played longest" are different questions and the board's static table cannot
 * answer either.
 *
 * ── THE TITLES CHIP IS `--primary`, NOT THE BOARD'S `#EB4B37` ────────────
 * That value is `--nav-primary`, the ink-side red, which the theme says
 * appears nowhere but an ink surface. This table is paper.
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

const columnHelper = createColumnHelper<typeof features, CareerRow>();

function SortIcon({ dir }: { dir: false | "asc" | "desc" }) {
  if (dir === "asc") return <ArrowUpIcon className="size-3" aria-hidden />;
  if (dir === "desc") return <ArrowDownIcon className="size-3" aria-hidden />;
  return (
    <ChevronsUpDownIcon className="size-3 text-muted-foreground/50" aria-hidden />
  );
}

const NUMERIC = "type-numeral text-right text-ui";
const numericColumns = new Set(["seasons", "points", "spent", "efficiency"]);

const two = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function CareerTable({ career }: { career: CareerRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("name", {
          header: "Player",
          sortFn: "text",
          cell: (c) => {
            const row = c.row.original;
            return (
              <div className="flex min-w-0 items-center gap-2.5">
                <PlayerAvatar
                  id={row.profileId}
                  name={row.name}
                  isMe={row.isMe}
                  className="size-6"
                />
                <Link
                  href={`/players/${row.profileId}`}
                  className={`truncate text-ui hover:underline ${row.isMe ? "type-ui font-semibold" : "type-ui"}`}
                >
                  {row.name}
                </Link>
                {/* Titles, not a rank. A career with none simply has no chip —
                    "0×" would give the emptiest line on the page a decoration. */}
                {row.titles > 0 && (
                  <Badge variant="default">{row.titles}×</Badge>
                )}
                {row.isCommissioner && (
                  <Badge variant="outline">Commissioner</Badge>
                )}
              </div>
            );
          },
        }),
        columnHelper.accessor("seasons", { header: "Seasons" }),
        columnHelper.accessor("points", {
          header: "Career points",
          cell: (c) => two(c.getValue()),
        }),
        columnHelper.accessor("spent", {
          header: "Spent",
          cell: (c) => `$${Math.round(c.getValue())}`,
        }),
        columnHelper.accessor((r) => r.efficiency, {
          id: "efficiency",
          header: "Pts / $",
          sortUndefined: "last",
          // A career that has never spent has no ratio — a dash, never a zero,
          // because zero is a real and much worse result.
          cell: (c) => {
            const v = c.getValue();
            return v === null ? "—" : two(v);
          },
        }),
      ]),
    []
  );

  const table = useTable({
    features,
    columns,
    data: career,
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
                return (
                  <TableHead
                    key={header.id}
                    className={numeric ? "text-right" : undefined}
                    aria-sort={
                      dir === false
                        ? "none"
                        : dir === "asc"
                          ? "ascending"
                          : "descending"
                    }
                  >
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className={`flex items-center gap-1.5 ${numeric ? "ml-auto" : ""}`}
                    >
                      <table.FlexRender header={header} />
                      <SortIcon dir={dir} />
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
              className={row.original.isMe ? "bg-muted/60" : undefined}
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
