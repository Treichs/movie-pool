import type { SupabaseClient } from "@/lib/supabase";
import {
  FILM_COLUMNS_WITH_WEEK,
  getSettingsForSeason,
  getWeeks,
  type Film,
  type Week,
} from "@/lib/commish";
import type { FilmDetail } from "@/lib/film-detail";
import { buildFilmDetail } from "@/lib/film-detail";
import {
  getMyBids,
  getRemainingBudget,
  getRevealedBids,
  getStandings,
  buildDualRank,
  rankMovement,
  type ScoredOwnership,
} from "@/lib/pool";

// Data for the player's season HUB (ADR-023) — one season, from the player's
// point of view. The hub is the surface every other season page hangs off, so
// it answers three questions in one pass: is anything waiting on me, how am I
// doing, and what have I got riding on the board.
//
// Deliberately season-scoped and separate from lib/home.ts, which is the
// cross-league USER-level aggregate. The two answer different questions and
// share only the primitives in lib/pool.ts.

export type HubFilm = Film & {
  weekNumber: number;
  weekId: string;
  weekOf: string;
  openingDate: string;
  myBid: number | null;
  /** Everything the film slide-out needs, prebuilt — see lib/film-detail.ts. */
  detail: FilmDetail;
};

export type HubRank = {
  points: number;
  spent: number;
  filmsOwned: number;
  efficiency: number | null;
  pointsRank: number | null;
  efficiencyRank: number | null;
  playerCount: number;
};

export type HubStanding = {
  seasonMemberId: string;
  /** The account behind the seat (ADR-082). */
  profileId: string;
  name: string;
  points: number;
  isMe: boolean;
  /** Places climbed since the end of the previous scored week. Positive is up.
   *  Null means there is no honest comparison — no prior position, or nothing
   *  has scored yet — and renders as a dash rather than as "unchanged". */
  movement: number | null;
};

/**
 * What changed for the viewer over the last scored week (2026-08-09).
 *
 * All three read against the SAME instant — the end of week `latest - 1`, the
 * convention rankMovement already uses — so the three arrows on League Home
 * agree about what "last week" means. Any of them is null when there is
 * nothing honest to compare, which is a different fact from zero: "unchanged"
 * and "no previous position" render differently, and a dash says so.
 */
export type HubDeltas = {
  /** Places climbed. Positive is up, and note the sign flip: a lower rank
   *  NUMBER is a better position. */
  rank: number | null;
  /** Points added. */
  points: number | null;
  /** Change in points-per-dollar. */
  efficiency: number | null;
};

export type SeasonHub = {
  bankroll: number | null;
  minBid: number;
  remaining: number | null;
  weeks: Week[];
  /** The EARLIEST still-open week. "Current week" means this, app-wide. */
  openWeek: Week | null;
  /** The open week's films, with my bid on each already attached. */
  slate: HubFilm[];
  /** Films I own, best score first. Empty until a week resolves. */
  myFilms: HubFilm[];
  /** EVERY scored film in the season, best score first — not just mine. Feeds
   *  the best/worst pair on Season Home, which is a statement about the season
   *  rather than about the viewer. Free to build: the hub has already fetched
   *  every film and its catalogue row for the table below. */
  scoredFilms: HubFilm[];
  me: HubRank | null;
  /** What moved for the viewer over the last scored week. */
  myDeltas: HubDeltas;
  /** Every player's points for the my-position preview, best first. */
  standings: HubStanding[];
  /** One row per film for the sortable season table. */
  tableRows: SeasonTableRow[];
};

/** A film's line in the season table. Best/worst pts per dollar are the SPREAD
 *  across its owners: every owner earns the film's full score but paid their
 *  own bid, so the same film returns very differently to each of them. */
export type SeasonTableRow = {
  filmId: string;
  weekNumber: number;
  title: string;
  tomatometer: number | null;
  boxOffice: number | null;
  score: number | null;
  best: { value: number; name: string } | null;
  worst: { value: number; name: string } | null;
};

/* The HubMatrixFilm type and the hub's matrix field were removed 2026-08-09:
   the ownership matrix was retired into the films list by the leaderboard
   rework, and this copy had no consumer left. */

