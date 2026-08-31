// The /films/[tmdbId] data loader.
//
// ONE SCOPE: THE LEAGUE'S OWN RECORD (2026-08-15, supersedes the ADR-047
// two-panel split; ADR-407 is the sibling decision retiring /releases).
//
// The old pool-wide panel averaged box office and Tomatometer ACROSS leagues,
// on the premise that those numbers describe the film and are therefore the
// same everywhere. They are not: commissioners enter both BY HAND per
// league-season, so leagues legitimately hold different values for the same
// film, and a cross-league average is a number no league recognises as its
// own. What replaced it:
//
//   NO LEAGUE CONTEXT — the page is pure catalog: TMDB/OMDb facts, nothing
//                       derived from any league's play.
//
//   ?league=<id>      — THAT league's record of the film, queried through the
//                       CALLER'S OWN session so RLS scopes it: a non-member
//                       passing a foreign id simply gets the catalog view.
//                       ADR-022's bid-visibility boundary is untouched — own
//                       bids always, others' winning bids only after close.

import type { SupabaseClient } from "@/lib/supabase";
import type { FilmCatalog } from "@/lib/commish";
import { fetchMovieDetail, tmdbConfigured } from "@/lib/tmdb";

export type FilmCredit = {
  billing: number;
  name: string;
  character_name: string | null;
  profile_path: string | null;
};

/** Everything film_catalog holds, plus its children. */
export type FilmDetailPage = {
  tmdb_id: number;
  imdb_id: string | null;
  title: string;
  original_title: string | null;
  release_year: number | null;
  release_date_us_wide: string | null;
  release_date_us_limited: string | null;
  release_date_digital: string | null;
  budget: number | null;
  revenue_worldwide: number | null;
  collection_id: number | null;
  collection_name: string | null;
  original_language: string | null;
  director: string | null;
  composer: string | null;
  cinematographer: string | null;
  /** Every production company TMDB credits, comma-separated. Null on every
   *  row picked before 2026-08-31 — it fills in lazily. */
  studios: string | null;
  imdb_rating: number | null;
  imdb_votes: number | null;
  metascore: number | null;
  rt_tomatometer: number | null;
  tmdb_vote_average: number | null;
  tmdb_vote_count: number | null;
  awards_text: string | null;
  genres: string[];
  cast: FilmCredit[];
} & FilmCatalog;

/** One appearance of the film in the context league — a season's week. */
export type FilmPlaying = {
  filmId: string;
  seasonId: string;
  seasonName: string;
  weekId: string;
  weekNumber: number;
  weekOf: string;
  weekStatus: string;
  /** The league's own captured values — commissioner-entered, not canonical. */
  boxOfficeM: number | null;
  tomatometer: number | null;
  score: number | null;
  filmStatus: string;
  removedReason: string | null;
  /** Winning bids, i.e. the owners. Visible only after the week closes. */
  owners: { profileId: string; name: string; amount: number }[];
  /** The viewer's own bid on this playing, if any (RLS: always visible). */
  myBid: number | null;
  myWinning: boolean | null;
  /** When the commissioner entered the box office and Tomatometer. Null until
   *  they have — which is also when `score` is null. */
  capturedAt: string | null;
  /** How many players bid and did NOT win a tier. Zero while the week is open,
   *  because losing bids are sealed until it closes (ADR-022) — the board's
   *  "six other players bid and missed" line, and a count is all it may say. */
  otherBidders: number;
  /** The cheapest bid that still won — what "missed the tiers" means in money.
   *  Null before close, and null when nobody owned it. */
  lowestWinningBid: number | null;
};

/** The context league's record of a film, or null when RLS shows nothing. */
export type LeagueFilmRecord = {
  league: { id: string; name: string };
  playings: FilmPlaying[];
};

