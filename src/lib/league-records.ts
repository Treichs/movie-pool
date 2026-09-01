import type { SupabaseClient } from "@/lib/supabase";
import { rankBy, type StandingsRow } from "@/lib/pool";

// The league record book — the all-time layer the League page grew on
// 2026-08-01, prompted by the fantasy-league research (§10.3/§13.3): every
// incumbent platform ships a per-season archive and none ships a synthesis,
// to the point that a paid third-party industry exists just to compute
// all-time standings and record books. For a 33-season pool, the cross-season
// story IS the product's emotional core: settling arguments and preserving
// bragging rights.
//
// Everything here is DERIVED from data members can already read (v_standings,
// plus captured films and their winning bids) — no new tables, no new views,
// and deliberately NO stored aggregates. Nothing is recomputed on a trigger
// because nothing is kept: the book is built on every render, so it cannot
// drift from the rows it describes, and there is no cache for a week close to
// invalidate.
//
// SCOPE, twice revised. It counted only COMPLETED seasons until 2026-08-06, on
// the reasoning that nothing in a record book should move mid-season — which
// made it invisible for a league's entire first year (ADR-083). It now counts
// every season for numbers and only finished ones for placings.
//
// An OPEN week is out of scope regardless, and structurally rather than by a
// filter anyone has to remember: capture_film refuses a week that has not
// closed, is_winning is only set by close_week, and v_standings counts only
// winning bids. A sealed bid cannot reach these numbers (ADR-022).

export type CareerRow = {
  /** The account this career belongs to — the identity, and the map key. */
  profileId: string;
  /** How the league knows them TODAY. Display only; never an identity. */
  name: string;
  isMe: boolean;
  /** Commissioner of the league, for the crown. Read off the member row so the
   *  career table can stand in for the roster (ADR-083). */
  isCommissioner: boolean;
  /** Every season played, live ones included. */
  seasons: number;
  /** 1st-place finishes (dense rank, ties share the crown). COMPLETED seasons
   *  only — leading a live season is not winning it. */
  titles: number;
  points: number;
  spent: number;
  filmsOwned: number;
  /** COMPLETED seasons only, for the same reason as `titles`. */
  bestFinish: number | null;
  /** Career points per dollar; null until they have ever spent. */
  efficiency: number | null;
  /** Points per season played — the comparison that survives uneven tenure.
   *  Null until they have played one. */
  pointsPerSeason: number | null;
  /** What they typically pay for a film. Style, not skill: the same spend buys
   *  a few expensive films or a lot of cheap ones. Null until they have won
   *  something. */
  avgBid: number | null;
};

export type RecordEntry = {
  holder: string;
  /** Which career row wears this as a badge (ADR-085). */
  holderProfileId: string | null;
  isMe: boolean;
  value: string;
  detail: string;
  /**
   * How far clear this record stands, already worded — "12.40 pts clear of Dev
   * Grace", "Level with Dev Grace", "0.12 pts/$ worse than Dev Frank".
   *
   * A record with no runner-up is a fact; a record with one is an argument,
   * and the argument is the reason anybody opens a record book. Null when
   * there is genuinely nothing to compare against — a league whose first
   * scored film set every record it has.
   *
   * Worded here rather than in the card because the unit and the direction
   * both belong to the record: "clear of" for a best, "worse than" for a
   * worst, and points, points-per-dollar or films depending on the axis.
   */
  margin: string | null;
  /**
   * The film the record is about — present on the three FILM records and
   * deliberately absent on "Best season", which is a person and a season and
   * has no single film to show. Consumers must handle the null rather than
   * assume a poster: the asymmetry is real, not a data gap.
   */
  film: { title: string; tmdbId: number | null; posterPath: string | null } | null;
};

/**
 * The league's own numbers — no member anywhere in them (ADR-085).
 *
 * Every one is computed over the SAME set: films that have been captured, and
 * the winning bids on them. That set structurally excludes any open week —
 * capture_film refuses a week that has not closed, and is_winning is only set
 * by close_week — so a bid still under seal can never move these. Computing
 * them together also keeps them consistent with each other in the window
 * between a week closing and its films being captured, when the money is known
 * but the scores are not.
 *
 * Null rather than zero when there is nothing to divide by: a league that has
 * scored no films has no average bid, and "$0" would be a claim about a market
 * that has not opened yet.
 */