export async function getSeasonHub(
  supabase: SupabaseClient,
  seasonId: string,
  seasonMemberId: string
): Promise<SeasonHub> {
  const [config, allWeeks, standings, remaining] = await Promise.all([
    getSettingsForSeason(supabase, seasonId),
    getWeeks(supabase, seasonId),
    getStandings(supabase, seasonId),
    getRemainingBudget(supabase, seasonMemberId),
  ]);

  // Draft weeks USED to be filtered out here — "the commissioner's workbench".
  // The season-setup rework overturned that: a season is now laid out in full
  // the moment it starts, and hiding every unopened week meant a player joining
  // a fresh season saw an empty page and no reason to believe anything was
  // coming. ADR-048 already named `draft` "pending" for players, which only
  // makes sense if players can see one.
  //
  // Nothing is loosened by this. RLS has always let a member read their
  // season's weeks and films (proven in the setup spike); what RLS gates is BID
  // AMOUNTS, and that is untouched. A pending week simply cannot be bid on —
  // getWeekBoard still refuses to render one, and place_bid still requires an
  // open week.
  const weeks = allWeeks;

  // `openWeek` is the EARLIEST still-open week, which is what "current week"
  // means everywhere in the app. getWeeks orders by number, so the first open
  // row is genuinely the earliest rather than whatever the database returned.
  const openWeek = weeks.find((w) => w.status === "open") ?? null;

  const films = await getFilmsForWeeks(supabase, weeks);
  const filmIds = films.map((f) => f.id);

  // The cached Tomatometers (ADR-062). One query, keyed by imdb_id, exactly as
  // the week block does — a film on four leagues' slates is looked up once.
  // Indicative only: shown solely where no captured value exists. Showing a
  // fresher figure in place of the one that SCORED the film would contradict
  // the points printed beside it. Since 2026-08-07 it also feeds the film
  // drawer, which read the raw captured value and showed a dash all weekend.
  const imdbIds = [...new Set(films.map((f) => f.imdb_id).filter(Boolean))] as string[];
  const { data: ratingRows } = imdbIds.length
    ? await supabase.from("film_ratings").select("imdb_id, tomatometer").in("imdb_id", imdbIds)
    : { data: [] };
  const liveRating = new Map(
    ((ratingRows ?? []) as { imdb_id: string; tomatometer: number | null }[])
      .filter((r) => r.tomatometer !== null)
      .map((r) => [r.imdb_id, r.tomatometer as number])
  );

  // Two different reads, because a week's status decides what may be known:
  //  - OPEN  -> participation only (identities, never amounts) via ADR-022.
  //  - LOCKED+ -> the real bids; RLS reveals every player's row at close.
  // Asking for amounts on an open week wouldn't leak (RLS would withhold them)
  // but it would be a lie about intent, and the empty result would read as
  // "nobody bid" rather than "sealed".
  const revealedWeekIds = weeks
    .filter((w) => w.status !== "open")
    .map((w) => w.id);
  const [myBids, revealed] = await Promise.all([
    getMyBids(supabase, filmIds, seasonMemberId),
    getRevealedBids(
      supabase,
      films.filter((f) => revealedWeekIds.includes(f.weekId)).map((f) => f.id)
    ),
    // Participation is no longer read AT ALL (2026-08-05). This used to fetch
    // the bidders of every open week so buildFilmDetail could name them; that
    // signal is withdrawn, and one round trip per open week goes with it.
  ]);

  const bidByFilm = new Map(myBids.map((b) => [b.film_id, b.amount]));

  // A film I bid on and won. `is_winning` is only set once a week resolves, so
  // reading ownership off the bid keeps this in step with the standings view
  // rather than re-deriving the top-3 rule here.
  const wonFilmIds = new Set(
    revealed
      .filter((b) => b.is_winning && b.member.id === seasonMemberId)
      .map((b) => b.film_id)
  );

  const withBids: HubFilm[] = films.map((f) => {
    const myBid = bidByFilm.get(f.id) ?? null;
    return {
      ...f,
      myBid,
      detail: buildFilmDetail({
        film: f,
        config,
        myBid,
        iOwn: wonFilmIds.has(f.id),
        seasonMemberId,
        revealed,
        // The drawer showed a dash for every uncaptured film, all weekend,
        // while the breakdown table two clicks away had the cached score.
        liveTomatometer: f.imdb_id ? (liveRating.get(f.imdb_id) ?? null) : null,
      }),
    };
  });

  // Flattened scored ownership — one row per (member, scored film). Feeds the
  // derived week-over-week movement.
  const ownerships: ScoredOwnership[] = withBids
    .filter((f) => f.status === "active" && f.score !== null)
    .flatMap((f) =>
      revealed
        .filter((b) => b.film_id === f.id && b.is_winning)
        .map((b) => ({
          seasonMemberId: b.member.id,
          weekNumber: f.weekNumber,
          score: Number(f.score),
        }))
    );
  const movement = rankMovement(ownerships);

  // MY OWN LEDGER, week by week — what the three deltas on League Home read.
  //
  // Separate from `ownerships` above, and it has to be: that list is SCORED
  // films only, because rank is a comparison of points. Efficiency is
  // points-per-dollar, so its denominator needs every film I own whether or not
  // it has scored — a week can resolve (owners set, money spent) days before
  // the commissioner captures a result, and counting the points without the
  // spend would spike my efficiency and then drop it again when the capture
  // lands.
  const myLedger = withBids
    .filter((f) => f.status === "active")
    .flatMap((f) =>
      revealed
        .filter((b) => b.film_id === f.id && b.is_winning && b.member.id === seasonMemberId)
        .map((b) => ({
          weekNumber: f.weekNumber,
          score: f.score === null ? null : Number(f.score),
          bid: b.amount,
        })),
    );
  const myRank = buildRank(standings, seasonMemberId);
  const myDeltas = deltasSince(myLedger, ownerships, myRank, movement.get(seasonMemberId) ?? null);

  // ---- the sortable season table ------------------------------------------
  // Best/worst pts-per-dollar are computed over the film's WINNING bids only.
  // A losing bidder paid nothing and owns nothing, so including them would
  // invent a return that never happened.
  const nameOf = new Map(
    revealed.map((b) => [b.member.id, b.member.profile.display_name] as const)
  );
  const tableRows: SeasonTableRow[] = withBids
    .filter((f) => f.status === "active")
    .map((f) => {
      const score = f.score === null ? null : Number(f.score);
      const winners = revealed.filter((b) => b.film_id === f.id && b.is_winning);
      const returns =
        score === null
          ? []
          : winners
              .filter((b) => b.amount > 0)
              .map((b) => ({
                value: score / b.amount,
                name: nameOf.get(b.member.id) ?? "",
              }))
              .sort((a, b) => b.value - a.value);
      return {
        filmId: f.id,
        weekNumber: f.weekNumber,
        title: f.title,
        // ADR-062: the cached live figure fills in only where no captured
        // value exists. It is no longer MARKED as provisional (2026-08-07) —
        // the asterisk guarded against a reader multiplying it by box office,
        // which no player can do, because the box office is not published
        // until the commissioner captures it.
        tomatometer:
          f.tomatometer ?? (f.imdb_id ? (liveRating.get(f.imdb_id) ?? null) : null),
        boxOffice: f.box_office_m === null ? null : Number(f.box_office_m),
        score,
        best: returns[0] ?? null,
        worst: returns.length > 1 ? returns[returns.length - 1] : null,
      };
    });

  return {
    bankroll: config?.fake_bankroll ?? null,
    minBid: config?.min_bid ?? 1,
    remaining,
    weeks,
    openWeek,
    slate: openWeek ? withBids.filter((f) => f.weekId === openWeek.id) : [],
    myFilms: withBids
      .filter((f) => wonFilmIds.has(f.id) && f.status === "active")
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
    me: myRank,
    myDeltas,
    standings: standings.map((r) => ({
      seasonMemberId: r.season_member_id,
      profileId: r.profile_id,
      name: r.display_name,
      points: Number(r.points),
      isMe: r.season_member_id === seasonMemberId,
      movement: movement.get(r.season_member_id) ?? null,
    })),
    tableRows,
    // Score descending. `score` is numeric in Postgres and arrives as a string,
    // so it is coerced before comparing — sorting the strings would put "9.5"
    // above "10.2".
    scoredFilms: withBids
      .filter((f) => f.status === "active" && f.score !== null)
      .sort((a, b) => Number(b.score) - Number(a.score)),
  };
}