export async function getFilmPage(
  supabase: SupabaseClient,
  tmdbId: number,
): Promise<FilmDetailPage | null> {
  const { data } = await supabase
    .from("film_catalog")
    .select(
      "*, genres:film_genres(name), cast:film_cast(billing, name, character_name, profile_path)",
    )
    .eq("tmdb_id", tmdbId)
    .maybeSingle();
  // BUG FIX 2026-08-03: this used to `return null` here, and the page turned
  // that into a 404. But film_catalog only holds films someone has PICKED,
  // while the commissioner's picker (and, before ADR-407, /releases) links
  // EVERY discover result to this page — so most of those links 404'd. The
  // catalogue is a cache of picked films, not the set of films that exist.
  //
  // Falling back to TMDB read-only: no upsert, because writing here would let
  // page views populate the catalogue with films nobody picked, and the
  // catalogue's meaning ("films this pool has played") is load-bearing for
  // getPoolStats. An uncatalogued film simply renders from the live API with
  // no pool history, which is the truth about it.
  if (!data) return getFilmPageFromTmdb(tmdbId);

  const row = data as unknown as Omit<FilmDetailPage, "genres" | "cast"> & {
    genres: { name: string }[];
    cast: FilmCredit[];
  };
  return {
    ...row,
    genres: (row.genres ?? []).map((g) => g.name),
    cast: [...(row.cast ?? [])].sort((a, b) => a.billing - b.billing),
  };
}

/** TMDB-only view of a film with no catalogue row. Same shape, OMDb-sourced
 *  fields null — those are written at pick time and this film was never
 *  picked. Returns null when TMDB is unconfigured or does not know the id,
 *  which is the genuine 404. */
async function getFilmPageFromTmdb(tmdbId: number): Promise<FilmDetailPage | null> {
  if (!tmdbConfigured()) return null;
  const res = await fetchMovieDetail(tmdbId, fetch, "cached");
  if (!res.ok) return null;
  const c = res.data;

  const wide = c.release_date_us_wide ?? c.release_date_tmdb_raw;
  return {
    tmdb_id: c.tmdb_id,
    imdb_id: c.imdb_id,
    title: c.title,
    original_title: c.original_title,
    release_year: wide ? Number(wide.slice(0, 4)) : null,
    release_date_us_wide: c.release_date_us_wide,
    release_date_us_limited: c.release_date_us_limited,
    release_date_digital: c.release_date_digital,
    budget: c.budget,
    revenue_worldwide: c.revenue_worldwide,
    collection_id: c.collection_id,
    collection_name: c.collection_name,
    original_language: c.original_language,
    director: c.director,
    composer: c.composer,
    cinematographer: c.cinematographer,
    studios: c.studios,
    // OMDb fields are captured at pick time; an unpicked film has none.
    imdb_rating: null,
    imdb_votes: null,
    metascore: null,
    rt_tomatometer: null,
    tmdb_vote_average: c.tmdb_vote_average,
    tmdb_vote_count: c.tmdb_vote_count,
    awards_text: null,
    genres: c.genres.map((g) => g.name),
    cast: c.cast
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((m) => ({
        billing: m.order,
        name: m.name,
        character_name: m.character,
        profile_path: m.profile_path,
      })),
    poster_path: c.poster_path,
    backdrop_path: c.backdrop_path,
    overview: c.overview,
    tagline: c.tagline,
    certification: c.certification,
    runtime_min: c.runtime_min,
    trailer_youtube_key: c.trailer_youtube_key,
  };
}

/**
 * The context league's record of this film, through the caller's own session.
 *
 * Every scope below is RLS's, not a filter we wrote: a viewer who is not a
 * member of `leagueId` gets no seasons back and the whole function returns
 * null, which the page renders as the plain catalog view. Others' bids appear
 * only once a week has closed (`is_winning` is set at close and the bid
 * policy reveals then — ADR-022); the viewer's own bid is always theirs to
 * see, so a sealed week still shows "your bid" and nobody else's.
 */
