import Link from "next/link";

import { FilmMasthead } from "@/components/film-masthead";
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
 * THE LEAGUE MASTHEAD — board 2.3, at `FilmMasthead`'s compact size.
 *
 * ── THE TRAIL NAMES THE LEAGUE, AND THAT IS WHAT THE PATH SEGMENT BOUGHT ─
 * Under `?league=` the address said nothing about which league you were
 * reading from, so neither could the trail. Now it does, and this is the one
 * visible difference between the two film pages above the fold.
 *
 * ── NO RATINGS STACK HERE ────────────────────────────────────────────────
 * The catalog page leads with the Tomatometer; this page leads with the score
 * the league recorded, which is a DIFFERENT number wearing the same name — the
 * commissioner enters their own. Putting a canonical rating in the masthead
 * over a captured one in the panel below would invite exactly that confusion,
 * so the ratings stay down in "About the film" where the board puts them.
 */
export function LeagueFilmHero({
  film,
  league,
}: {
  film: FilmDetailPage;
  league: { id: string; name: string };
}) {
  const releaseType = film.release_date_us_wide
    ? "Wide"
    : film.release_date_us_limited
      ? "Limited"
      : null;

  const meta = [
    film.release_year === null ? null : String(film.release_year),
    releaseType,
  ]
    .filter((v): v is string => v !== null)
    .join(" · ");

  return (
    <FilmMasthead
      size="compact"
      backdropPath={film.backdrop_path}
      posterPath={film.poster_path}
    >
      <div className="flex flex-col gap-2">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href="/leagues" />}>
                Your leagues
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href={`/leagues/${league.id}`} />}>
                {league.name}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{film.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <h1>{film.title}</h1>

        {meta && <span className="text-ui text-muted-foreground">{meta}</span>}
      </div>
    </FilmMasthead>
  );
}
