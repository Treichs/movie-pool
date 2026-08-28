import "server-only";

import type { Enums } from "@/lib/supabase";

import type { SeasonContext } from "./auth";

/**
 * THE BID BOARD — one release week, composed for the screen where the game is
 * actually played.
 *
 * The signature is the point of this file: `(ctx: SeasonContext, weekId)`, never
 * `(supabase, weekId, seasonId, seasonMemberId)`. Three of those four arguments
 * were the caller re-stating what its own gate had already established, and any
 * page that skipped the gate could still supply them. Taking the context makes
 * the gate structural — this function CANNOT be called by a page that did not
 * run one, because there is no other way to obtain a `SeasonContext`.
 *
 * WHY THIS IS NOT `getWeekBoard` MOVED. Task 17's brief asked for
 * `src/lib/week-board.ts` to be ported here wholesale and deleted, lowering the
 * legacy count. That is not reachable from this layer: `getWeekBoard` composes
 * through `@/lib/commish`, `@/lib/film-detail` and `@/lib/pool`, and the
 * boundaries policy allows `orchestration` to reach only
 * `orchestration | domain | infra-schema | infra-clients`. Legacy is not on that
 * list, in either direction and for type imports too — `default: "disallow"`
 * means an unlisted pair is refused outright. Porting the body therefore means
 * moving `commish.ts` (26 importers), `pool.ts` (10) and `film-detail.ts` (8,
 * five of them registry components that may import domain as TYPES only) as
 * well — roughly 940 lines and a re-filing decision per module. That is phase 4
 * (`fl-domain` / `fl-substrate-split`), not the task that establishes the shape.
 *
 * So this is a NEW composer for a NEW type, reading the tables directly, which
 * is what `orchestration` is permitted to do. `getWeekBoard` stays where it is
 * and keeps serving the closed-week board at
 * `/season/[seasonId]/weeks/[weekId]`, which needs the revealed bids, the
 * override log and the roster count that a bidding screen has no use for.
 *
 * The queries below are ported faithfully from `getWeekBoard`, so the two agree
 * on the facts they share. `npm run spike:phase5` is what proves the RPC
 * contract, since nothing else compares them.
 */

/** One film on a biddable slate. Deliberately narrower than `BoardFilm`: a
 *  bidding screen needs a title, a poster, what the player needs in order to
 *  DECIDE, and the amount already committed — not the settled score or the
 *  reveal table, neither of which exists while a week is biddable.
 *
 *  THE CATALOG BLOCK BELOW IS TASK 18's ADDITION, and it is here rather than in
 *  the page for a reason worth stating once. Task 17 left a note that
 *  `WeekBidBoard` carries no `FilmDetail` — a `src/lib` type this layer may not
 *  name — and that a bid screen wanting the film slide-out would have to
 *  assemble that data itself. Assembling it in the route means the route reads
 *  from `legacy`, which is the exact habit the whole rebuild is removing, and it
 *  would be the template twenty-five more screens copied. So the composer grew
 *  the facts the drawer needs, all from tables this layer is already permitted
 *  to read, and the ROUTE keeps one small adapter that maps them onto the shared
 *  drawer's legacy-typed prop. When `film-detail.ts` leaves `src/lib` in Phase 4,
 *  the adapter is what disappears — not this.
 *
 *  TWO OF THEM ARE NOT RENDERED TODAY, and saying so is cheaper than a comment
 *  that overstates. `FilmDrawer` reads `certification`, `runtimeMin`,
 *  `posterPath`, `tmdbId` and `tomatometer`; it renders NEITHER `overview` nor
 *  `trailerKey` — checked, not assumed (`grep -n "overview\|trailerKey"
 *  film-drawer.tsx` finds nothing). They are carried anyway because `FilmDetail`
 *  declares both as required, so the adapter has to produce a value either way,
 *  and the choice is between the real one and a fabricated `null`. They ride the
 *  same `film_catalog` embed as the fields that ARE read, so the real value
 *  costs nothing — no extra query, no extra round trip. */
export type BidBoardFilm = {
  id: string;
  title: string;
  /** ADR-042: the film's own US wide-release date. Null for a manual film. */
  releaseDate: string | null;
  /** A film the commissioner has flagged as not matching the slate rules. It
   *  stays on the board and refuses bids rather than vanishing. */
  eligible: boolean;
  /** What I have already committed on this film, null if I have not saved yet.
   *  ADR-109: a saved $0 IS a decision, so 0 and null are different facts. */
  myBid: number | null;

  // ---- what the player reads before deciding. All null for a manual film ----
  /** Set only for catalog films — the key to `/films/[tmdbId]`. */
  tmdbId: number | null;
  /** TMDB poster path, null for a manually-added film with no catalog row. */
  posterPath: string | null;
  overview: string | null;
  certification: string | null;
  runtimeMin: number | null;
  trailerKey: string | null;
  /**
   * ADR-062. The commissioner's captured value if there is one, otherwise the
   * `film_ratings` cache. A film that has not opened usually has NEITHER, and
   * null is the honest answer — never a zero, which on a Tomatometer reads as
   * "critics hated it" rather than "nobody has reviewed it".
   */
  tomatometer: number | null;
};