export type LeagueAggregates = {
  /** What owning a film has cost, across every winning bid ever. */
  avgWinningBid: number | null;
  /** What a film returns — the FILM's score, counted once however many own it. */
  avgPointsPerFilm: number | null;
  /** The going rate: every point ever earned over every dollar ever spent. */
  pointsPerDollar: number | null;
  /** How contested a film is, and why points earned exceed film scores. */
  ownersPerFilm: number | null;
  /** How many captured films the averages are drawn from. */
  filmsScored: number;
};

// A ChampionsRollRow type and championsRoll field lived here for one review
// cycle (record-book-redesign, 2026-08-16): one banner per finished season.
// Removed on the developer's review — the champions already read off the
// career table — and recoverable from git history if a roll returns.
export type LeagueRecordBook = {
  seasonsCounted: number;
  career: CareerRow[];
  aggregates: LeagueAggregates;
  /** Marquee records lead League Home; the records page shows the full shelf. */
  records: { label: string; entry: RecordEntry; marquee: boolean }[];
  /** Where each account finished in each COMPLETED season, keyed by profile.
   *  The raw material for a career rivalry, which `buildCareerTable` computes
   *  and then throws away in favour of a title count. */
  placements: Map<string, SeasonPlacement[]>;
};

/** One account's finishing place in one completed season. */
export type SeasonPlacement = { seasonId: string; rank: number };

type FilmRow = {
  id: string;
  title: string;
  score: number | string | null;
  tmdb_id: number | null;
  /** Embedded row, so PostgREST hands back an object or null, never an array. */
  catalog: { poster_path: string | null } | null;
  week: { season_id: string; number: number } | null;
};

/**
 * HOW FAR CLEAR A RECORD STANDS.
 *
 * `kind` is the direction the axis runs: a best is "clear of" the next best, a
 * worst is "worse than" the next worst. Getting that backwards would praise
 * somebody for the priciest whiff in league history.
 *
 * A DEAD HEAT IS REPORTED AS ONE, AND COUNTED. Ties are honoured everywhere in
 * this game, and a contested film genuinely gives every owner the same score —
 * so "Biggest single film" can be level with three other people at once.
 * Naming only the next row in sort order would pick an arbitrary name out of a
 * tie, which is the one thing this file refuses to do anywhere else. So the
 * whole tail is passed in: one level name is named, several are counted.
 *
 * This is also the only signal the shelf gives that a record is shared at all —
 * each card still names a single holder.
 *
 * The epsilon is half a hundredth because every figure here is rendered to two
 * decimals: a gap that rounds to 0.00 must not be printed as "0.00 pts clear".
 *
 * @param rest everything below the record, in the SAME order the record was
 *             taken from — `ranking.slice(1)`.
 */
function marginText(
  best: number,
  rest: { value: number; holder: string; isSelf: boolean }[],
  unit: (n: number) => string,
  kind: "best" | "worst" = "best"
): string | null {
  if (rest.length === 0) return null;

  const level = rest.filter((r) => Math.abs(best - r.value) < 0.005);
  if (level.length === 1) {
    return `Level with ${level[0].isSelf ? "their own next best" : level[0].holder}`;
  }
  if (level.length > 1) return `Level with ${level.length} others`;

  const next = rest[0];
  const gap = Math.abs(best - next.value);
  const who = next.isSelf ? "their own next best" : next.holder;
  return `${unit(gap)} ${kind === "best" ? "clear of" : "worse than"} ${who}`;
}

const inPoints = (n: number) => `${n.toFixed(2)} pts`;
const inRatio = (n: number) => `${n.toFixed(2)} pts/$`;
const inFilms = (n: number) => `${n} film${n === 1 ? "" : "s"}`;

/** The film half of a record entry, from the row the record was found on. */
const filmOf = (f: FilmRow): RecordEntry["film"] => ({
  title: f.title,
  tmdbId: f.tmdb_id,
  posterPath: f.catalog?.poster_path ?? null,
});

type WinningBid = {
  film_id: string;
  season_member_id: string;
  amount: number;
};

