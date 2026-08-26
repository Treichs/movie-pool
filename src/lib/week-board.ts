import type { SupabaseClient } from "@/lib/supabase";
import { getFilms, getSettingsForSeason, getWeek, type Film, type Week } from "@/lib/commish";
import { buildFilmDetail, type FilmDetail } from "@/lib/film-detail";
import {
  getMyBids,
  getRemainingBudget,
  getRevealedBids,
} from "@/lib/pool";

// Data for the player's WEEK BOARD — one release week, the screen where the
// game is actually played. Week-scoped and deliberately separate from
// lib/season-hub.ts: the hub would over-fetch here (every week, every film,
// standings) to answer a question about one week.
//
// Both build their film panels through buildFilmDetail, so the two surfaces
// cannot drift on what may be known when (ADR-022).

export type BoardFilm = Film & {
  myBid: number | null;
  detail: FilmDetail;
};

export type WeekBoard = {
  week: Week & { season_id: string };
  /** The week's STATUS is open. Not the same as biddable — see below. */
  open: boolean;
  /** A bid placed now would actually be accepted. False for the short window
   *  after the deadline (up to a minute since 20260815220000; was up to 59
   *  minutes) while the status still says open and the pg_cron automation has
   *  not yet closed the week. Every bidding CONTROL keys off this, not off
   *  `open` — the clock check is the law, the cron is the janitor, and this
   *  stays even at a one-minute tick so a dead scheduler fails SAFE. */
  biddable: boolean;
  /** The deadline has passed but the close has not run yet. */
  deadlinePassed: boolean;
  /** The week exists but bidding has not opened — the commissioner is still
   *  building the slate. Readable, never biddable. */
  pending: boolean;
  bankroll: number | null;
  minBid: number;
  /** Season budget left, before this week's pending exposure. */
  remaining: number | null;
  /** What my bids on this week already commit (ADR-001 sum-exposure). */
  exposure: number;
  /** The week's films — SLATE is the correct word for these (glossary). */
  slate: BoardFilm[];
  /** Removed films, kept visible: their bids were refunded, they score for no one. */
  removed: BoardFilm[];
  /** ADR-060: commissioner corrections made to this week, newest first. */
  overrides: WeekOverride[];
  /**
   * How many players are in the season.
   *
   * Fetched for ONE reason: the reveal sheet's "Everyone else — $0" line, which
   * reports the whole roster on every film rather than only the people who bid
   * (ADR-096). Without it the sheet can say who bid but not who passed, and
   * "everyone else" is the line that closes the picture.
   */
  rosterSize: number;
  // REMOVED 2026-08-12: `sheetStatus` (ADR-113). It carried the one thing no
  // per-film amount could — "has not bid yet" versus "chose not to bid" — and
  // ADR-109 took that job away from it: saving writes a $0 row for every film
  // on the slate, so a saved slate of zeros IS the choice not to play. Its two
  // readers were both in the week side panel ADR-108 deleted, so it was being
  // fetched once per week-board render for nobody.
};