export type WeekBidBoard = {
  /**
   * WHERE THIS WEEK SITS, for the trail at the top of the screen.
   *
   * The season's name is DERIVED (ADR-099 — rank by earliest week), so it is
   * read from `v_seasons` and never from `seasons`, which has no such column.
   * The league may be null only if the embed returns nothing; a season always
   * belongs to one.
   */
  season: { id: string; name: string };
  league: { id: string; name: string } | null;
  week: {
    id: string;
    seasonId: string;
    number: number;
    /** The Monday of this week's Mon-Sun range — generated, never written
     *  (ADR-042). This, not `openingDate`, is what players are shown. */
    weekOf: string | null;
    openingDate: string;
    bidDeadline: string | null;
    /**
     * ADR-070's state machine, TAKEN FROM THE GENERATED ENUM rather than
     * retyped. `src/lib/commish.ts` hand-writes the same union minus `locked`,
     * a dead label Postgres cannot drop from the type and that nothing writes
     * or holds — and hand-writing an external name is the exact thing ADR-416's
     * data gate forbids. Carrying one unreachable member is the cheaper error:
     * it costs an arm in a `switch` that can never be taken, whereas the
     * hand-written version silently stops matching the day a label is added.
     */
    status: Enums<"week_status">;
  };
  /**
   * A bid placed NOW would actually be accepted.
   *
   * Not the same as `status === "open"`, and the difference is load-bearing: a
   * week past its deadline still reads `open` for up to a minute while the
   * pg_cron close catches up, and `place_bids` refuses through that window. Every
   * bidding control keys off this. The clock check is the law, the cron is the
   * janitor, and this stays even at a one-minute tick so a dead scheduler fails
   * SAFE rather than accepting bids the database will reject.
   */
  biddable: boolean;
  /** The deadline has passed but the automated close has not run yet. */
  deadlinePassed: boolean;
  /** The week exists but bidding has not opened — the commissioner is still
   *  building the slate. Readable, never biddable. */
  pending: boolean;
  bankroll: number | null;
  minBid: number;
  /**
   * How many distinct amounts win a film, from the SEASON's settings — 3 by
   * default, never hard-coded. The rulebook marked this [Configurable] on
   * 2026-08-12 precisely because a drawer had written "three" into prose while
   * three other surfaces resolved it per season, and this is the screen where
   * that number decides what a player types.
   */
  topNDistinct: number;
  /** Season budget left. `member_remaining_budget` deducts only WINNING bids, so
   *  this week's pending bids were never taken out of it — do not add `exposure`
   *  back, or the screen offers money the player does not have. */
  remaining: number;
  /** What my saved bids on this week's ACTIVE films already commit (ADR-001
   *  sum-exposure). Removed films are excluded: their bids are refunded, so
   *  counting them understates what is left to spend. */
  exposure: number;
  slate: BidBoardFilm[];
};

/** Null when the week does not exist, or belongs to another season — a URL
 *  someone typed. The caller turns that into a 404. */
