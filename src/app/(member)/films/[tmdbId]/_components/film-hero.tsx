import Link from "next/link";

import { Figure } from "@/components/figure";
import { FilmMasthead } from "@/components/film-masthead";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import type { FilmDetailPage } from "@/lib/film-page";

/**
 * THE CATALOG MASTHEAD — board 2.2. The artwork is `FilmMasthead`; this is the
 * column beside it.
 *
 * ── TOMATOMETER LEADS BECAUSE IT IS HALF THE SCORING FORMULA ─────────────
 * `opening box office ($M) x (Tomatometer / 100)`. It takes `Figure`'s `lg`
 * size — the one the type scale reserves for a number that IS the explanation
 * — and Metacritic and IMDb take the default. A third size for this one
 * caller is the prop the `Figure` docblock warns against.
 */

function Rating({
  label,
  value,
  lead,
}: {
  label: string;
  value: string | null;
  lead?: boolean;
}) {
  if (value === null) return null;
  return (
    <Figure
      label={label}
      value={value}
      size={lead ? "lg" : "default"}
      className="items-end"
    />
  );
}

export function FilmHero({ film }: { film: FilmDetailPage }) {
  const runtime =
    film.runtime_min === null
      ? null
      : `${Math.floor(film.runtime_min / 60)}h ${film.runtime_min % 60}m`;

  // No certification here: the board puts "Rated" in the facts panel, and one
  // fact in two places is the drift the panel exists to prevent.
  const meta = [
    film.release_year === null ? null : String(film.release_year),
    runtime,
  ].filter((v): v is string => v !== null);

  return (
    <FilmMasthead
      backdropPath={film.backdrop_path}
      posterPath={film.poster_path}
    >
      <div className="flex flex-col gap-2.5">
        {/* The trail sits HERE, not above the backdrop, because a full-bleed
            photograph would push it off the top of the page. */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href="/leagues" />}>
                Your leagues
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{film.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <h1>{film.title}</h1>

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
          {meta.map((m) => (
            <span key={m} className="text-ui text-muted-foreground">
              {m}
            </span>
          ))}
          {film.genres.map((g) => (
            <Badge key={g} variant="outline">
              {g}
            </Badge>
          ))}
        </div>
      </div>

      <div className="flex items-end gap-7 pb-1">
        <Rating
          label="Tomatometer®"
          value={film.rt_tomatometer === null ? null : `${film.rt_tomatometer}%`}
          lead
        />
        <Rating
          label="Metacritic"
          value={film.metascore === null ? null : String(film.metascore)}
        />
        <Rating
          label="IMDb"
          value={film.imdb_rating === null ? null : `${film.imdb_rating}/10`}
        />
      </div>
    </FilmMasthead>
  );
}
