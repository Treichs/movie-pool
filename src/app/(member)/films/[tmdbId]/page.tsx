import { notFound } from "next/navigation";

import { AspectRatio } from "@/components/ui/aspect-ratio";
import { requireUser } from "@/lib/auth";
import { getFilmCatalogPage } from "@/lib/film-catalog";
import { TMDB_ATTRIBUTION, trailerEmbedUrl } from "@/lib/tmdb-urls";

import { CatalogNotice } from "./_components/catalog-notice";
import { FilmCast } from "./_components/film-cast";
import { FilmFacts } from "./_components/film-facts";
import { FilmHero } from "./_components/film-hero";
import { ForeignLeagueNotice } from "./_components/foreign-league-notice";

export const metadata = { title: "Film" };

/**
 * `/films/[tmdbId]` — the catalog view. Board 2.2.
 *
 * ── IT IS NOT LEAGUE-SCOPED, AND THAT IS THE POINT (ADR-408) ─────────────
 * One address for a film, the same for everyone who can sign in. Bids, owners
 * and scores live at `/leagues/[leagueId]/films/[tmdbId]`, because they are
 * entered by hand per league-season and no two leagues need agree.
 *
 * ── BUILT BEFORE THE WEEK BOARD, ON PURPOSE ──────────────────────────────
 * The bid page's `PosterCard` has an `href` that has nowhere to point until
 * this route exists. Building the two film routes first sets it once, in the
 * task that needs it.
 *
 * ── A FILM NOBODY PICKED STILL RENDERS ───────────────────────────────────
 * `film_catalog` caches films this pool has PLAYED, not films that exist, so
 * `getFilmPage` falls back to TMDB read-only. Such a film shows its TMDB half
 * and no OMDb ratings, which is the truth about it. `notFound()` means TMDB
 * has never heard of the id.
 */
export default async function FilmPage({
  params,
  searchParams,
}: {
  params: Promise<{ tmdbId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const [{ tmdbId }, { from }] = await Promise.all([params, searchParams]);

  // The segment is `[tmdbId]`, so anything can arrive in it. A TMDB id is an
  // integer; "abc" is not a film that failed to load, it is not an address.
  const id = Number(tmdbId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const { supabase, user } = await requireUser();
  const page = await getFilmCatalogPage({ supabase, user }, id);
  if (!page) notFound();

  const { film, leagues } = page;
  const trailer = trailerEmbedUrl(film.trailer_youtube_key);

  return (
    <main id="main" tabIndex={-1} className="flex flex-col gap-6 pb-8">
      <FilmHero film={film} />

      <div className="mx-auto flex w-full max-w-measure-page flex-col gap-6 px-8">
        {from === "league" && <ForeignLeagueNotice />}

        {film.overview && (
          <p className="type-body max-w-measure-default text-ui">
            {film.overview}
          </p>
        )}

        <CatalogNotice leagues={leagues} tmdbId={film.tmdb_id} />

        <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="flex flex-col gap-6">
            {trailer && (
              <section className="flex flex-col gap-2.5">
                <h2>Trailer</h2>
                <AspectRatio
                  ratio={16 / 9}
                  className="overflow-hidden rounded bg-scrim"
                >
                  {/* nocookie, from `trailerEmbedUrl`: no third-party cookie is
                      set unless the viewer actually presses play. */}
                  <iframe
                    src={trailer}
                    title={`${film.title} trailer`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="size-full"
                  />
                </AspectRatio>
              </section>
            )}

            <FilmCast cast={film.cast} />
          </div>

          <div className="flex flex-col gap-4">
            <FilmFacts film={film} />

            {/* A LICENCE OBLIGATION, NOT A COURTESY. TMDB's terms require the
                attribution wherever their data appears, and OMDb's require the
                source to be named. */}
            <p className="type-body text-micro px-1 text-muted-foreground">
              Metadata and artwork from TMDB. Tomatometer&reg; and Metacritic
              scores from OMDb. {TMDB_ATTRIBUTION}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