export async function getLeagueFilmRecord(
  supabase: SupabaseClient,
  tmdbId: number,
  leagueId: string,
  userId: string,
): Promise<LeagueFilmRecord | null> {
  const { data: league } = await supabase
    .from("leagues")
    .select("id, name")
    .eq("id", leagueId)
    .maybeSingle();
  if (!league) return null;

  const { data: films } = await supabase
    .from("films")
    .select(
      "id, box_office_m, tomatometer, score, status, removed_reason, captured_at, " +
        // NO `name` ON THE EMBEDDED SEASON. ADR-099 dropped `seasons.name` and
        // derives it in `v_seasons`; PostgREST rejects the unknown field, and
        // because the error below is not destructured the whole query returned
        // null — so this panel silently rendered nothing for every film in
        // every league, which reads as "we have no record of this" rather than
        // as a bug. A PostgREST embed cannot target a view from `films`, so the
        // names are looked up separately, below.
        "week:weeks!inner(id, number, week_of, status, " +
        "season:seasons!inner(id, league_id))",
    )
    .eq("tmdb_id", tmdbId)
    .eq("week.season.league_id", leagueId);
  if (!films || films.length === 0) return null;

  // The derived names for exactly the seasons this film played in.
  const seasonIds = [
    ...new Set(
      (films as unknown as { week: { season: { id: string } } }[]).map(
        (f) => f.week.season.id
      )
    ),
  ];
  const { data: named } = await supabase
    .from("v_seasons")
    .select("id, name")
    .in("id", seasonIds);
  const seasonNames = new Map(
    (named ?? []).map((s) => [s.id as string, s.name as string])
  );

  type FilmRow = {
    id: string;
    box_office_m: number | null;
    tomatometer: number | null;
    score: number | null;
    status: string;
    removed_reason: string | null;
    captured_at: string | null;
    week: {
      id: string;
      number: number;
      week_of: string;
      status: string;
      season: { id: string; league_id: string };
    };
  };
  const rows = films as unknown as FilmRow[];

  const { data: bids } = await supabase
    .from("bids")
    .select(
      "film_id, amount, is_winning, " +
        "member:season_members(profile_id, profile:profiles(display_name))",
    )
    .in(
      "film_id",
      rows.map((f) => f.id),
    );
  type BidRow = {
    film_id: string;
    amount: number;
    is_winning: boolean | null;
    member: { profile_id: string; profile: { display_name: string } | null } | null;
  };
  const bidRows = (bids ?? []) as unknown as BidRow[];

  const playings: FilmPlaying[] = rows
    .map((f) => {
      const filmBids = bidRows.filter((b) => b.film_id === f.id);
      const mineRow = filmBids.find((b) => b.member?.profile_id === userId);
      // `is_winning` is only SET at close, so before then every row here is the
      // viewer's own and both of these read as "nothing to say yet" rather than
      // as "nobody bid" — which is the sealed-bid rule, not a missing number.
      const winners = filmBids.filter((b) => b.is_winning);
      return {
        filmId: f.id,
        seasonId: f.week.season.id,
        // Derived (ADR-099). Falls back to the numberless label the view
        // itself uses when a season has no weeks yet to rank it by.
        seasonName: seasonNames.get(f.week.season.id) ?? "New season",
        weekId: f.week.id,
        weekNumber: f.week.number,
        weekOf: f.week.week_of,
        weekStatus: f.week.status,
        boxOfficeM: f.box_office_m,
        tomatometer: f.tomatometer,
        score: f.score,
        filmStatus: f.status,
        removedReason: f.removed_reason,
        capturedAt: f.captured_at,
        otherBidders: filmBids.length - winners.length,
        lowestWinningBid: winners.length
          ? Math.min(...winners.map((b) => b.amount))
          : null,
        owners: winners
          .filter((b) => b.member)
          .map((b) => ({
            profileId: b.member!.profile_id,
            name: b.member!.profile?.display_name ?? "Unknown",
            amount: b.amount,
          }))
          .sort((a, b) => b.amount - a.amount),
        myBid: mineRow?.amount ?? null,
        myWinning: mineRow?.is_winning ?? null,
      };
    })
    .sort((a, b) => (a.weekOf < b.weekOf ? 1 : -1)); // newest playing first

  return { league: { id: league.id as string, name: league.name as string }, playings };
}
