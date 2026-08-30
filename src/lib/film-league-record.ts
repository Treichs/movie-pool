import type { SupabaseClient } from "@/lib/supabase";
import {
  getFilmPage,
  getLeagueFilmRecord,
  type FilmDetailPage,
  type FilmPlaying,
} from "@/lib/film-page";

/**
 * `/leagues/[leagueId]/films/[tmdbId]` — this league's record of a film.
 * Board 2.3.
 *
 * ── SAME PRINCIPLE AS THE CATALOG PAGE, OPPOSITE EMPHASIS ────────────────
 * ADR-408 says a film page shows ONE scope. `/films/[tmdbId]` shows the
 * catalog and no play; this shows the play and demotes the catalog. What
 * changed at the 2026-08-28 IA pass is only the carrier: `?league=` became a
 * path segment, which makes the league view bookmarkable and lets the trail
 * name which league you are reading from.
 *
 * ── NULL IS A DESTINATION, NOT AN ERROR ──────────────────────────────────
 * A viewer who is not a member of `leagueId` gets nothing back — not because
 * this filters them out, but because RLS never showed them the rows. The page
 * turns that into a REDIRECT to the catalog view with a notice (ia-screen-map
 * §7.4). A 404 would claim the film does not exist, and it does; only this
 * league's play is out of reach. So this returns null and never throws for
 * that case, because the page has to be able to tell them apart.
 *
 * ── IT IMPORTS THE CATALOG READ RATHER THAN REPEATING IT ─────────────────
 * `getFilmPage` is the same function `getFilmCatalogPage` calls. Going
 * straight to it skips the league list that composer also fetches, which this
 * screen already has by other means.
 */

/** One playing, plus the season rule that decides how many bids won it. */
export type LeaguePlaying = FilmPlaying & {
  /** `season_settings.top_n_distinct` — how many DISTINCT amounts take the
   *  film. The board's heading says "three winning tiers" only when the season
   *  actually says three, because it is configurable per season. */
  topNDistinct: number;
};

export type FilmLeagueRecord = {
  league: { id: string; name: string };
  /** The catalog half, for the subordinate "About the film" section. */
  film: FilmDetailPage;
  /** Newest playing first. A film can run in more than one season of a
   *  league — a re-release, or a season that repeats a weekend — so this is a
   *  list even though the board draws one. */
  playings: LeaguePlaying[];
};

/** The default matches `season-settings.ts` and the rulebook. It applies only
 *  to a season with no settings row at all. */
const DEFAULT_TOP_N = 3;

export async function getFilmLeagueRecord(
  ctx: { supabase: SupabaseClient; user: { id: string } },
  leagueId: string,
  tmdbId: number
): Promise<FilmLeagueRecord | null> {
  const [record, film] = await Promise.all([
    getLeagueFilmRecord(ctx.supabase, tmdbId, leagueId, ctx.user.id),
    getFilmPage(ctx.supabase, tmdbId),
  ]);
  // No record OR no film means there is nothing this page can be. Both send
  // the reader to the catalog; the page decides which words go with that.
  if (!record || !film) return null;

  const seasonIds = [...new Set(record.playings.map((p) => p.seasonId))];
  const { data: settings } = await ctx.supabase
    .from("season_settings")
    .select("season_id, top_n_distinct")
    .in("season_id", seasonIds);
  const topN = new Map(
    (settings ?? []).map((s) => [s.season_id, s.top_n_distinct])
  );

  return {
    league: record.league,
    film,
    playings: record.playings.map((p) => ({
      ...p,
      topNDistinct: topN.get(p.seasonId) ?? DEFAULT_TOP_N,
    })),
  };
}
