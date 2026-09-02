import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * THE BENTO — the grid that replaced the three tabs, and the panel that sits
 * in its cells.
 *
 * ── WHY A GRID AND NOT A STACK OF SECTIONS ────────────────────────────────
 * The tabs hid two thirds of this screen behind a click each, and stacking
 * what they held would have made a page nobody reaches the bottom of. A grid
 * with UNEQUAL cells is the trade paper's own answer: a broadsheet does not
 * run one column of equal blocks down the page, it gives the lead story the
 * width and sets the rest beside it. The weeks ledger takes the full twelve;
 * every other pair splits 7/5 or 8/4, so no two rows have the same rhythm and
 * nothing reads as the first of several equals.
 *
 * ── TWELVE COLUMNS, AND ONLY AT `xl` ──────────────────────────────────────
 * Below `xl` the grid is two columns, and below `md` it is one. The spans are
 * therefore written as `xl:` only, and each cell states its `md` behaviour
 * separately — a 7-of-12 cell is a full-width cell on a tablet, not a
 * seven-twelfths one, and letting the same class do both would put a standings
 * table in half a tablet.
 *
 * ── THE CELLS ARE PAIRED BY HOW TALL THEIR CONTENT RUNS ───────────────────
 * `items-start` means a short cell never stretches to a tall neighbour, which
 * is right — a standings table padded out with 300px of white inside its own
 * panel is worse than the gap it was hiding. The consequence is that the
 * PAIRING is load-bearing: put a 530px cell beside a 290px one and the page
 * gets a hole.
 *
 * Two devices keep it closed, and both are in `page.tsx`:
 *   • CELLS ARE PAIRED WITH WHAT GROWS AT THEIR OWN RATE. Films-you-own and
 *     the season's picks both lengthen as a season runs on, so they face each
 *     other; the week's briefs are four however big the league gets, so they
 *     take the full width rather than propping up a stack.
 *   • `xl:self-stretch` on the rank chart, the one cell that gets BETTER with
 *     height rather than emptier. It is the slack-absorber: whatever the
 *     standings table beside it turns out to be, the chart is drawn to match.
 *
 * A ROW-SPAN IS NOT ONE OF THEM, AND USED TO BE. Until 2026-09-02 the picks
 * cell was `xl:row-span-2` with two short cells stacked beside it, tuned to
 * within 16px against a five-player league. The ten-player fixture inverted it
 * — the stack came out 1009px against 719 — because a row-span pins a
 * relationship between heights that the data is free to change. Pair by what
 * grows, not by what measured equal once.
 *
 * Anything else new goes next to something of its own length, or it goes full
 * width.
 *
 * ── THE CELL IS `Card variant="flat"`, NOT A NEW PANEL ────────────────────
 * The app already has one panel and its padding is a variable. A bento built
 * from a hand-rolled bordered div would be the sixteenth hand-written card,
 * which is how the padding drifted across four values the last time.
 *
 * `flush` is for a cell whose whole content is a table: the table draws its own
 * row padding and a card's would double it, so the padding comes off and the
 * heading gets its own inset instead.
 *
 * ── `role="region"` RATHER THAN A `<section>` ELEMENT ─────────────────────
 * `Card` is a plain `div` — it is not one of the `useRender` primitives, so it
 * cannot be told to render as a section, and wrapping it in one would put a
 * second box between the grid and its cell. A div with `role="region"` and an
 * `aria-labelledby` pointing at the heading IS the landmark a named `<section>`
 * produces, and it is what `standing-strip.tsx` and `you-tab.tsx` already did.
 */
/**
 * `mt-4` on top of the page's own `gap-6` is the page's ONE generous interval,
 * and it is spent here on purpose. Everything above ran on 24px and everything
 * inside runs on 16px, so a 24px step from the hero to the grid made the fold
 * between *your answer* and *the report* read exactly as loudly as the step
 * from a breadcrumb to its own heading — one value repeated until every break
 * weighed the same. 40px here gives the page a cadence: tight inside the grid,
 * ordinary between the page's own parts, wide at the single seam that matters.
 * It sits below the commissioner queue as well as below the hero, because the
 * queue belongs to the hero's question rather than to the report.
 */
export function Bento({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-12">
      {children}
    </div>
  );
}

export function BentoCell({
  id,
  title,
  aside,
  span,
  flush = false,
  children,
}: {
  /** The cell's anchor, and the stem of its heading id. */
  id: string;
  title: string;
  /** A note set against the heading — a unit, a caveat, a count. */
  aside?: React.ReactNode;
  /** Tailwind span classes. `md:` and `xl:` both, because they differ. */
  span: string;
  flush?: boolean;
  children: React.ReactNode;
}) {
  const headingId = `${id}-heading`;
  return (
    <Card
      variant="flat"
      id={id}
      role="region"
      aria-labelledby={headingId}
      className={cn(
        "overflow-hidden scroll-mt-32",
        span,
        // A flush cell's heading carries its own rule and the table starts
        // directly under it; a gap there reads as the table having drifted
        // loose from its own heading.
        flush ? "gap-0 p-0" : "gap-3",
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1",
          // A flush cell's table starts at the panel edge, so its heading needs
          // the padding the panel gave up — and a rule under it, because
          // without one the heading and the table's own header row read as two
          // headers of the same table.
          flush && "border-b px-(--card-spacing) pt-(--card-spacing) pb-3",
        )}
      >
        <h2 id={headingId} className="type-h2 text-h3">
          {title}
        </h2>
        {aside && (
          <span className="type-micro text-micro text-muted-foreground">
            {aside}
          </span>
        )}
      </div>
      {children}
    </Card>
  );
}
