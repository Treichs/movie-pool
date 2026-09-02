import { Frame, FramePanel } from "@/components/reui/frame";
import { cn } from "@/lib/utils";

/**
 * THE DASHBOARD — one contained surface, shared by League Home and Season Home.
 *
 * ── WHY IT IS IN `src/components/` ON ITS FIRST DAY ───────────────────────
 * The house rule is that a component starts in its route's `_components/` and
 * moves here the first time a SECOND route needs it, never in anticipation.
 * Two routes need this one before it exists: `/leagues/[leagueId]` and
 * `/seasons/[seasonId]` are being rebuilt on the same shell, and the reason
 * they share it is the thing the rule is protecting. `BidCta` was drawn twice,
 * differently, on those same two pages until it was lifted out on 2026-09-02.
 * A dashboard drawn twice would be the same mistake at ten times the size.
 *
 * ── IT IS `Frame`, NOT A NEW PANEL ────────────────────────────────────────
 * `components/reui/frame.tsx` is the vendored container: a toned ground, one
 * border, one radius, and panels inset inside it. It sat with zero consumers
 * until this file. Three of its registry defaults are wrong for this app and
 * were edited in place — the ground was half-strength wash, the panels carried
 * a shadow, and the panel radius was computed to nest concentrically inside the
 * frame's, which goes negative at a 4px corner language. Those edits are in
 * `frame.tsx` with their reasons; nothing here re-states them.
 *
 * ── THREE TONES MAKE THE EDGE, AND NO SHADOW DOES ─────────────────────────
 * Paper page, wash frame, sheet panels. That tonal step is the whole container
 * — the Flat Panel Rule spends lift only on things that behave like physical
 * objects, and a dashboard of softly shadowed tiles is the generic look this
 * design system was built to escape.
 *
 * ── WHAT REPLACED THE BENTO'S PAIRING PROBLEM ─────────────────────────────
 * `bento.tsx` documents at length that its cells grow at different rates, so
 * every pair had to be hand-matched by growth rate and re-cut whenever the
 * fixture got bigger — a pair tuned to within 16px against five players tore a
 * 290px hole against ten. The answer is not better pairing. It is that a paged
 * panel and a rail are a FIXED HEIGHT whatever the data does, so the grid can
 * be laid out by importance instead of by measurement.
 */

/**
 * The frame, its ground, and the one line of type that names it.
 *
 * Padding is set here rather than in `frame.tsx` because it is this surface's
 * decision, not the vendored component's: the registry ships 3px, which is a
 * hairline gutter meant for stacked list panels rather than a dashboard.
 */
export function Dashboard({
  eyebrow,
  meta,
  className,
  children,
}: {
  /** What the frame is a report of — "The season report". */
  eyebrow: string;
  /** The standing facts under it: counts, a capture time, a season span. */
  meta?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Frame
      className={cn(
        "[--frame-gap:--spacing(3)] [--frame-px:--spacing(3)] [--frame-py:--spacing(3)]",
        // A PHONE SPENDS ITS WIDTH ON CONTENT, NOT ON A CONTAINER IT CAN
        // ALREADY SEE. Below `sm` the frame drops its own padding and lets the
        // panels run to its edge — 24px per side returned to the data, on the
        // one screen where that is the difference between a table and a
        // scrollbar. The border and the ground stay, so the edge does not.
        "max-sm:[--frame-gap:0px] max-sm:[--frame-px:0px] max-sm:[--frame-py:0px]",
        className
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1 pt-0.5 pb-1.5 max-sm:px-4 max-sm:pt-3 max-sm:pb-2">
        <span className="type-eyebrow text-eyebrow text-muted-foreground">
          {eyebrow}
        </span>
        {meta && (
          <span className="type-micro text-micro text-muted-foreground">
            {meta}
          </span>
        )}
      </div>
      {children}
    </Frame>
  );
}

/**
 * TWELVE COLUMNS AT `xl`, SIX AT `md`, ONE BELOW.
 *
 * Twelve rather than the bento's twelve-at-xl-two-at-md, because the page frame
 * is now 90rem and a twelfth of it is a usable 100px track. Six at `md` is the
 * same set of spans halved, which is what makes a span string readable: an
 * 8-of-12 cell is a 4-of-6 cell, not a full-width one.
 *
 * `items-start` so a short panel never stretches to a tall neighbour. With
 * paging and rails capping the tall ones that matters far less than it did, but
 * a panel padded out with white inside its own border is still worse than the
 * gap it was hiding.
 */
export function DashboardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-6 xl:grid-cols-12 max-sm:gap-0">
      {children}
    </div>
  );
}

/**
 * One panel in the grid.
 *
 * `role="region"` rather than a `<section>` element for the same reason
 * `BentoCell` does it: `FramePanel` is a plain `div` with no `render` prop, and
 * wrapping it in a section would put a second box between the grid and its
 * cell. A div with `role` and `aria-labelledby` IS the landmark a named section
 * produces.
 *
 * `flush` is for a panel whose whole content is a table: the table draws its own
 * row padding and the panel's would double it, so the padding comes off and the
 * heading takes it back as its own inset plus a rule.
 */
export function DashboardPanel({
  id,
  title,
  aside,
  span,
  flush = false,
  hideTitle = false,
  className,
  children,
}: {
  /** The panel's anchor, and the stem of its heading id. */
  id: string;
  title: string;
  /** A note set against the heading — a unit, a caveat, a count. */
  aside?: React.ReactNode;
  /** Span classes. `md:` and `xl:` both, because six and twelve differ. */
  span: string;
  flush?: boolean;
  /**
   * Keep the heading for assistive technology and take it off the screen.
   *
   * For the ONE panel whose content already announces itself: the command
   * band's first line is a 72px ordinal under an eyebrow reading "Your
   * position", so a panel heading above it would say the same thing twice at
   * two sizes. The landmark still needs a name — a `role="region"` without one
   * is a region a screen-reader user cannot identify — so the `h2` is rendered
   * `sr-only` rather than dropped.
   *
   * This is deliberately not a general escape hatch. Every other panel earns
   * its heading; if a second one wants this, the question to ask first is
   * whether it should be a panel at all.
   */
  hideTitle?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const headingId = `${id}-heading`;
  return (
    <FramePanel
      id={id}
      role="region"
      aria-labelledby={headingId}
      className={cn(
        "flex flex-col scroll-mt-32",
        span,
        flush ? "gap-0 p-0" : "gap-3",
        // At phone width the panels are a stacked ledger inside the frame
        // rather than cards in a grid, so they square off and share one rule
        // between them instead of each drawing four.
        "max-sm:rounded-none max-sm:border-x-0 max-sm:border-t-0 max-sm:last:border-b-0",
        className
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1",
          flush &&
            "border-b px-(--frame-panel-px) pt-(--frame-panel-py) pb-3 max-sm:px-4",
          // With the heading hidden and no aside, the row has nothing in it and
          // would still spend a gap. It goes entirely.
          hideTitle && !aside && "contents"
        )}
      >
        <h2
          id={headingId}
          className={cn(hideTitle ? "sr-only" : "type-h2 text-h3")}
        >
          {title}
        </h2>
        {aside && (
          <span className="type-micro text-micro text-muted-foreground">
            {aside}
          </span>
        )}
      </div>
      {children}
    </FramePanel>
  );
}
