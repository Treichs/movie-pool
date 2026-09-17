import { RecordCard } from "@/components/record-card";
import type { LeagueAggregates, LeagueRecordBook } from "@/lib/league-records";
import { cn } from "@/lib/utils";

import { GoingRate } from "./going-rate";

/**
 * THE MARQUEE RECORDS — the bragging rights, at the top of the league rather
 * than three clicks inside it.
 *
 * ── THE FLAG WAS ALWAYS FOR THIS PAGE ────────────────────────────────────
 * `LeagueRecordBook.records` carries a `marquee` boolean whose own comment
 * reads "Marquee records lead League Home" — and League Home discarded the
 * whole list until 2026-09-01, keeping only the league averages. The read was
 * already being paid for on this page: `getLeagueHome` builds the record book
 * to get the career table.
 *
 * ── THE COMPOSER DECIDES WHICH LEAD, AND HOW MANY ────────────────────────
 * Filtering on the flag rather than slicing a count is the same rule the
 * records page follows: every record self-suppresses when the league has no
 * data for it, so a league on its first weekend genuinely has fewer, and a
 * hard-coded four would render an empty column.
 *
 * ── COLUMNS, NOT CARDS, AND THE AVERAGES UNDERNEATH ──────────────────────
 * This sits inside a `DashboardPanel`, which is already the sheet. Until
 * 2026-09-17 it drew four bordered cards two-by-two inside that sheet — a card
 * in a card, 430px tall for four facts, with a 300px void between each
 * numeral and its poster. Now it is one row of four columns divided by rules,
 * the shape Season Home's "in brief" band uses, and the league's averages run
 * as a strip beneath them. The two were separate panels that both linked to
 * `/records`; a reader wants one record book, not two doors to it.
 *
 * The page gates the whole panel on there being a marquee record, so the
 * heading is never drawn over nothing — the condition lives where the heading
 * does, the lesson the announcements panel taught.
 */
/** THE COLUMN COUNT FOLLOWS THE RECORD COUNT. Four across at `xl` is ~320px a
 *  column on the 90rem page frame, which takes an h2 numeral and a poster
 *  side by side; two across survives everywhere narrower. Three at `lg` rather
 *  than at `sm`, because three of anything at 640px is three slivers. The
 *  class has to be a literal for Tailwind to emit it at all. */
const COLUMNS: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 xl:grid-cols-4",
};

/** Rules between columns and rows, drawn by position rather than by wrapper:
 *  every row but the last gets a rule beneath it, every column but the first
 *  a rule to its left, at each of the three column counts. Tailwind needs the
 *  literal selectors, so they are spelled out per breakpoint. */
const RULES: Record<number, string> = {
  1: "border-b border-border last:border-b-0",
  2: cn(
    "border-b border-border last:border-b-0",
    "sm:[&:nth-last-child(-n+2)]:border-b-0",
    "sm:border-l sm:[&:nth-child(odd)]:border-l-0",
  ),
  3: cn(
    "border-b border-border last:border-b-0",
    "sm:[&:nth-last-child(-n+2)]:border-b-0",
    "sm:border-l sm:[&:nth-child(odd)]:border-l-0",
    "lg:border-b-0 lg:border-l lg:first:border-l-0",
  ),
  4: cn(
    "border-b border-border last:border-b-0",
    "sm:[&:nth-last-child(-n+2)]:border-b-0",
    "sm:border-l sm:[&:nth-child(odd)]:border-l-0",
    "xl:border-b-0 xl:border-l xl:first:border-l-0",
  ),
};

export function RecordShelf({
  records,
  aggregates,
  leagueId,
}: {
  records: LeagueRecordBook["records"];
  aggregates: LeagueAggregates | null;
  leagueId: string;
}) {
  const marquee = records.filter((r) => r.marquee);
  if (marquee.length === 0) return null;

  const count = Math.min(marquee.length, 4);

  return (
    // Bleeds to the panel's edges so the rules run into its border, the way a
    // ruled column does in print. The panel's own padding is what each column
    // takes back as its inset.
    <div className="-mx-(--frame-panel-px) -mb-(--frame-panel-py) flex flex-col border-t">
      <div className={cn("grid grid-cols-1", COLUMNS[count])}>
        {marquee.map((r) => (
          <RecordCard
            key={r.label}
            label={r.label}
            entry={r.entry}
            marquee={r.marquee}
            leagueId={leagueId}
            variant="column"
            className={cn("px-(--frame-panel-px) py-4", RULES[count])}
          />
        ))}
      </div>
      <GoingRate aggregates={aggregates} />
    </div>
  );
}
