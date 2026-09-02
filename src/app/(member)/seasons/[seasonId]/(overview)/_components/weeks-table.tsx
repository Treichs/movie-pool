"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
} from "lucide-react";
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
  useTable,
  type SortingState,
} from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, ordinal, sentenceCase } from "@/lib/format";
import type { WeekLedgerRow } from "@/lib/season-ledger";
import { cn } from "@/lib/utils";

/**
 * THE WEEK LEDGER — the season's spine, and what the Weeks tab became.
 *
 * ── IT IS A LEDGER NOW, NOT A LIST OF LINKS ───────────────────────────────
 * The tab it replaces was a stack of `Item` rows carrying a date, a status and
 * one number. Every figure beside them was already in hand and being thrown
 * away: what the slate held, how many of it you won, what you paid, where the
 * week left you standing. A player's actual question about week 06 is not
 * "what happened" but "what happened TO ME", and that is a row of columns.
 *
 * ── SORTING IS TANSTACK; EXPANDING IS `useState` ──────────────────────────
 * `players/[profileId]/_components/seasons-table.tsx` is the app's reference
 * implementation of v9's `useTable` / `tableFeatures` API and this copies its
 * shape. Expansion does NOT use `rowExpandingFeature`: that feature exists to
 * walk sub-rows through the row model, and these rows have none — the films are
 * a detail panel, not a nested table. A set of open week ids is the whole of
 * what it needs, and it survives a re-sort for free because it is keyed by id
 * rather than by row index.
 *
 * ── THE ROW IS NOT THE LINK; THE WEEK CELL IS ─────────────────────────────
 * A `<tr>` cannot be an anchor, and a row-wide `onClick` is a control no
 * keyboard reaches. The first cell carries the link and takes the week number
 * AND its date, so the target is two lines tall rather than four characters
 * wide. A PENDING WEEK GETS NO LINK — it has no slate and no bids, and the
 * page it would open has nothing on it.
 *
 * ── A PHONE GETS THREE COLUMNS, AND THAT IS THE WHOLE TABLE THERE ────────
 * Which week, what state it is in, what you scored. Seven columns at 375px is
 * a table read by dragging sideways, and the row's own expansion already
 * answers what you owned and what you paid. See `CELL` for which go and why.
 * What remains is inside its own `overflow-x-auto`, so the page itself never
 * pans.
 */

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { basic: sortFn_basic, text: sortFn_text },
});

const columnHelper = createColumnHelper<typeof features, WeekLedgerRow>();

/** Alignment per column, and which of them a phone gives up.
 *
 * A PHONE KEEPS THREE COLUMNS: which week, what state it is in, and what you
 * scored. Seven columns at 375px is a table you read by dragging sideways —
 * the slate size, how many you won, what you paid and where you stood are all
 * questions you ask on a laptop, and the row's own expansion answers the
 * middle two anyway. Everything returns at `sm`. */
const CELL: Record<string, string> = {
  number: "align-top",
  status: "align-top",
  slate: "hidden text-right align-top sm:table-cell",
  owned: "hidden text-right align-top sm:table-cell",
  paid: "hidden text-right align-top sm:table-cell",
  points: "text-right align-top",
  rankAfter: "hidden text-right align-top sm:table-cell",
};
const NUMERIC = new Set(["slate", "owned", "paid", "points", "rankAfter"]);

function SortIcon({ dir }: { dir: false | "asc" | "desc" }) {
  if (dir === "asc") return <ArrowUpIcon className="size-3" aria-hidden />;
  if (dir === "desc") return <ArrowDownIcon className="size-3" aria-hidden />;
  return (
    <ChevronsUpDownIcon className="size-3 text-muted-foreground/50" aria-hidden />
  );
}

const two = (n: number) => n.toFixed(2);

