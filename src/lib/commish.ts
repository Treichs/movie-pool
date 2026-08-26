import type { SupabaseClient } from "@/lib/supabase";
import { resultsAreOpen, resultsOpenOn } from "@/lib/week-status";

// Row shapes for the commissioner pages. These mirror the phase 1 schema —
// keep in sync with supabase/migrations/ if columns change.

// ADR-078: settings are frozen per SEASON at creation. This shape is the
// effective settings for a season, returned by settings_for_season — the league
// itself keeps only league_type. Eligibility (include_limited_releases) and the
// box-office capture window (box_office_days) were dropped: eligibility is now a
// per-film call the commissioner makes at settlement, not a rule.
export type LeagueSettings = {
  league_id: string;
  league_type: "cash" | "practice";
  default_season_length: number;
  fake_bankroll: number;
  top_n_distinct: number;
  min_bid: number;
  side_bets_enabled: boolean;
  buy_in: number;
  /** The league's one piece of week timing (ADR-056/058). ISO weekday, 1 = Monday. */
  bids_due_dow: number;
  bids_due_time: string;
  bids_due_tz: string;
  /** Percentages throughout except buy_in, which is the only dollar figure
   *  (20260804040000). first_pct/second_pct are percent of the REMAINDER left
   *  after third place and the efficiency prize come out of the pot, which is
   *  why they still have to total 100. efficiency_prize and dessert_penalty
   *  are percent OF THE POT. */
  payout_structure: {
    first_pct?: number;
    second_pct?: number;
    /** "buy_in_refund" (one buy-in back, the historical rule) or "custom". */
    third?: string;
    /** Only read when `third` is "custom". */
    third_pct?: number;
    efficiency_prize?: number;
    dessert_penalty?: number;
  };
};

// ADR-070: named for WHO ACTS, so the union reads as the state machine it is.
//
//   draft  -> open     the clock (Monday 12am, the week before)
//   open   -> closed   the clock (the league's bids-due moment) — and closing
//                      decides winners in the same act, which is why there is
//                      no separate "resolved"
//   closed -> final    THE COMMISSIONER, refused until every film has both
//                      an opening box office and a Tomatometer
//   draft  -> skipped  THE COMMISSIONER (ADR-069), a weekend with no slate
//
// The database enum still carries a dead `locked` label — Postgres cannot drop
// an enum value — but nothing writes it and no row holds it, so it is
// deliberately absent here.
export type WeekStatus = "draft" | "open" | "closed" | "final" | "skipped";

export type Week = {
  id: string;
  number: number;
  opening_date: string;
  /** The Monday of this week's Mon-Sun range — generated, never written
   *  (ADR-042). This, not opening_date, is what players are shown. */
  week_of: string;
  /** The EFFECTIVE bids-due moment: the override when one is set, else the
   *  league default for this week. Materialised by sync_week_deadlines. */
  bid_deadline: string | null;
  /** Set only when a commissioner pinned this week's deadline by hand. Null
   *  means it follows the league default and moves when that default does. */
  bid_deadline_override: string | null;
  status: WeekStatus;
};

// The single film column list. It lived verbatim in TWO places (here and
// season-hub's getFilmsForWeeks) and every new column had to be added to both
// by hand — a drift generator, and one that T5 is about to walk into when it
// adds tmdb_id plus a film_catalog embed. One definition, two shapes.
// Written as single literals, NOT concatenation: postgrest-js infers the row
// type from the literal text of the select string, so a built-up `string`
// collapses the result to GenericStringError[] and the cast stops type-checking
// anything. Keep both on one line each, and keep them in step.
// `catalog:film_catalog(...)` resolves through the films.tmdb_id foreign key
// added at T2, and film_catalog's `using (true)` select policy is what makes it
// readable by every member. The embed is null for manually-added films, which
// have no catalog row and never will — that is ADR-002's fallback path, not a
// gap to backfill.
export const FILM_COLUMNS =
  "id, title, imdb_id, tmdb_id, release_date, eligible, status, removed_reason, box_office_m, tomatometer, score, captured_at, catalog:film_catalog(poster_path, backdrop_path, overview, tagline, certification, runtime_min, release_date_us_wide, trailer_youtube_key)" as const;

