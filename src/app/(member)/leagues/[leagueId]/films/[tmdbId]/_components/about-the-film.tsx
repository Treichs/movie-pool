import { Figure } from "@/components/figure";
import { TextLink } from "@/components/text-link";
import { TomatoMark } from "@/components/tomato-mark";
import { isFresh } from "@/components/tomatometer";
import { Card } from "@/components/ui/card";
import type { FilmDetailPage } from "@/lib/film-page";

/**
 * THE CATALOG MATERIAL, SUBORDINATE — board 2.3's foot.
 *
 * ── THE ORDERING IS ADR-408 EXPRESSED AS LAYOUT ──────────────────────────
 * The league's record leads and this follows. Inverting the two would make
 * this a catalog page with a table bolted on, which is the shape the ADR
 * exists to rule out.
 *
 * ── THESE RATINGS ARE NOT THE ONES THAT SCORED THE FILM ──────────────────
 * The panel above shows what the commissioner entered; these are TMDB's and
 * OMDb's canonical numbers, and the two legitimately differ. They sit down
 * here, under a heading that says "about the film", rather than next to the
 * score where they would read as a correction to it.
 *
 * ── THE MARK RIDES THE NUMERAL, THE EYEBROW STAYS A WORD ─────────────────
 * Same reason as the catalog masthead: in a row of four figures the label is
 * what separates them, so the mark cannot replace it the way it does in the
 * `Tomatometer` chip. It sits beside the number instead.
 */
export function AboutTheFilm({
  film,
  tmdbId,
}: {
  film: FilmDetailPage;
  tmdbId: number;
}) {
  const runtime =
    film.runtime_min === null
      ? null
      : `${Math.floor(film.runtime_min / 60)}h ${film.runtime_min % 60}m`;

  const figures: { label: string; value: React.ReactNode }[] = [
    {
      label: "Tomatometer®",
      value:
        film.rt_tomatometer === null ? null : (
          <span className="inline-flex items-center gap-1.5">
            <TomatoMark
              fresh={isFresh(film.rt_tomatometer)}
              className="size-5"
            />
            {film.rt_tomatometer}%
          </span>
        ),
    },
    {
      label: "Metacritic",
      value: film.metascore === null ? null : String(film.metascore),
    },
    {
      label: "IMDb",
      value: film.imdb_rating === null ? null : `${film.imdb_rating}/10`,
    },
    { label: "Runtime", value: runtime },
  ].filter((f) => f.value !== null);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
      <section className="flex flex-col gap-2.5">
        <h2>About the film</h2>
        {film.overview && (
          <p className="type-body max-w-measure-default text-ui">
            {film.overview}
          </p>
        )}
        {figures.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-6">
            {figures.map((f) => (
              <Figure key={f.label} label={f.label} value={f.value} />
            ))}
          </div>
        )}
      </section>

      <Card variant="flat" size="sm" className="gap-2">
        <span className="type-eyebrow text-eyebrow text-muted-foreground">
          Also see
        </span>
        <TextLink href={`/films/${tmdbId}`} size="ui">
          The catalog page for this film
        </TextLink>
        <span className="type-body text-micro text-muted-foreground">
          Trailer, full cast and TMDB facts, with no league play on it.
        </span>
      </Card>
    </div>
  );
}
