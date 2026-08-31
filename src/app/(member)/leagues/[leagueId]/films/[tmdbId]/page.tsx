import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { getFilmLeagueRecord } from "@/lib/film-league-record";

import { AboutTheFilm } from "./_components/about-the-film";
import { LeagueFilmHero } from "./_components/league-film-hero";
import { PlayingRecord } from "./_components/playing-record";

export const metadata = { title: "Film" };

/**
 * `/leagues/[leagueId]/films/[tmdbId]` — this league's record of a film.
 * Board 2.3.
 *
 * ── A FOREIGN LEAGUE REDIRECTS, IT DOES NOT 404 (ia-screen-map §7.4) ─────
 * RLS is the gate: a viewer who does not belong to this league is shown no
 * rows, so `getFilmLeagueRecord` returns null. **The film still exists and
 * they may read it** — only this league's play is out of reach — so they land
 * on the catalog page with a notice saying exactly that. A 404 would claim the
 * film is not there, which is a different and untrue statement.
 *
 * That is why the composer returns null rather than throwing: the page has to
 * tell "you cannot see this" apart from "this broke".
 *
 * ── THE RECORD LEADS AND THE CATALOG FOLLOWS ─────────────────────────────
 * ADR-408 as layout. The order of the two sections below is the decision.
 */
export default async function LeagueFilmPage({
  params,
}: {
  params: Promise<{ leagueId: string; tmdbId: string }>;
}) {
  const { leagueId, tmdbId } = await params;

  // A TMDB id is an integer. "abc" is not a film that failed to load, it is
  // not an address — and it must not become a redirect loop through /films.
  const id = Number(tmdbId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const { supabase, user } = await requireUser();
  const record = await getFilmLeagueRecord({ supabase, user }, leagueId, id);
  if (!record) redirect(`/films/${id}?from=league`);

  const { league, film, playings } = record;

  return (
    <main id="main" tabIndex={-1} className="flex flex-col gap-6 pb-8">
      <LeagueFilmHero film={film} league={league} />

      <div className="mx-auto flex w-full max-w-measure-page flex-col gap-6 px-8">
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2>In {league.name}</h2>
            {/* The disclaimer belongs beside the heading, not in a footnote:
                it is the reason two leagues can hold different numbers for the
                same film, which is the single thing about this page a reader
                is most likely to mistake for a bug. */}
            <span className="type-body text-micro text-muted-foreground">
              Box office and Tomatometer entered by the commissioner —
              league-local by design.
            </span>
          </div>

          {playings.map((p) => (
            <PlayingRecord key={p.filmId} playing={p} viewerId={user.id} />
          ))}
        </section>

        <AboutTheFilm film={film} tmdbId={id} />
      </div>
    </main>
  );
}
