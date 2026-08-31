import { Card } from "@/components/ui/card";
import type { FilmDetailPage } from "@/lib/film-page";
import { formatDateFull } from "@/lib/format";

/**
 * THE FACTS PANEL — board 2.2's rail.
 *
 * ── "STUDIO" IS REAL AS OF 2026-08-31, AND OFTEN NULL ────────────────────
 * `film_catalog.studios` is every production company TMDB credits, not one —
 * the array is not ranked and its first entry is a producer's shingle about
 * half the time. It is NOT backfilled: the 340 rows picked before that date
 * carry null and fill in when their film is next picked, so this row is
 * missing on most older films and that is the design rather than a bug. The
 * rule below is what makes that safe to ship.
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
        {/* "Studio" reads wrong over four names and "Studios" reads wrong
            over one, so the label follows the value. TMDB credits everyone,
            and this row does not pretend one of them is THE studio — see
            `allStudios` in lib/tmdb. */}
        <Fact
          label={
            film.studios !== null && film.studios.includes(",")
              ? "Studios"
              : "Studio"
          }
          value={film.studios}
        />
        <Fact label="Rated" value={film.certification} />
        <Fact label="Budget" value={money(film.budget)} numeral />
      </dl>
    </Card>
  );
}