/**
 * The viewer's three deltas, all read at the end of week `latest - 1`.
 *
 * `latest - 1` rather than "the previous week that scored" because that is the
 * instant rankMovement already compares against, and three arrows on one card
 * disagreeing about when last week was would be worse than any of them being
 * slightly coarse. The two are equivalent in practice anyway: a week with no
 * captures contributes nothing to either sum, so as-of week 3 and as-of week 2
 * are the same numbers when week 3 never scored.
 *
 * Everything is null when there is no prior instant to compare — one scored
 * week means there is no "last week", and inventing a delta from zero would
 * report your entire season as this week's gain.
 */
function deltasSince(
  ledger: { weekNumber: number; score: number | null; bid: number }[],
  ownerships: ScoredOwnership[],
  me: HubRank | null,
  rank: number | null,
): HubDeltas {
  const none: HubDeltas = { rank: null, points: null, efficiency: null };
  if (!me) return none;

  const latest = ownerships.length
    ? Math.max(...ownerships.map((o) => o.weekNumber))
    : 0;
  const prev = latest - 1;
  if (prev < 1) return { ...none, rank };

  let points = 0;
  let spent = 0;
  for (const row of ledger) {
    if (row.weekNumber > prev) continue;
    points += row.score ?? 0;
    spent += row.bid;
  }
  // A player who had spent nothing by then had no ratio, so there is nothing to
  // subtract from — the same reason v_standings leaves efficiency null.
  const before = spent > 0 ? points / spent : null;

  return {
    rank,
    points: me.points - points,
    efficiency:
      me.efficiency !== null && before !== null ? me.efficiency - before : null,
  };
}