/**
 * Fold per-season standings into one row per PLAYER — where a player is an
 * ACCOUNT (`profiles.id`), never a display name.
 *
 * It was keyed on the name until 2026-08-06, on the reasoning that profiles are
 * 1:1 with humans and the name is what the league knows them by. The rename
 * case that argued for is genuinely fine: `v_standings` joins profiles live, so
 * a rename re-labels all of that account's history at once and the career stays
 * a single row. The case it got WRONG is the opposite one — two DIFFERENT
 * people who happen to share a display name ("Mike", "Chris", a set of
 * initials) collapsed into one career with their points, seasons and titles
 * added together, and neither could find their own line. Two members picking
 * the same casual name is ordinary in a friend group, and nothing prevents it.
 *
 * Pure, and exported, so the collision is covered by a unit test rather than
 * only by whichever league happens to hit it.
 *
 * NUMBERS COUNT EVERY SEASON; PLACINGS COUNT ONLY FINISHED ONES (ADR-083).
 * Points, spend, films and pts/$ are facts the moment a film is captured, so a
 * live season contributes them immediately — that is what lets this table lead
 * League Home from a league's first day and stand in for the roster. A title
 * and a best finish are statements about a COMPLETED contest, so they wait: a
 * career line that claimed a championship in week 3 and lost it in week 5 would
 * be a record book nobody could trust.
 *
 * @param profileOf  season_member_id -> profiles.id, for the memberships the
 *                   caller can see. A membership missing from it is SKIPPED:
 *                   with no account to attribute the season to, falling back to
 *                   the name would reintroduce the very collision this exists
 *                   to prevent.
 * @param myMemberIds the caller's own season_member_ids, for the `isMe` flag.
 * @param completedSeasonIds which seasons have actually finished.
 */
export function buildCareerTable(
  standings: StandingsRow[],
  profileOf: Map<string, string>,
  myMemberIds: Set<string>,
  completedSeasonIds: Set<string>
): CareerRow[] {
  // Rank runs per season, so the rows have to be grouped by season first —
  // "best finish" and "titles" are positions WITHIN a season, not overall.
  const bySeason = new Map<string, StandingsRow[]>();
  for (const r of standings) {
    const rows = bySeason.get(r.season_id) ?? [];
    rows.push(r);
    bySeason.set(r.season_id, rows);
  }

  const careers = new Map<string, CareerRow>();
  for (const [seasonId, rows] of bySeason) {
    const finished = completedSeasonIds.has(seasonId);
    const ranked = rankBy(
      [...rows].sort((a, b) => Number(b.points) - Number(a.points)),
      (r) => Number(r.points)
    );
    for (const [rank, r] of ranked) {
      const profileId = profileOf.get(r.season_member_id);
      if (!profileId) continue;
      const c = careers.get(profileId) ?? {
        profileId,
        name: r.display_name,
        isMe: false,
        isCommissioner: false,
        seasons: 0,
        titles: 0,
        points: 0,
        spent: 0,
        filmsOwned: 0,
        bestFinish: null,
        efficiency: null,
        pointsPerSeason: null,
        avgBid: null,
      };
      c.seasons += 1;
      c.points += Number(r.points);
      c.spent += Number(r.spent);
      c.filmsOwned += Number(r.films_owned);
      // Placings only from a finished contest — see the note above.
      if (finished) {
        if (rank === 1) c.titles += 1;
        c.bestFinish =
          c.bestFinish === null ? rank : Math.min(c.bestFinish, rank);
      }
      if (myMemberIds.has(r.season_member_id)) c.isMe = true;
      if (r.role === "commissioner") c.isCommissioner = true;
      // Every row of this account carries the SAME name — v_standings joins
      // profiles live rather than snapshotting it — so which row wins does not
      // matter, and the label is always the account's current name.
      c.name = r.display_name;
      careers.set(profileId, c);
    }
  }

  return [...careers.values()]
    .map((c) => ({
      ...c,
      efficiency: c.spent > 0 ? c.points / c.spent : null,
      pointsPerSeason: c.seasons > 0 ? c.points / c.seasons : null,
      // Films OWNED is the denominator, not bids placed: a losing bid costs
      // nothing, so it would drag this toward zero and describe nobody's style.
      avgBid: c.filmsOwned > 0 ? c.spent / c.filmsOwned : null,
      points: Math.round(c.points * 100) / 100,
    }))
    .sort((a, b) => b.titles - a.titles || b.points - a.points);
}