export async function getWeekBidBoard(
  ctx: SeasonContext,
  weekId: string
): Promise<WeekBidBoard | null> {
  const { db, seasonId, memberId } = ctx;

  // NO CASTS BELOW, AND THAT IS NEW. `src/lib/commish.ts`'s getFilms goes
  // through `as unknown as Film[]` for its catalog embed, and its comment
  // explains why: "postgrest-js infers an embed's cardinality from generated
  // database types, which this repo does not have, so it assumes the many side
  // and types `catalog` as an ARRAY". That has not been true since Task 5 —
  // the repo does have them, at src/infrastructure/schema/database.types.ts.
  // Verified rather than assumed: forcing `f.catalog?.poster_path` into a
  // `number` reports `Type 'string | 0' is not assignable`, so the embed
  // resolves to a single nullable object through the films.tmdb_id foreign key,
  // exactly as the runtime value has always been. Every row shape here is the
  // generated one.

  const [
    weekResult,
    filmsResult,
    settingsResult,
    remainingResult,
    seasonResult,
    leagueResult,
  ] = await Promise.all([
    db
      .from("weeks")
      .select("id, season_id, number, opening_date, week_of, bid_deadline, status")
      .eq("id", weekId)
      .maybeSingle(),
    db
      .from("films")
      // ONE STRING LITERAL, NOT A CONCATENATION. postgrest-js parses this
      // select at the TYPE level to shape the row; `"a, b" + "c"` is a
      // `string` to the compiler and every column came back as
      // `GenericStringError`. Verified — splitting the line for width cost the
      // whole file its types.
      .select(
        "id, title, release_date, eligible, status, tmdb_id, imdb_id, tomatometer, catalog:film_catalog(poster_path, overview, certification, runtime_min, trailer_youtube_key)"
      )
      .eq("week_id", weekId)
      .order("created_at", { ascending: true }),
    db.rpc("settings_for_season", { p_season_id: seasonId }),
    db.rpc("member_remaining_budget", { p_season_member_id: memberId }),
    // v_seasons, NOT seasons. ADR-099 made the name a derivation (rank by
    // earliest week) that lives in the view and nowhere else; `seasons` has no
    // `name` column to read.
    db.from("v_seasons").select("id, name").eq("id", seasonId).maybeSingle(),
    // The league comes off the BASE table: the embed is resolved through
    // seasons.league_id, and asking the view for it would depend on PostgREST
    // inferring an FK the view does not declare.
    db.from("seasons").select("league:leagues(id, name)").eq("id", seasonId).maybeSingle(),
  ]);

  const week = weekResult.data;
  if (!week || week.season_id !== seasonId) return null;

  const films = filmsResult.data ?? [];
  const settings = settingsResult.data;

  // The caller's own bids on this week's films. The explicit member filter is
  // for clarity — while a week is open, RLS already returns nothing else.
  const filmIds = films.map((f) => f.id);
  const { data: bidRows } = filmIds.length
    ? await db
        .from("bids")
        .select("film_id, amount")
        .in("film_id", filmIds)
        .eq("season_member_id", memberId)
    : { data: [] };
  const bidByFilm = new Map((bidRows ?? []).map((b) => [b.film_id, b.amount]));

  // ADR-062's live-rating cache, keyed by imdb_id. Only consulted where the
  // commissioner has captured nothing yet, which on a biddable week is every
  // film — nothing is captured until after the weekend. Skipped entirely when
  // no film on the slate has an imdb_id, so a manual-only slate costs no query.
  const imdbIds = films.map((f) => f.imdb_id).filter((id): id is string => id !== null);
  const { data: ratingRows } = imdbIds.length
    ? await db.from("film_ratings").select("imdb_id, tomatometer").in("imdb_id", imdbIds)
    : { data: [] };
  const liveRating = new Map(
    (ratingRows ?? []).map((r) => [r.imdb_id, r.tomatometer])
  );

  const deadlinePassed =
    week.bid_deadline !== null && new Date(week.bid_deadline) <= new Date();
  const active = films.filter((f) => f.status === "active");

  return {
    season: {
      id: seasonId,
      // A season with no week has no derived name yet (ADR-099). This one
      // demonstrably has a week — we just read it — so the fallback is
      // unreachable in practice and exists so the type is honest rather than
      // asserted with a `!`.
      name: seasonResult.data?.name ?? "Season",
    },
    league: leagueResult.data?.league ?? null,
    week: {
      id: week.id,
      seasonId: week.season_id,
      number: week.number,
      weekOf: week.week_of,
      openingDate: week.opening_date,
      bidDeadline: week.bid_deadline,
      status: week.status,
    },
    biddable: week.status === "open" && !deadlinePassed,
    deadlinePassed,
    pending: week.status === "draft",
    bankroll: settings?.fake_bankroll ?? null,
    minBid: settings?.min_bid ?? 1,
    // The 3 fallback matches the rulebook's stated default and
    // `lib/season-settings.ts`; it applies only to a season with no settings
    // row at all.
    topNDistinct: settings?.top_n_distinct ?? 3,
    remaining: typeof remainingResult.data === "number" ? remainingResult.data : 0,
    exposure: active.reduce((sum, f) => sum + (bidByFilm.get(f.id) ?? 0), 0),
    slate: active.map((f) => ({
      id: f.id,
      title: f.title,
      releaseDate: f.release_date,
      eligible: f.eligible,
      myBid: bidByFilm.get(f.id) ?? null,
      tmdbId: f.tmdb_id,
      posterPath: f.catalog?.poster_path ?? null,
      overview: f.catalog?.overview ?? null,
      certification: f.catalog?.certification ?? null,
      runtimeMin: f.catalog?.runtime_min ?? null,
      trailerKey: f.catalog?.trailer_youtube_key ?? null,
      // THE CAPTURED VALUE WINS, ALWAYS; the cache only fills in until there is
      // one (ADR-062). Never the other way round — a fresher figure shown in
      // place of the one that actually scored the film would contradict the
      // points printed beside it. On a biddable week there is no captured
      // value yet, so this is almost always the cache or null.
      tomatometer: f.tomatometer ?? (f.imdb_id ? (liveRating.get(f.imdb_id) ?? null) : null),
    })),
  };
}