/** The same list plus week_id, for callers that fetch across several weeks. */
export const FILM_COLUMNS_WITH_WEEK =
  "id, week_id, title, imdb_id, tmdb_id, release_date, eligible, status, removed_reason, box_office_m, tomatometer, score, captured_at, catalog:film_catalog(poster_path, backdrop_path, overview, tagline, certification, runtime_min, release_date_us_wide, trailer_youtube_key)" as const;

/** The slice of film_catalog the app renders. Null for a manually-added film. */
export type FilmCatalog = {
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string | null;
  tagline: string | null;
  certification: string | null;
  runtime_min: number | null;
  release_date_us_wide: string | null;
  trailer_youtube_key: string | null;
};

export type Film = {
  id: string;
  title: string;
  imdb_id: string | null;
  tmdb_id: number | null;
  /** The film's own US wide-release date (ADR-042); null for manual films. */
  release_date: string | null;
  catalog: FilmCatalog | null;
  eligible: boolean;
  status: "active" | "removed";
  removed_reason: string | null;
  box_office_m: number | null;
  tomatometer: number | null;
  score: number | null; // generated: round(box_office_m × tomatometer / 100, 2)
  captured_at: string | null;
};

/** The league settings governing a season (ADR-059) — one RPC, the join
 *  stated once in the database rather than re-derived per caller. */
export async function getSettingsForSeason(
  supabase: SupabaseClient,
  seasonId: string
): Promise<LeagueSettings | null> {
  const { data } = await supabase.rpc("settings_for_season", {
    p_season_id: seasonId,
  });
  // A composite return arrives as an object; a missing season as null.
  const row = data as LeagueSettings | null;
  return row?.league_id ? row : null;
}

/** The league a season belongs to. `requireCommissionerOf` hands back the
 *  season itself but not its league, and the setup page needs both — to name
 *  where the rules came from, and to have somewhere to return to on discard. */
export async function getSeasonLeague(
  supabase: SupabaseClient,
  seasonId: string
): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase
    .from("seasons")
    .select("league:leagues(id, name)")
    .eq("id", seasonId)
    .maybeSingle();
  const league = (data as { league?: { id: string; name: string } } | null)?.league;
  return league ?? null;
}

export async function getWeeks(
  supabase: SupabaseClient,
  seasonId: string
): Promise<Week[]> {
  const { data } = await supabase
    .from("weeks")
    .select("id, number, opening_date, week_of, bid_deadline, bid_deadline_override, status")
    .eq("season_id", seasonId)
    .order("number", { ascending: true });
  return (data ?? []) as Week[];
}

export async function getWeek(
  supabase: SupabaseClient,
  weekId: string
): Promise<(Week & { season_id: string }) | null> {
  const { data } = await supabase
    .from("weeks")
    .select("id, season_id, number, opening_date, week_of, bid_deadline, bid_deadline_override, status")
    .eq("id", weekId)
    .single();
  return data as (Week & { season_id: string }) | null;
}

export async function getFilms(
  supabase: SupabaseClient,
  weekId: string
): Promise<Film[]> {
  const { data } = await supabase
    .from("films")
    .select(FILM_COLUMNS)
    .eq("week_id", weekId)
    .order("created_at", { ascending: true });
  // Through `unknown` on purpose — BUT NOT FOR THE REASON THIS COMMENT USED TO
  // GIVE. It said postgrest-js "infers an embed's cardinality from generated
  // database types, which this repo does not have", so `catalog` came back
  // typed as an ARRAY. That stopped being true at Task 5: the generated types
  // live at src/infrastructure/schema/database.types.ts, and Task 17 measured
  // the same embed from src/orchestration/read/week-bid.ts — it resolves to a
  // single nullable object through the films.tmdb_id foreign key, no cast
  // needed. What still needs the cast is the HAND-WRITTEN `Film` type above,
  // which names a subset of columns in its own order and is not the generated
  // row. Deleting the cast means deleting `Film`, which has 26 importers; that
  // is phase 4's re-filing job, not a comment's. The runtime shape is asserted
  // against the live API in scripts/film-catalog-spike.mts either way.
  return (data ?? []) as unknown as Film[];
}

