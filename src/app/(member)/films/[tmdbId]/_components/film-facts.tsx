import { Card } from "@/components/ui/card";
import type { FilmDetailPage } from "@/lib/film-page";
import { formatDateFull } from "@/lib/format";

/**
 * THE FACTS PANEL — board 2.2's rail.
 *
 * ── "STUDIO" IS ON THE BOARD AND IS NOT IN THE DATA ──────────────────────
 * `film_catalog` holds no production company and `fetchMovieDetail` does not
 * read one, so the row is absent rather than stubbed. Adding it is a TMDB
 * field plus a column plus a migration — a decision, not an oversight to fix
 * quietly here.
 *
 * ── A ROW WITH NO VALUE IS NOT DRAWN ─────────────────────────────────────
 * An uncatalogued film renders straight from TMDB with every OMDb-sourced
 * field null, and a panel of five dashes says less than a panel of two facts.
 */

function Fact({
  label,
  value,
  numeral,
}: {
  label: string;
  value: string | null;
  numeral?: boolean;
}) {
  if (value === null) return null;
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="type-body text-ui text-muted-foreground">{label}</dt>
      <dd className={numeral ? "type-numeral text-ui" : "text-ui text-right"}>
        {value}
      </dd>
    </div>
  );
}

const money = (n: number | null) =>
  n === null || n === 0 ? null : `$${Math.round(n / 1_000_000)}M`;

export function FilmFacts({ film }: { film: FilmDetailPage }) {
  const released = film.release_date_us_wide ?? film.release_date_us_limited;

  return (
    <Card variant="flat" size="sm" className="gap-2.5">
      <span className="type-eyebrow text-eyebrow text-muted-foreground">
        Facts
      </span>
      <dl className="flex flex-col gap-2.5">
        <Fact
          label="Released"
          value={released === null ? null : formatDateFull(released)}
        />
        {/* Which US date the catalogue holds IS the release type — the two
            columns exist because a limited run and a wide one are different
            events, and only one of them opens a pool week. */}
        <Fact
          label="Release type"
          value={
            film.release_date_us_wide
              ? "Wide"
              : film.release_date_us_limited
                ? "Limited"
                : null
          }
        />
        <Fact label="Director" value={film.director} />
        <Fact label="Rated" value={film.certification} />
        <Fact label="Budget" value={money(film.budget)} numeral />
      </dl>
    </Card>
  );
}
