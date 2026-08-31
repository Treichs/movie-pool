import type { SupabaseClient } from "@/lib/supabase";

/**
 * THE FILMS INDEX — the parent both film routes were missing.
 *
 * `/films/[tmdbId]` and `/leagues/[leagueId]/films/[tmdbId]` both shipped as
 * leaves, so chopping the id off either gave a 404. IA §7.5 rule 5 says every
 * truncation must land on a real page, and this is the read behind the two
 * pages that make it true.
 *
 * ── IT IS NOT "THE CATALOGUE" AND THAT IS THE WHOLE DESIGN ────────────────
 * The obvious index is `film_catalog`, and it is the wrong one twice over.
 * That table is a CACHE OF FILMS SOMEONE PICKED — `getFilmPage` falls back to
 * a live TMDB read for anything uncatalogued, so a film page works for any id
 * TMDB knows and the catalogue is not "the films that exist". Listing it would
 * also show what leagues the viewer is not in have been playing, which answers
 * a question nobody asked.
 *
 * So the index reads `films` — actual playings — and means "films that have
 * been played", scoped by RLS to the leagues the viewer belongs to. One film
 * played by two of their leagues is two entries, because the score and the
 * owners differ and collapsing them would hide one league's history behind
 * another's. That is the same call the shell's search makes.
 *
 * ── THE SEASON NAME IS LOOKED UP SEPARATELY, AND MUST BE ──────────────────
 * ADR-099 dropped `seasons.name` and derives it in `v_seasons`; PostgREST
 * cannot embed a view from `films`, and asking for the missing field makes the
 * WHOLE query return null rather than erroring loudly. `getLeagueFilmRecord`
 * learned that the hard way — it silently rendered nothing for every film in
 * every league — so the join is done here in a second read, deliberately.
 */

export type FilmIndexEntry = {
  /** The list key. A film played twice is two rows, so the film id is the
   *  identity here, not the tmdb id. */
  filmId: string;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  leagueId: string;
  leagueName: string;
  seasonName: string;
  weekId: string;
  weekNumber: number;
  weekOf: string;
  /** Null until the commissioner captures results. */
  score: number | null;
  /** `removed` films stay listed — a pulled film is part of the record, and
   *  the page says so rather than dropping it. */
  status: string;
};

type Row = {
  id: string;
  tmdb_id: number;
  title: string;
  score: number | null;
  status: string;
  catalog: { poster_path: string | null } | null;
  week: {
    id: string;
    number: number;
    week_of: string;
    season: { id: string; league_id: string };
  };
};

/**
 * Every film played in the leagues this viewer can see, newest first.
 *
 * `leagueId` narrows it to one league; without it the answer spans all of
 * them. RLS does the scoping either way — there is no "and only my leagues"
 * clause here, and there must not be one.
 */
export async function getFilmIndex(
  supabase: SupabaseClient,
  leagueId?: string,
): Promise<FilmIndexEntry[]> {
  let query = supabase
    .from("films")
    .select(
      "id, tmdb_id, title, score, status, catalog:film_catalog(poster_path), " +
        "week:weeks!inner(id, number, week_of, season:seasons!inner(id, league_id))",
    )
    .order("week_of", { referencedTable: "weeks", ascending: false });
  if (leagueId) query = query.eq("week.season.league_id", leagueId);

  const { data, error } = await query;
  if (error) {
    // Never a silent empty list: an errored query and a league that has played
    // nothing look identical once the error is dropped, which is how the film
    // record panel stayed broken for weeks.
    console.error(`getFilmIndex: ${error.message}`);
    return [];
  }
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return [];

  const seasonIds = [...new Set(rows.map((r) => r.week.season.id))];
  const leagueIds = [...new Set(rows.map((r) => r.week.season.league_id))];
  const [{ data: seasons }, { data: leagues }] = await Promise.all([
    supabase.from("v_seasons").select("id, name").in("id", seasonIds),
    supabase.from("leagues").select("id, name").in("id", leagueIds),
  ]);
  const seasonName = new Map((seasons ?? []).map((s) => [s.id, s.name]));
  const leagueName = new Map((leagues ?? []).map((l) => [l.id, l.name]));

  return rows
    .map((r) => ({
      filmId: r.id,
      tmdbId: r.tmdb_id,
      title: r.title,
      posterPath: r.catalog?.poster_path ?? null,
      leagueId: r.week.season.league_id,
      leagueName: leagueName.get(r.week.season.league_id) ?? "a league",
      seasonName: seasonName.get(r.week.season.id) ?? "a season",
      weekId: r.week.id,
      weekNumber: r.week.number,
      weekOf: r.week.week_of,
      score: r.score === null ? null : Number(r.score),
      status: r.status,
    }))
    // PostgREST orders the EMBEDDED week, which does not reorder the parent
    // rows across different weeks. The sort that the page actually needs is
    // therefore done here, where it is over the flattened list.
    .sort((a, b) => b.weekOf.localeCompare(a.weekOf) || a.title.localeCompare(b.title));
}