export function WeeksTable({ rows }: { rows: WeekLedgerRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("number", {
          header: "Week",
          cell: (c) => {
            const week = c.row.original;
            const label = (
              <>
                <span className="type-numeral text-h3">
                  {String(week.number).padStart(2, "0")}
                </span>
                <span className="type-body text-micro text-muted-foreground">
                  {formatDate(week.openingDate)}
                </span>
              </>
            );
            return week.href ? (
              <Link
                href={week.href}
                className="flex flex-col gap-0.5 underline-offset-4 hover:underline"
              >
                {label}
              </Link>
            ) : (
              <span className="flex flex-col gap-0.5 text-muted-foreground">
                {label}
              </span>
            );
          },
        }),
        columnHelper.accessor("status", {
          header: "Status",
          sortFn: "text",
          cell: (c) =>
            // THE ACCENT IS SPENT ON THE ONE LIVE ROW AND NOWHERE ELSE. A chip
            // in every row would be twelve chips saying nothing, and vermilion
            // means *live and yours*.
            c.row.original.isOpen ? (
              <Badge>{sentenceCase(c.getValue())}</Badge>
            ) : (
              <span className="text-ui text-muted-foreground">
                {sentenceCase(c.getValue())}
              </span>
            ),
        }),
        columnHelper.accessor("slate", {
          header: "Slate",
          cell: (c) => (c.getValue() === 0 ? "—" : c.getValue()),
        }),
        columnHelper.accessor("owned", {
          header: "Owned",
          cell: (c) => (c.getValue() === 0 ? "—" : c.getValue()),
        }),
        columnHelper.accessor((r) => r.paid, {
          id: "paid",
          header: "Paid",
          sortUndefined: "last",
          cell: (c) => {
            const v = c.getValue();
            return v === null ? "—" : `$${v}`;
          },
        }),
        columnHelper.accessor((r) => r.points, {
          id: "points",
          // TWO WORDS ON A LAPTOP, ONE ON A PHONE. The header cannot wrap — it
          // carries a sort control — so at 375px "My points" alone was 103px of
          // a 325px table and pushed the whole thing into a sideways drag. With
          // four columns showing, whose points these are is not in question.
          header: () => (
            <>
              <span className="sm:hidden">Points</span>
              <span className="hidden sm:inline">My points</span>
            </>
          ),
          sortUndefined: "last",
          // A DASH, NEVER A ZERO. Zero is a score a player can genuinely earn
          // — a film that opened to nothing — and "you owned nothing this
          // week" is a different fact that deserves a different mark.
          cell: (c) => {
            const v = c.getValue();
            return v === null ? "—" : two(v);
          },
        }),
        columnHelper.accessor((r) => r.rankAfter, {
          id: "rankAfter",
          header: "Place",
          sortUndefined: "last",
          cell: (c) => {
            const v = c.getValue();
            return v === null ? "—" : ordinal(v);
          },
        }),
      ]),
    [],
  );

  const table = useTable({
    features,
    columns,
    data: rows,
    state: { sorting },
    onSortingChange: setSorting,
  });

  // The expander is NOT a table column: it has no header text, no sort and no
  // accessor, and defining one would put an empty sortable button in the header
  // row. It is rendered beside the generated cells instead.
  const span = columns.length + 1;

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            <TableHead className="w-11 px-1">
              <span className="sr-only">Show the films you owned</span>
            </TableHead>
            {group.headers.map((header) => {
              const numeric = NUMERIC.has(header.column.id);
              const dir = header.column.getIsSorted();
              return (
                <TableHead
                  key={header.id}
                  className={cn(CELL[header.column.id], "align-bottom")}
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
                    className={cn(
                      "flex items-center gap-1.5",
                      numeric && "ml-auto",
                    )}
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
        {table.getRowModel().rows.map((row) => {
          const week = row.original;
          const expanded = open.has(week.weekId);
          const detailId = `week-${week.weekId}-films`;

          return [
            <TableRow
              key={week.weekId}
              className={cn(
                week.isUpcoming && "text-muted-foreground",
                // The live row is marked on its leading edge rather than by a
                // tint, so the accent stays a line and the row keeps the same
                // ground as every other one.
                week.isOpen && "shadow-[inset_2px_0_0_0_var(--primary)]",
              )}
            >
              <TableCell className="w-11 px-1 align-top">
                {week.films.length > 0 && (
                  // THE APP'S BUTTON, AT THE APP'S CONTROL HEIGHT. A 24px
                  // hand-rolled square was under every touch-target floor and
                  // had none of the focus ring or press behaviour the primitive
                  // carries. 36px is the height every other control on the page
                  // is, and the week cell is two lines tall, so the row does not
                  // grow to hold it.
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggle(week.weekId)}
                    aria-expanded={expanded}
                    aria-controls={detailId}
                  >
                    <ChevronRightIcon
                      aria-hidden
                      className={cn(
                        "transition-transform",
                        expanded && "rotate-90",
                      )}
                    />
                    <span className="sr-only">
                      {week.films.length === 1
                        ? `The film you owned in week ${week.number}`
                        : `The ${week.films.length} films you owned in week ${week.number}`}
                    </span>
                  </Button>
                )}
              </TableCell>
              {row.getAllCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={cn(
                    CELL[cell.column.id],
                    NUMERIC.has(cell.column.id) && "type-numeral text-ui",
                  )}
                >
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>,

            expanded ? (
              <TableRow
                key={`${week.weekId}-films`}
                className="hover:bg-transparent"
              >
                <TableCell
                  id={detailId}
                  colSpan={span}
                  className="bg-muted/40 p-0"
                >
                  <ul className="divide-y divide-border">
                    {week.films.map((film) => (
                      <li
                        key={film.id}
                        className="flex items-baseline justify-between gap-4 py-2.5 pr-4 pl-12"
                      >
                        <span className="type-h3 min-w-0 truncate text-ui">
                          {film.title}
                        </span>
                        <span className="flex shrink-0 items-baseline gap-4">
                          <span className="type-body text-micro text-muted-foreground">
                            you paid{" "}
                            <span className="type-numeral">
                              ${film.bid ?? 0}
                            </span>
                          </span>
                          <span className="type-numeral w-16 text-right text-ui">
                            {film.score === null ? "—" : two(film.score)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </TableCell>
              </TableRow>
            ) : null,
          ];
        })}
      </TableBody>
    </Table>
  );
}