// ADR-056 removed late offers along with the window they lived in: the bid
// deadline is now the close, so there is no interval in which a bid can arrive
// late. `LateOffer` / `getLateOffers` were deleted with the RPCs behind them.

/**
 * How many ACTIVE films sit on each of these weeks, keyed by week id.
 *
 * Lives here rather than inline on the commissioner page for the L1 layer
 * rule: queries belong to the data layer. Returns an empty map for a season
 * with no weeks rather than sending an empty `in` list.
 */
export async function getFilmCountsByWeek(
  supabase: SupabaseClient,
  weekIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (weekIds.length === 0) return counts;
  const { data } = await supabase
    .from("films")
    .select("week_id")
    .in("week_id", weekIds)
    .eq("status", "active");
  for (const f of (data ?? []) as { week_id: string }[]) {
    counts.set(f.week_id, (counts.get(f.week_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * A week whose results are overdue: the opening weekend is behind us, the week
 * is not finished, and films on it still have no captured score.
 *
 * WHY THIS EXISTS (2026-08-07). The commissioner is the only person who can
 * turn a weekend into points, and nothing in the app ever told them a week was
 * waiting. Every other prompt in the portal is something they went looking for;
 * a week whose results are open and uncaptured is the one thing with a queue
 * behind it — until it is captured, standings are wrong for everybody, the
 * season cannot be completed, and the settlement cannot be finalized.
 *
 * It replaces a worse idea. The developer asked for a background job to refresh
 * Tomatometers on already-picked films, which ADR-041 forbids: the Tomatometer
 * is a SCORING INPUT frozen at capture, and refreshing it would silently
 * rewrite points on scored films all season. The real gap was never a stale
 * score — it was a capture that had not happened yet, which is this.
 */
export type OverdueWeek = {
  id: string;
  number: number;
  week_of: string;
  /** The Monday results opened — how overdue this is, in the reader's terms. */
  resultsOpenedOn: string;
  /** Eligible films with no captured_at. The count that is actually blocking. */
  uncaptured: number;
  /** Eligible films on the week, so "3 of 8" reads honestly. */
  eligible: number;
};

export async function getOverdueWeeks(
  supabase: SupabaseClient,
  seasonId: string,
): Promise<OverdueWeek[]> {
  const weeks = await getWeeks(supabase, seasonId);

  // `final` is done and `skipped` is a week the commissioner declared had no
  // releases — neither is waiting on anybody. Everything else whose opening
  // weekend has passed is fair game, including a week still marked `open`:
  // that combination is itself worth surfacing, because a week taking bids
  // after its films have opened is a deadline that did not fire.
  const candidates = weeks.filter(
    (w) =>
      w.status !== "final" &&
      w.status !== "skipped" &&
      resultsAreOpen(w.week_of),
  );
  if (candidates.length === 0) return [];

  const rows = await Promise.all(
    candidates.map(async (week) => {
      const films = await getFilms(supabase, week.id);
      // ELIGIBLE films only. An ineligible one scores for nobody (the rulebook's
      // removal rule), so it is never going to be captured and counting it
      // would make a finished week look permanently overdue.
      const eligible = films.filter((f) => f.status === "active" && f.eligible);
      const uncaptured = eligible.filter((f) => f.captured_at === null).length;
      return {
        id: week.id,
        number: week.number,
        week_of: week.week_of,
        resultsOpenedOn: resultsOpenOn(week.week_of),
        uncaptured,
        eligible: eligible.length,
      };
    }),
  );

  // A week with nothing left to capture is not overdue, whatever its status —
  // it is a week waiting on the commissioner to press Finish, which the
  // "Finishing the season" section already says.
  return rows.filter((r) => r.uncaptured > 0);
}
