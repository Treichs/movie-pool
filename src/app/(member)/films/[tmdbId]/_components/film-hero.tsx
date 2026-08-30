import Image from "next/image";
import Link from "next/link";
import { FilmIcon } from "lucide-react";

import { Figure } from "@/components/figure";
import { AspectRatio } from "@/components/ui/aspect-ratio";
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
import { backdropUrl, posterUrl } from "@/lib/tmdb-urls";

/**
 * THE BACKDROP, THE POSTER AND THE RATINGS — board 2.2's masthead.
 *
 * ── THE SCRIM IS A TOKEN, NOT A THEME COLOUR ──────────────────────────────
 * `--scrim` is black in both modes on purpose: it darkens a PHOTOGRAPH so the
 * page's own ground can read against it, and a photograph does not invert when
 * the theme does. Using `--foreground` here would turn the gradient white in
 * dark mode and wash the backdrop out.
 *
 * ── ONLY THE POSTER OVERLAPS THE BACKDROP ─────────────────────────────────
 * The board draws the title 8px BELOW the backdrop and the poster riding up
 * into it. Giving the negative margin to the poster alone — rather than to the
 * row — is what keeps the heading on the paper ground, where it is ordinary
 * foreground text and needs no contrast exception.
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
  const backdrop = backdropUrl(film.backdrop_path);
  const poster = posterUrl(film.poster_path, "w500");

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
    <div className="flex flex-col">
      <div className="relative h-56 overflow-hidden bg-muted sm:h-75">
        {backdrop && (
          <Image
            src={backdrop}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-center"
          />
        )}
        <div
          aria-hidden
          className="absolute inset-0 bg-linear-to-t from-scrim via-scrim/35 to-scrim/10"
        />
      </div>

      <div className="mx-auto flex w-full max-w-measure-page gap-7 px-8">
        <div className="-mt-28 w-36 shrink-0 sm:w-50">
          <AspectRatio
            ratio={2 / 3}
            className="overflow-hidden rounded border bg-muted"
          >
            {poster ? (
              <Image
                src={poster}
                alt=""
                fill
                priority
                sizes="(min-width: 640px) 12.5rem, 9rem"
                className="object-cover object-center"
              />
            ) : (
              <div className="flex size-full items-center justify-center">
                <FilmIcon
                  className="size-8 text-muted-foreground"
                  aria-hidden
                />
              </div>
            )}
          </AspectRatio>
        </div>

        <div className="flex grow flex-wrap items-end justify-between gap-x-7 gap-y-4 pt-2">
          <div className="flex flex-col gap-2.5">
            {/* The trail sits HERE, not above the backdrop, because a
                full-bleed photograph would push it off the top of the page. */}
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
              value={
                film.rt_tomatometer === null ? null : `${film.rt_tomatometer}%`
              }
              lead
            />
            <Rating
              label="Metacritic"
              value={film.metascore === null ? null : String(film.metascore)}
            />
            <Rating
              label="IMDb"
              value={
                film.imdb_rating === null ? null : `${film.imdb_rating}/10`
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
