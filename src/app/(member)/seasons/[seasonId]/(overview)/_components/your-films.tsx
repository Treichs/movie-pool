import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import type { HubFilm } from "@/lib/season-hub";

/**
 * FILMS YOU OWN — best score first, which is the one order the week ledger
 * beside it cannot give.
 *
 * ── IT IS NOT THE SAME LIST AS THE LEDGER'S EXPANSIONS ────────────────────
 * A row of the week ledger opens to show what you owned THAT WEEK, in that
 * week's context. This is the whole holding ranked by what it returned, which
 * is the question a player asks when deciding whether their bidding is
 * working. Same films, two orders, two questions — the You tab's list survives
 * as this, and its three deltas moved into the hero where the rest of the
 * viewer's season already is.
 *
 * ── THE SCORE COLUMN IS FIXED WIDTH AND TABULAR ───────────────────────────
 * A ranked list whose figures do not line up on their digits is not ranked,
 * it is sorted. The numeral role does the tabular figures; the fixed width
 * keeps a two-digit score from indenting against a three-digit one.
 */
export function YourFilms({ films }: { films: HubFilm[] }) {
  if (films.length === 0) {
    return (
      <Empty className="border-0 py-6">
        <EmptyHeader>
          <EmptyTitle>You do not own a film yet</EmptyTitle>
          <EmptyDescription>
            Films arrive here the moment a week resolves and your bid turns out
            to be one of the winning amounts.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ul className="-mx-(--card-spacing) divide-y divide-border border-t">
      {films.map((film) => (
        <li
          key={film.id}
          className="flex items-baseline justify-between gap-4 px-(--card-spacing) py-2.5"
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="type-h3 truncate text-ui">{film.title}</span>
            <span className="type-body text-micro text-muted-foreground">
              Week {String(film.weekNumber).padStart(2, "0")}
              {film.myBid !== null && (
                <>
                  {" · you paid "}
                  <span className="type-numeral">${film.myBid}</span>
                </>
              )}
            </span>
          </span>
          <span className="type-numeral w-16 shrink-0 text-right text-h3">
            {film.score === null ? "—" : Number(film.score).toFixed(2)}
          </span>
        </li>
      ))}
    </ul>
  );
}