type FilmRow = Omit<HubFilm, "myBid" | "detail"> & { weekStatus: Week["status"] };

async function getFilmsForWeeks(
  supabase: SupabaseClient,
  weeks: Week[]
): Promise<FilmRow[]> {
  if (weeks.length === 0) return [];
  const { data } = await supabase
    .from("films")
    .select(FILM_COLUMNS_WITH_WEEK)
    .in(
      "week_id",
      weeks.map((w) => w.id)
    )
    .order("created_at", { ascending: true });

  const byId = new Map(weeks.map((w) => [w.id, w]));
  // `as unknown as` for the same reason as getFilms — postgrest-js types the
  // film_catalog embed as an array without generated DB types; the FK is
  // many-to-one so it is an object at runtime. Verified in the catalog spike.
  return ((data ?? []) as unknown as (Film & { week_id: string })[]).map((f) => {
    const week = byId.get(f.week_id)!;
    return {
      ...f,
      weekId: f.week_id,
      weekNumber: week.number,
      weekOf: week.week_of,
      openingDate: week.opening_date,
      weekStatus: week.status,
    };
  });
}

// My dual rank within the season. The RANK ARITHMETIC is lib/pool's
// buildDualRank, shared with the dashboard — this file used to compute its own
// and returned null for a zero-score player while the dashboard and the
// leaderboard both ranked them, so two screens showed one player two positions.
function buildRank(
  standings: Awaited<ReturnType<typeof getStandings>>,
  seasonMemberId: string
): HubRank | null {
  const mine = standings.find((r) => r.season_member_id === seasonMemberId);
  if (!mine) return null;
  const ranks = buildDualRank(standings, seasonMemberId);
  if (!ranks) return null;

  return {
    points: Number(mine.points),
    spent: mine.spent,
    filmsOwned: mine.films_owned,
    efficiency: mine.efficiency === null ? null : Number(mine.efficiency),
    pointsRank: ranks.pointsRank,
    efficiencyRank: ranks.efficiencyRank,
    playerCount: standings.length,
  };
}