/**
 * WHERE EVERYONE FINISHED, SEASON BY SEASON.
 *
 * `buildCareerTable` walks exactly this and keeps only the count of firsts and
 * the best of them, which is enough for a career line and not enough for a
 * rivalry — "you have finished above Grace in four of seven shared seasons"
 * needs both placings side by side, season by season.
 *
 * COMPLETED SEASONS ONLY, for the same reason titles are: a placing in a live
 * season is a position, not a finish, and a rivalry record that swung every
 * Monday would be worth nothing to argue with.
 *
 * It ranks through the shared `rankBy` on the same sort `buildCareerTable`
 * uses, which is what keeps the two from disagreeing about who came second.
 * Pure and exported so a unit test can hold them to it.
 */
export function buildPlacements(
  standings: StandingsRow[],
  profileOf: Map<string, string>,
  completedSeasonIds: Set<string>
): Map<string, SeasonPlacement[]> {
  const bySeason = new Map<string, StandingsRow[]>();
  for (const r of standings) {
    if (!completedSeasonIds.has(r.season_id)) continue;
    const rows = bySeason.get(r.season_id) ?? [];
    rows.push(r);
    bySeason.set(r.season_id, rows);
  }

  const out = new Map<string, SeasonPlacement[]>();
  for (const [seasonId, rows] of bySeason) {
    const ranked = rankBy(
      [...rows].sort((a, b) => Number(b.points) - Number(a.points)),
      (r) => Number(r.points)
    );
    for (const [rank, r] of ranked) {
      const profileId = profileOf.get(r.season_member_id);
      // A membership with no account behind it is skipped, exactly as
      // buildCareerTable skips it — a career cannot be grouped on a name.
      if (!profileId) continue;
      const list = out.get(profileId) ?? [];
      list.push({ seasonId, rank });
      out.set(profileId, list);
    }
  }
  return out;
}

/**
 * THE BEST SINGLE WEEK — one member's haul across every film they owned in one
 * week. Pure and exported for the unit test: the aggregation key is the part
 * that goes wrong silently (member alone sums a career; member+week without
 * the season collides week 3 of every season into one number).
 */
export type WeekHaul = {
  memberId: string;
  seasonId: string;
  weekNumber: number;
  total: number;
  /** The largest film in the haul — the card's artwork. */
  topFilmId: string;
};

/**
 * EVERY week-haul, biggest first — the ranking `bestWeekHaul` takes the head
 * of, exposed so the record can also say what it beat. Splitting it this way
 * keeps `bestWeekHaul`'s signature and its unit test exactly as they were.
 */
export function rankWeekHauls(
  rows: {
    memberId: string;
    seasonId: string;
    weekNumber: number;
    filmId: string;
    score: number;
  }[]
): WeekHaul[] {
  const hauls = new Map<
    string,
    { memberId: string; seasonId: string; weekNumber: number; total: number; topFilmId: string; topScore: number }
  >();
  for (const r of rows) {
    const k = `${r.memberId}|${r.seasonId}|${r.weekNumber}`;
    const h =
      hauls.get(k) ??
      {
        memberId: r.memberId,
        seasonId: r.seasonId,
        weekNumber: r.weekNumber,
        total: 0,
        topFilmId: r.filmId,
        topScore: -Infinity,
      };
    h.total += r.score;
    if (r.score > h.topScore) {
      h.topScore = r.score;
      h.topFilmId = r.filmId;
    }
    hauls.set(k, h);
  }
  return [...hauls.values()]
    .filter((h) => h.total > 0)
    .sort((a, b) => b.total - a.total);
}

export function bestWeekHaul(
  rows: Parameters<typeof rankWeekHauls>[0]
): WeekHaul | null {
  return rankWeekHauls(rows)[0] ?? null;
}

/**
 * THE BEST ROOKIE SEASON — the most points anyone scored in their FIRST season
 * with the league. Pure and exported for the unit test: "first" is by the
 * league's season ORDER, not by where the points were biggest, and getting
 * that backwards quietly turns this into "best season" again.
 *
 * A founding cohort all debuts in season one, and that is honest: the record
 * starts as "best founder" and gets harder to take as the league ages.
 */