export async function getWeekBoard(
  supabase: SupabaseClient,
  weekId: string,
  seasonId: string,
  seasonMemberId: string
): Promise<WeekBoard | null> {
  const [week, films, config, remaining] = await Promise.all([
    getWeek(supabase, weekId),
    getFilms(supabase, weekId),
    getSettingsForSeason(supabase, seasonId),
    getRemainingBudget(supabase, seasonMemberId),
  ]);

  // A week from another season is a URL someone typed. A DRAFT week used to be
  // refused here too, but the season-setup rework lists pending weeks to
  // players, so refusing would 404 a link the season page itself renders. A
  // pending week is readable and simply not biddable — `pending` below is what
  // keeps the page from describing it in bidding language.
  if (!week || week.season_id !== seasonId) return null;

  // `open` is the week's STATUS. `biddable` is whether a bid would actually be
  // accepted, which is not the same thing for the sliver between deadline and
  // the automation's next tick (a minute at most): the deadline does not close
  // the week, the pg_cron job does. Through that window the RPCs already
  // refuse while the status still says open, so the UI has to ask the narrower
  // question or it offers a control the database will reject.
  const open = week.status === "open";
  const deadlinePassed =
    week.bid_deadline !== null && new Date(week.bid_deadline) <= new Date();
  const biddable = open && !deadlinePassed;
  const pending = week.status === "draft";
  const filmIds = films.map((f) => f.id);

  // The same status-dependent split the hub makes: participation while open,
  // real bids once closed. Asking for amounts on an open week wouldn't leak
  // (RLS withholds them) but the empty result would read as "nobody bid"
  // rather than "sealed".
  const [myBids, revealed, overrides, roster] = await Promise.all([
    getMyBids(supabase, filmIds, seasonMemberId),
    open ? Promise.resolve([]) : getRevealedBids(supabase, filmIds),
    // ADR-060: every commissioner correction made to this week. Fetched
    // unconditionally rather than gated on status — the RPCs can only write
    // one on a week past the reveal, so an open week returns nothing on its
    // own, and a gate here would just be a second place to get that wrong.
    getWeekOverrides(supabase, weekId),
    // `head: true` — the rows are never read, only counted, so this asks the
    // database for a number rather than a roster it would then discard.
    supabase
      .from("season_members")
      .select("id", { count: "exact", head: true })
      .eq("season_id", seasonId)
      .then((r) => r.count ?? 0),
  ]);

  // The cached Tomatometers (ADR-062), keyed by imdb_id so a film on four
  // leagues' slates is looked up once. This is THE surface the live score is
  // for: the week board is what a player opens on the Monday after their films
  // opened, and until the commissioner captures, every score here was a dash.
  const imdbIds = [...new Set(films.map((f) => f.imdb_id).filter(Boolean))] as string[];
  const { data: ratingRows } = imdbIds.length
    ? await supabase.from("film_ratings").select("imdb_id, tomatometer").in("imdb_id", imdbIds)
    : { data: [] };
  const liveRating = new Map(
    ((ratingRows ?? []) as { imdb_id: string; tomatometer: number | null }[])
      .filter((r) => r.tomatometer !== null)
      .map((r) => [r.imdb_id, r.tomatometer as number])
  );

  const bidByFilm = new Map(myBids.map((b) => [b.film_id, b.amount]));
  const wonFilmIds = new Set(
    revealed
      .filter((b) => b.is_winning && b.member.id === seasonMemberId)
      .map((b) => b.film_id)
  );

  const build = (f: Film): BoardFilm => {
    const myBid = bidByFilm.get(f.id) ?? null;
    return {
      ...f,
      myBid,
      detail: buildFilmDetail({
        film: {
          ...f,
          weekNumber: week.number,
          weekOf: week.week_of,
          openingDate: week.opening_date,
          weekStatus: week.status,
        },
        config,
        myBid,
        iOwn: wonFilmIds.has(f.id),
        seasonMemberId,
        liveTomatometer: f.imdb_id ? (liveRating.get(f.imdb_id) ?? null) : null,
        revealed,
      }),
    };
  };

  return {
    week,
    open,
    biddable,
    deadlinePassed,
    pending,
    bankroll: config?.fake_bankroll ?? null,
    minBid: config?.min_bid ?? 1,
    remaining,
    // Exposure counts only ACTIVE films: a removed film's bids are refunded, so
    // counting them would understate what the player has left to spend.
    exposure: films
      .filter((f) => f.status === "active")
      .reduce((sum, f) => sum + (bidByFilm.get(f.id) ?? 0), 0),
    slate: films.filter((f) => f.status === "active").map(build),
    removed: films.filter((f) => f.status === "removed").map(build),
    overrides,
    rosterSize: roster,
  };
}

/** ADR-060: what a commissioner corrected on this week, and why.
 *
 *  Read through an RPC rather than from `audit_log` directly — that table is
 *  deny-all with zero policies (ADR-054) and stays that way. The RPC returns a
 *  trimmed `detail`, so adding a field to an override's audit payload cannot
 *  publish it here by accident. */
export type WeekOverride = {
  /** audit_log.id is a bigint identity — the RPC returns it as a number. */
  id: number;
  action: "override_bid_amount" | "override_film_score" | "remove_film";
  at: string;
  /** ADR-082: the account that made the correction. */
  actorId: string | null;
  actorName: string | null;
  title: string | null;
  old: unknown;
  new: unknown;
  reason: string | null;
};

async function getWeekOverrides(
  supabase: SupabaseClient,
  weekId: string
): Promise<WeekOverride[]> {
  const { data } = await supabase.rpc("get_week_overrides", {
    p_week_id: weekId,
  });
  return ((data ?? []) as RawOverrideRow[]).map((r) => ({
    id: r.id,
    action: r.action as WeekOverride["action"],
    at: r.at,
    actorId: r.actor_id,
    actorName: r.actor_name,
    title: r.title,
    old: r.detail?.old ?? null,
    new: r.detail?.new ?? null,
    reason: r.detail?.reason ?? null,
  }));
}

type RawOverrideRow = {
  id: number;
  action: string;
  at: string;
  actor_id: string | null;
  actor_name: string | null;
  title: string | null;
  detail: { old?: unknown; new?: unknown; reason?: string } | null;
};
