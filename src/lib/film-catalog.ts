import type { SupabaseClient } from "@/lib/supabase";
import { getFilmPage, type FilmDetailPage } from "@/lib/film-page";
import { getNavLeagues } from "@/lib/nav";

/**
 * `/films/[tmdbId]` — the catalog view's read. Board 2.2.
 *
 * ── IT CARRIES THE FILM AND NEVER THE PLAY. ADR-408 ──────────────────────
 * No bids, no owners, no scores, no league at all. Those numbers are entered
 * BY HAND per league-season, so leagues legitimately hold different values for
 * the same film and there is no such thing as "the" box office for one — the
 * decision `film-page.ts` records at length. Anything league-scoped belongs on
 * `/leagues/[leagueId]/films/[tmdbId]`, which reads the same film through the
 * viewer's own session so RLS decides what it may show.
 *
 * A later task adding an owner or a score HERE is the mistake this composer's
 * name exists to prevent.
 *
 * ── THE GATE IS "SIGNED IN", AND THAT IS THE WHOLE RULE ──────────────────
 * The catalog is public to members: it holds nothing private, because
 * everything private is league-scoped and none of it is here. So the context
 * this takes is the gate — the page calls `requireUser` and hands it over —
 * and there is no per-row check to make afterwards.
 *
 * ── THE LEAGUE LIST IS `getNavLeagues`, NOT A FOURTH LEAGUES QUERY ───────
 * The screen offers "pick a league to see how this film played there", which
 * needs a name and an id. The shell's layout has already made this exact call
 * for its switcher and Next dedupes it within one render, so reusing it costs
 * nothing — the same reasoning `getHome` records for its three reads.
 */

export type CatalogLeague = { id: string; name: string };

export type FilmCatalogPage = {
  film: FilmDetailPage;
  /** The viewer's leagues, so the page can offer one to switch into. */
  leagues: CatalogLeague[];
};

/** Null only when TMDB has never heard of the id — the genuine 404. A film
 *  nobody in this pool has ever picked still renders, straight from TMDB. */
export async function getFilmCatalogPage(
  ctx: { supabase: SupabaseClient; user: { id: string } },
  tmdbId: number
): Promise<FilmCatalogPage | null> {
  const [film, leagues] = await Promise.all([
    getFilmPage(ctx.supabase, tmdbId),
    getNavLeagues(ctx.supabase, ctx.user.id),
  ]);
  if (!film) return null;

  return {
    film,
    leagues: leagues.map((l) => ({ id: l.id, name: l.name })),
  };
}