export type RookieSeason = { profileId: string; seasonId: string; points: number };

/**
 * EVERY member's debut season, strongest first. `bestRookieSeason` is its head
 * — split for the same reason `rankWeekHauls` is, and with the same promise
 * that the single-result export keeps its shape.
 */
export function rankRookieSeasons(
  rows: RookieSeason[],
  /** Season ids in PLAY order, earliest first. */
  seasonOrder: string[]
): RookieSeason[] {
  const order = new Map(seasonOrder.map((id, i) => [id, i]));
  const debut = new Map<string, { seasonId: string; points: number; idx: number }>();
  for (const r of rows) {
    const idx = order.get(r.seasonId);
    if (idx === undefined) continue;
    const d = debut.get(r.profileId);
    if (!d || idx < d.idx) {
      debut.set(r.profileId, { seasonId: r.seasonId, points: r.points, idx });
    }
  }
  return [...debut.entries()]
    .filter(([, d]) => d.points > 0)
    .map(([profileId, d]) => ({ profileId, seasonId: d.seasonId, points: d.points }))
    .sort((a, b) => b.points - a.points);
}

export function bestRookieSeason(
  rows: RookieSeason[],
  seasonOrder: string[]
): RookieSeason | null {
  return rankRookieSeasons(rows, seasonOrder)[0] ?? null;
}

/** What getLeagueRecordBook needs to know about a season — getLeagueSeasons'
 *  shape, so the pages pass their existing fetch straight through. */
export type RecordBookSeason = {
  id: string;
  name: string;
  status: "draft" | "active" | "completed" | "archived";
  /** Play order runs on this — see bestRookieSeason. */
  created_at: string;
};

/**
 * @param seasons EVERY season of the league — live ones included, so the book
 *                has something to say from a league's first day (ADR-083).
 *                Numbers count all of them; placings, titles and the champions
 *                roll count only the finished ones.
 */
