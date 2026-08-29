import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import type { HubDeltas, HubFilm } from "@/lib/season-hub";

/**
 * YOU — what the viewer owns, and what moved for them last week.
 *
 * ── A NULL DELTA IS NOT A ZERO, AND THEY RENDER DIFFERENTLY ───────────────
 * `HubDeltas`'s own comment insists on this: null means there is no honest
 * comparison — no prior position, or nothing scored yet — while zero means
 * genuinely unchanged. A dash says the first; "+0" would claim the second.
 */
function Delta({
  label,
  value,
  digits = 0,
}: {
  label: string;
  value: number | null;
  digits?: number;
}) {
  // NO SIGN FLIP HERE, and the first draft carried a prop for one. `rank` on
  // `HubDeltas` is already "places CLIMBED, positive is up" — the composer did
  // the inversion, so a second one in the view would have shown a promotion as
  // a fall. The prop never changed the output and is gone.
  const up = value !== null && value > 0;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="type-eyebrow text-eyebrow text-muted-foreground">
        {label}
      </span>
      <span className="type-numeral text-h3">
        {value === null
          ? "—"
          : `${up ? "+" : ""}${value.toFixed(digits)}`}
      </span>
    </div>
  );
}

export function YouTab({
  films,
  deltas,
}: {
  films: HubFilm[];
  deltas: HubDeltas;
}) {
  return (
    <div className="flex flex-col gap-6">
      <section
        aria-label="Since last week"
        className="flex flex-wrap gap-8 rounded border bg-card p-5"
      >
        <Delta label="Places moved" value={deltas.rank} />
        <Delta label="Points added" value={deltas.points} digits={2} />
        <Delta label="Points per dollar" value={deltas.efficiency} digits={2} />
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="type-eyebrow text-eyebrow text-muted-foreground">
          Films you own
        </h3>
        {films.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>You do not own a film yet</EmptyTitle>
              <EmptyDescription>
                Films arrive here the moment a week resolves and your bid turns
                out to be one of the winning amounts.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup className="gap-2.5">
            {films.map((film) => (
              <Item key={film.id} variant="outline">
                <ItemContent>
                  <ItemTitle className="type-h3 text-h3">
                    {film.title}
                  </ItemTitle>
                  <ItemDescription>
                    Week {String(film.weekNumber).padStart(2, "0")}
                    {film.myBid !== null && ` · you paid $${film.myBid}`}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <span className="type-numeral text-h3">
                    {film.score === null ? "—" : Number(film.score).toFixed(2)}
                  </span>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </section>
    </div>
  );
}
