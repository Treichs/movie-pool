import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { formatDate } from "@/lib/format";
import type { Week } from "@/lib/commish";
import type { HubFilm } from "@/lib/season-hub";

const STATUS: Record<Week["status"], { label: string; open?: boolean }> = {
  draft: { label: "Not open yet" },
  open: { label: "Taking bids", open: true },
  // `WeekStatus` in commish.ts is five values, not the schema enum's six —
  // it deliberately omits `locked`. Mirroring the app type rather than the
  // database one keeps this map exhaustive and lets TypeScript say so.
  closed: { label: "Bids in, owners settling" },
  final: { label: "Scored" },
  skipped: { label: "Skipped" },
};

/** A settled week nobody bid in. NOT "Skipped" — a skipped week never had a
 *  slate, this one had films that opened and were passed over — and not "Bids
 *  in, owners settling", which is false twice. Same words the week board and
 *  `weekStatusDisplay` use, so the two surfaces agree. */
const NOBODY_BID = "Nobody bid";

/**
 * WEEKS — the tab that leads, because it is the only one with a deadline in it.
 *
 * ── THE SCORE PER WEEK IS THE VIEWER'S, DERIVED FROM FILMS THEY OWN ───────
 * There is no per-week total on `SeasonHub`, and adding a read for one would
 * duplicate what `myFilms` already carries: every film the viewer owns, its
 * score, and the week it belongs to. Summing by week here costs nothing and
 * cannot disagree with the films list on the You tab, because it IS that list.
 *
 * A week with no owned films shows a dash, not a zero. Zero is a real score a
 * player can earn; "you owned nothing" is a different fact.
 */
export function WeeksTab({
  seasonId,
  weeks,
  myFilms,
  unbidWeekIds,
}: {
  seasonId: string;
  weeks: Week[];
  myFilms: HubFilm[];
  unbidWeekIds: Set<string>;
}) {
  const mine = new Map<number, number>();
  for (const film of myFilms) {
    const score = film.score === null ? null : Number(film.score);
    if (score === null) continue;
    mine.set(film.weekNumber, (mine.get(film.weekNumber) ?? 0) + score);
  }

  return (
    <ItemGroup className="gap-2.5">
      {weeks.map((week) => {
        const status = STATUS[week.status];
        const label = unbidWeekIds.has(week.id) ? NOBODY_BID : status.label;
        const score = mine.get(week.number);
        // A DRAFT WEEK IS NOT A DESTINATION. It has no slate and no bids, and
        // linking to one lands on a page with nothing on it.
        const href =
          week.status === "draft"
            ? null
            : `/seasons/${seasonId}/weeks/${week.id}`;

        return (
          <Item
            key={week.id}
            variant="outline"
            render={href ? <Link href={href} /> : undefined}
            className={href ? "hover:bg-muted" : "opacity-70"}
          >
            <ItemMedia>
              <span
                aria-hidden
                className="type-numeral flex size-10 items-center justify-center rounded-xs bg-muted text-h3"
              >
                {String(week.number).padStart(2, "0")}
              </span>
            </ItemMedia>
            <ItemContent>
              <ItemTitle className="type-h3 text-h3">
                {formatDate(week.opening_date)}
              </ItemTitle>
              <ItemDescription>{label}</ItemDescription>
            </ItemContent>
            <ItemActions className="gap-4">
              {status.open && <Badge>Open</Badge>}
              <span className="type-numeral w-16 text-right text-ui">
                {score === undefined ? "—" : score.toFixed(2)}
              </span>
            </ItemActions>
          </Item>
        );
      })}
    </ItemGroup>
  );
}