export async function getLeagueRecordBook(
  supabase: SupabaseClient,
  seasons: RecordBookSeason[],
  userId: string
): Promise<LeagueRecordBook | null> {
  const seasonIds = seasons.map((s) => s.id);
  const completedSeasonIds = seasons
    .filter((s) => s.status === "completed" || s.status === "archived")
    .map((s) => s.id);
  if (seasonIds.length === 0) return null;

  const [standingsRes, filmsRes, myMembersRes] = await Promise.all([
    supabase.from("v_standings").select("*").in("season_id", seasonIds),
    // Captured films from live seasons count too: a score is history the moment
    // the commissioner records it, which is what makes "Steal of the century"
    // move during a season instead of only after one.
    // tmdb_id and the catalog poster ride along so the three FILM records can
    // show the film they are about (2026-08-13). A record that names a player
    // and a number but not the artwork is the one thing a record book should
    // never be — the film is the thing the story happened to.
    supabase
      .from("films")
      .select(
        "id, title, score, tmdb_id, catalog:film_catalog(poster_path), week:weeks!inner(season_id, number)"
      )
      .in("weeks.season_id", seasonIds)
      .eq("status", "active")
      .not("score", "is", null),
    // EVERY member row of these seasons, not just the caller's — this is what
    // maps a season_member_id back to the ACCOUNT behind it, which is the only
    // identity a career may be grouped on. season_members carries the same
    // is_season_member RLS that v_standings (security_invoker) resolves under,
    // so this returns exactly the rows whose standings the caller can already
    // see — the two can never disagree.
    supabase
      .from("season_members")
      .select("id, profile_id")
      .in("season_id", seasonIds),
  ]);

  const standings = (standingsRes.data ?? []) as StandingsRow[];
  if (standings.length === 0) return null;
  const films = (filmsRes.data ?? []) as unknown as FilmRow[];
  const memberRows = (myMembersRes.data ?? []) as {
    id: string;
    profile_id: string;
  }[];
  const profileOf = new Map(memberRows.map((m) => [m.id, m.profile_id]));
  const myMemberIds = new Set(
    memberRows.filter((m) => m.profile_id === userId).map((m) => m.id)
  );

  // Winning bids on captured films — the same readability ADR-029 leans on:
  // once a film is scored, its winning amounts are league history.
  const { data: bidsData } = films.length
    ? await supabase
        .from("bids")
        .select("film_id, season_member_id, amount")
        .eq("is_winning", true)
        .in(
          "film_id",
          films.map((f) => f.id)
        )
    : { data: [] };
  const winningBids = (bidsData ?? []) as WinningBid[];

  const completedSet = new Set(completedSeasonIds);
  const career = buildCareerTable(standings, profileOf, myMemberIds, completedSet);
  const placements = buildPlacements(standings, profileOf, completedSet);
  const memberName = new Map(
    standings.map((r) => [r.season_member_id, r.display_name])
  );

  // ---- The league's own numbers (ADR-085) ---------------------------------
  //
  // `films` is already the captured set and `winningBids` are already its
  // winners, so every open week is out of scope before this line runs — see
  // the LeagueAggregates doc comment.
  //
  // avgPointsPerFilm counts each FILM once. Ownership is not split (rulebook
  // §5: every owner earns the full score), so summing what members earned
  // would multiply the same film by its owner count and answer a different
  // question — which is exactly what ownersPerFilm is for.
  const filmById = new Map(films.map((f) => [f.id, f]));
  const totalFilmScore = films.reduce((s, f) => s + Number(f.score ?? 0), 0);
  const totalSpent = winningBids.reduce((s, b) => s + b.amount, 0);
  const totalEarned = winningBids.reduce(
    (s, b) => s + Number(filmById.get(b.film_id)?.score ?? 0),
    0
  );
  const aggregates: LeagueAggregates = {
    filmsScored: films.length,
    avgWinningBid: winningBids.length ? totalSpent / winningBids.length : null,
    avgPointsPerFilm: films.length ? totalFilmScore / films.length : null,
    pointsPerDollar: totalSpent > 0 ? totalEarned / totalSpent : null,
    ownersPerFilm: films.length ? winningBids.length / films.length : null,
  };

  // ---- Record-book superlatives, worn as badges on the career table.
  // The MARQUEE four lead League Home; the records page shows the whole shelf
  // (record-book-redesign, 2026-08-16). The career table's peg shelf stays the
  // canonical four — seven pegs a row stops reading as a shelf.
  const records: { label: string; entry: RecordEntry; marquee: boolean }[] = [];
  const isMe = (memberId: string) => myMemberIds.has(memberId);
  const nameOf = (memberId: string) => memberName.get(memberId) ?? "Unknown player";
  const profileFor = (memberId: string) => profileOf.get(memberId) ?? null;

  // Best season ever (points). Suppressed at zero: now that the book counts
  // live seasons it renders on day one, and "Best season — 0.00 pts on $0
  // spent" is not a record, it is the absence of one. The other three are
  // already self-suppressing because they need a captured film to exist.
  const seasonRanking = [...standings]
    .sort((a, b) => Number(b.points) - Number(a.points))
    .filter((r) => Number(r.points) > 0);
  const bestSeason = seasonRanking[0];
  if (bestSeason) {
    records.push({
      marquee: true,
      label: "Best season",
      entry: {
        holder: bestSeason.display_name,
        holderProfileId: profileFor(bestSeason.season_member_id),
        isMe: myMemberIds.has(bestSeason.season_member_id),
        value: `${Number(bestSeason.points).toFixed(2)} pts`,
        detail: `on $${Number(bestSeason.spent)} spent`,
        // A per-season record, so the next best can be the SAME person's other
        // season. `isSelf` is compared on the account, never the name — this
        // file's own warning about name collisions applies here too.
        margin: marginText(
          Number(bestSeason.points),
          seasonRanking.slice(1).map((r) => ({
            value: Number(r.points),
            holder: r.display_name,
            isSelf:
              profileFor(r.season_member_id) ===
              profileFor(bestSeason.season_member_id),
          })),
          inPoints
        ),
        // A season, not a film. Null on purpose — see RecordEntry.film.
        film: null,
      },
    });
  }

  // Highest-scoring film anyone owned.
  const scoredBids = winningBids
    .map((b) => ({ bid: b, film: filmById.get(b.film_id) }))
    .filter((x): x is { bid: WinningBid; film: FilmRow } => Boolean(x.film));
  const filmRanking = [...scoredBids].sort(
    (a, b) => Number(b.film.score) - Number(a.film.score)
  );
  const topFilm = filmRanking[0];
  if (topFilm) {
    records.push({
      marquee: true,
      label: "Biggest single film",
      entry: {
        holder: nameOf(topFilm.bid.season_member_id),
        holderProfileId: profileFor(topFilm.bid.season_member_id),
        isMe: isMe(topFilm.bid.season_member_id),
        film: filmOf(topFilm.film),
        value: `${Number(topFilm.film.score).toFixed(2)} pts`,
        detail: `${topFilm.film.title} · won at $${topFilm.bid.amount}`,
        // The runner-up is the next BID, which on a contested film is the same
        // film owned by somebody else — a zero gap, reported as "Level with".
        // That is correct: ownership is never divided, so two owners of one
        // film genuinely share its score.
        margin: marginText(
          Number(topFilm.film.score),
          filmRanking.slice(1).map((x) => ({
            value: Number(x.film.score),
            holder: nameOf(x.bid.season_member_id),
            isSelf: x.bid.season_member_id === topFilm.bid.season_member_id,
          })),
          inPoints
        ),
      },
    });
  }

  // Steal of the century — best points-per-dollar single pick.
  const stealRanking = [...scoredBids]
    .filter((x) => x.bid.amount > 0 && Number(x.film.score) > 0)
    .sort(
      (a, b) =>
        Number(b.film.score) / b.bid.amount - Number(a.film.score) / a.bid.amount
    );
  const steal = stealRanking[0];
  if (steal) {
    records.push({
      marquee: true,
      label: "Steal of the century",
      entry: {
        holder: nameOf(steal.bid.season_member_id),
        holderProfileId: profileFor(steal.bid.season_member_id),
        isMe: isMe(steal.bid.season_member_id),
        film: filmOf(steal.film),
        value: `${(Number(steal.film.score) / steal.bid.amount).toFixed(2)} pts/$`,
        detail: `${steal.film.title} for $${steal.bid.amount}`,
        margin: marginText(
          Number(steal.film.score) / steal.bid.amount,
          stealRanking.slice(1).map((x) => ({
            value: Number(x.film.score) / x.bid.amount,
            holder: nameOf(x.bid.season_member_id),
            isSelf: x.bid.season_member_id === steal.bid.season_member_id,
          })),
          inRatio
        ),
      },
    });
  }

  // Priciest whiff — the most dollars ever paid per point.
  // FILTERED TO ACTUAL WHIFFS FIRST, then ranked. The old form sorted every
  // bid ascending and tested the head — identical result, because a $0 bid
  // divides to Infinity and sorts last, but it left no ranking to draw a
  // runner-up from and no guard if the rulebook ever allowed a winning $0 bid.
  const whiffRanking = [...scoredBids]
    .filter((x) => x.bid.amount > 0 && Number(x.film.score) / x.bid.amount < 1)
    .sort(
      (a, b) =>
        Number(a.film.score) / a.bid.amount - Number(b.film.score) / b.bid.amount
    );
  const whiff = whiffRanking[0];
  if (whiff) {
    records.push({
      marquee: true,
      label: "Priciest whiff",
      entry: {
        holder: nameOf(whiff.bid.season_member_id),
        holderProfileId: profileFor(whiff.bid.season_member_id),
        isMe: isMe(whiff.bid.season_member_id),
        film: filmOf(whiff.film),
        value: `$${whiff.bid.amount} → ${Number(whiff.film.score).toFixed(2)} pts`,
        detail: whiff.film.title,
        // "worst": the axis runs the other way, and calling the priciest whiff
        // in league history "clear of" the runner-up would read as praise.
        margin: marginText(
          Number(whiff.film.score) / whiff.bid.amount,
          whiffRanking.slice(1).map((x) => ({
            value: Number(x.film.score) / x.bid.amount,
            holder: nameOf(x.bid.season_member_id),
            isSelf: x.bid.season_member_id === whiff.bid.season_member_id,
          })),
          inRatio,
          "worst"
        ),
      },
    });
  }

  // ---- The shelf's second row (record-book-redesign, 2026-08-16) ----------
  const seasonName = new Map(seasons.map((s) => [s.id, s.name]));

  // Best single week — the biggest one-weekend haul anyone ever had.
  const haulRanking = rankWeekHauls(
    scoredBids
      .filter((x) => x.film.week !== null)
      .map((x) => ({
        memberId: x.bid.season_member_id,
        seasonId: x.film.week!.season_id,
        weekNumber: x.film.week!.number,
        filmId: x.film.id,
        score: Number(x.film.score),
      }))
  );
  const haul = haulRanking[0];
  if (haul) {
    const topFilm = filmById.get(haul.topFilmId);
    records.push({
      marquee: false,
      label: "Best single week",
      entry: {
        holder: nameOf(haul.memberId),
        holderProfileId: profileFor(haul.memberId),
        isMe: isMe(haul.memberId),
        film: topFilm ? filmOf(topFilm) : null,
        value: `${haul.total.toFixed(2)} pts`,
        detail: `${seasonName.get(haul.seasonId) ?? "a season"} week ${haul.weekNumber}`,
        margin: marginText(
          haul.total,
          haulRanking.slice(1).map((h) => ({
            value: h.total,
            holder: nameOf(h.memberId),
            // Memberships, not accounts: the same person across two seasons
            // holds two of them, so this compares the profiles.
            isSelf: profileFor(h.memberId) === profileFor(haul.memberId),
          })),
          inPoints
        ),
      },
    });
  }

  // Most films in one season — the widest portfolio anyone ever ran.
  const widestRanking = [...standings]
    .filter((r) => Number(r.films_owned) > 0)
    .sort((a, b) => Number(b.films_owned) - Number(a.films_owned));
  const widest = widestRanking[0];
  if (widest) {
    records.push({
      marquee: false,
      label: "Most films, one season",
      entry: {
        holder: widest.display_name,
        holderProfileId: profileFor(widest.season_member_id),
        isMe: myMemberIds.has(widest.season_member_id),
        film: null,
        value: `${widest.films_owned} films`,
        detail: `in ${seasonName.get(widest.season_id) ?? "one season"}`,
        margin: marginText(
          Number(widest.films_owned),
          widestRanking.slice(1).map((r) => ({
            value: Number(r.films_owned),
            holder: r.display_name,
            isSelf:
              profileFor(r.season_member_id) === profileFor(widest.season_member_id),
          })),
          inFilms
        ),
      },
    });
  }

  // Best rookie season — the strongest debut. Play order comes from
  // created_at ascending; the caller's array arrives newest-first, so sort
  // here rather than trusting an ordering convention two files away.
  const playOrder = [...seasons]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((s) => s.id);
  const rookieRanking = rankRookieSeasons(
    standings
      .map((r) => ({
        profileId: profileOf.get(r.season_member_id),
        seasonId: r.season_id,
        points: Number(r.points),
      }))
      .filter((r): r is { profileId: string; seasonId: string; points: number } =>
        Boolean(r.profileId)
      ),
    playOrder
  );
  const rookie = rookieRanking[0];
  if (rookie) {
    const holderRow = standings.find(
      (r) =>
        r.season_id === rookie.seasonId &&
        profileOf.get(r.season_member_id) === rookie.profileId
    );
    if (holderRow) {
      records.push({
        marquee: false,
        label: "Best rookie season",
        entry: {
          holder: holderRow.display_name,
          holderProfileId: rookie.profileId,
          isMe: myMemberIds.has(holderRow.season_member_id),
          film: null,
          value: `${rookie.points.toFixed(2)} pts`,
          detail: `debut, ${seasonName.get(rookie.seasonId) ?? "their first season"}`,
          // Every account has exactly one debut, so the runner-up is always a
          // different person — `isSelf` cannot be true here.
          margin: marginText(
            rookie.points,
            rookieRanking.slice(1).map((r) => ({
              value: r.points,
              holder:
                career.find((c) => c.profileId === r.profileId)?.name ??
                "Unknown player",
              // Every account has exactly one debut, so a runner-up here is
              // always a different person.
              isSelf: false,
            })),
            inPoints
          ),
        },
      });
    }
  }

  return {
    aggregates,
    seasonsCounted: seasonIds.length,
    career,
    records,
    placements,
  };
}
