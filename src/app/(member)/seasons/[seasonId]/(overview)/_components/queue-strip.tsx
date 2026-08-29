import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { formatDate } from "@/lib/format";
import type { OverdueWeek } from "@/lib/commish";

/**
 * WAITING ON YOU — the commissioner Queue, and this is its first render.
 *
 * `getOverdueWeeks` has existed with zero consumers; sticky note 2 on board 3.1
 * settles that it is a STRIP on this page rather than a route of its own, which
 * is the whole of what the retired commissioner tree becomes.
 *
 * ── ROWS ARE `ui/item`, NOT A HAND-ROLLED FLEX ROW ────────────────────────
 * Media, title, description, whole row a link: that is `Item`'s exact shape and
 * it already carries the `group-has-data-[slot=item-description]` alignment
 * that keeps a media block from centring against two lines of text. A first
 * draft of this file rebuilt it from a `<div className="flex">` — the same
 * mistake the roster and the league list made before it.
 *
 * ── IT SAYS "ONLY YOU SEE THIS", AND THAT IS LOAD-BEARING COPY ────────────
 * Everything else on this page is the same for everybody. A block that appears
 * for one person and not the others has to say so, or a commissioner will
 * assume the league is being nagged about their backlog.
 *
 * ── INK, NOT RED ──────────────────────────────────────────────────────────
 * Overdue work is not an error and not destructive, and the page's one red
 * belongs to the countdown. The strip earns attention from position and a solid
 * ink edge instead.
 */
export function QueueStrip({
  seasonId,
  weeks,
}: {
  seasonId: string;
  weeks: OverdueWeek[];
}) {
  if (weeks.length === 0) return null;

  return (
    <section
      aria-label="Waiting on you"
      className="flex flex-col gap-3 rounded border-2 border-foreground bg-card p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="type-h3 text-h3">Waiting on you</h2>
        <Badge variant="secondary">Only you see this</Badge>
      </div>

      <ItemGroup className="gap-2.5">
        {weeks.map((week) => (
          <Item
            key={week.id}
            variant="outline"
            render={<Link href={`/seasons/${seasonId}/weeks/${week.id}`} />}
            className="hover:bg-muted"
          >
            <ItemMedia>
              <span
                aria-hidden
                className="type-numeral flex size-9 items-center justify-center rounded-xs bg-foreground text-h3 text-background"
              >
                {String(week.number).padStart(2, "0")}
              </span>
            </ItemMedia>
            <ItemContent>
              <ItemTitle>
                Week {String(week.number).padStart(2, "0")} results are not
                captured
              </ItemTitle>
              <ItemDescription>
                {/* THE COUNT IS "n of m", not a bare number, because "3
                    uncaptured" reads as three problems when it may be three of
                    three or three of eight. `getOverdueWeeks` returns both for
                    exactly this reason. */}
                Results opened {formatDate(week.resultsOpenedOn)} ·{" "}
                {week.uncaptured} of {week.eligible} film
                {week.eligible === 1 ? "" : "s"} still to capture
              </ItemDescription>
            </ItemContent>
          </Item>
        ))}
      </ItemGroup>
    </section>
  );
}
