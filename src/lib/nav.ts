import type { SupabaseClient } from "@/lib/supabase";

// Navigation data for the app shell (ADR-023: vertical sidebar, league-switcher
// model — one league in focus at a time, the rest reachable via the switcher).
//
// The sidebar needs every league the user belongs to AND each league's current
// season, because the season-scoped nav items (season home, leaderboard,
// schedule) hang off the focused league's active season. A user belongs to a
// handful of leagues, so fetching all of them up front is cheaper than a
// round-trip per switch.

export type NavSeason = {
  id: string;
  name: string;
  status: "draft" | "active" | "completed" | "archived";
  /** ADR-099: the season's rank within its league by earliest week — derived by
   *  v_seasons, never stored. Null for a season with no weeks yet, which is
   *  how a freshly created draft reads until its schedule is laid out. This is
   *  the ordering key for "most recent"; there is no season start date to sort
   *  on, and created_at would order by when a commissioner happened to click
   *  rather than by when the season is played. */
  number: number | null;
};

export type NavLeague = {
  id: string;
  name: string;
  // ADR-020: a league has at most one active season. Null during the gap
  // between seasons, which the sidebar renders as an honest empty state
  // rather than dead links.
  currentSeason: NavSeason | null;
  // Every season id in the league — lets the client resolve "which league am I
  // looking at?" from a /season/[id] URL without another query.
  seasonIds: string[];
  // The league's chosen avatar (2026-08-03), same storage shape as a player's.
  // Null means none was chosen, and the rail falls back to the first letter —
  // which is what every league created before this looks like.
  avatarPair: number | null;
  avatarGlyph: string | null;
  /** Whether the VIEWER commissions this league — free with the membership row
   *  this query already reads. The mobile drawer's Commissioner entry hangs
   *  off it (2026-08-08 nav pass): without it, a phone had no route into the
   *  commissioner tools at all except by landing on the league page first. */
  isCommissioner: boolean;
  /** THE CURRENT WEEK — the earliest still-open week of the current season, or
   *  null when nothing is taking bids.
   *
   *  "Earliest open" is what current means everywhere now: the 2026-08-03
   *  timing rule lets two weeks take bids at once, and the earlier one is the
   *  one whose deadline is actually approaching.
   *
   *  Lives here since CH-01-e because the nav shows a live countdown to it on
   *  every page, and a countdown cannot be lazy — it is the one thing in the
   *  bar that has to be right before you click anything. getHomeLeagues used to
   *  compute this itself; it now reads this field, so there is one
   *  implementation rather than two that can disagree about "current". */
  openWeek: NavOpenWeek | null;
};

export type NavOpenWeek = {
  id: string;
  number: number;
  seasonId: string;
  /** Null when the commissioner has not set one — the countdown renders nothing
   *  rather than counting to an invented moment. */
  bidDeadline: string | null;
};

type LeagueMemberRow = {
  role?: string | null;
  league: {
    id: string;
    name: string;
    /** Optional: absent on the pre-migration fallback select. */
    avatar_pair?: number | null;
    avatar_glyph?: string | null;
    seasons: NavSeason[] | null;
  } | null;
};

export async function getNavLeagues(
  supabase: SupabaseClient,
  userId: string
): Promise<NavLeague[]> {
  // seasons:v_seasons — the ADR-099 read model; season names AND numbers are
  // derived there. `number` is read because CH-01 makes the nav land on the
  // most recent season open or closed, and the number is the only honest
  // ordering: it ranks by earliest week, which is when the season is actually
  // played.
  const BASE = "id, name, seasons:v_seasons(id, name, status, number)";
  const WITH_AVATAR =
    "id, name, avatar_pair, avatar_glyph, seasons:v_seasons(id, name, status, number)";

  const query = (columns: string) =>
    supabase
      .from("league_members")
      .select(`role, league:leagues(${columns})`)
      .eq("profile_id", userId)
      .order("created_at", { ascending: true });

  let { data, error } = await query(WITH_AVATAR);

  // DEPLOY-WINDOW FALLBACK, and it is here because the silent version of this
  // cost a live outage on 2026-08-03.
  //
  // The avatar columns arrive in migration 20260803060000. Between the app
  // deploying and that migration being applied, PostgREST rejects the whole
  // select with 42703 — and because this helper returned `data ?? []`, the
  // result was not an error but an EMPTY LEAGUE LIST. Every member saw their
  // leagues vanish from the sidebar on every page, with nothing to say why.
  //
  // The avatar is decoration; the league list is the navigation. Losing the
  // second because the first is not ready yet is never the right trade, so a
  // failure retries without the decorative columns. Delete this once the
  // migration is applied everywhere — it is a bridge, not a design.
  if (error) {
    ({ data, error } = await query(BASE));
    if (error) return [];
  }

  const rows = (data ?? []) as unknown as LeagueMemberRow[];

  const leagues = rows.flatMap((row) => {
    if (!row.league) return [];
    const seasons = row.league.seasons ?? [];
    return [
      {
        id: row.league.id,
        name: row.league.name,
        currentSeason: pickCurrentSeason(seasons),
        seasonIds: seasons.map((s) => s.id),
        // `?? null` rather than a bare read: on the fallback path these keys
        // are absent from the row entirely, not null.
        avatarPair: row.league.avatar_pair ?? null,
        avatarGlyph: row.league.avatar_glyph ?? null,
        isCommissioner: row.role === "commissioner",
        openWeek: null as NavOpenWeek | null,
      },
    ];
  });

  // ONE EXTRA QUERY, and the nav countdown is why it cannot be lazy: the bar
  // shows a live deadline on every page, so the answer has to be in hand before
  // the first paint. Scoped to the current seasons only, RLS-filtered to the
  // viewer's own leagues, and a handful of rows at most.
  const seasonIds = leagues.flatMap((l) => (l.currentSeason ? [l.currentSeason.id] : []));
  if (seasonIds.length === 0) return leagues;

  const { data: weekRows } = await supabase
    .from("weeks")
    .select("id, season_id, number, bid_deadline")
    .in("season_id", seasonIds)
    .eq("status", "open")
    // Ascending, so the FIRST row per season is the earliest open week — which
    // is what "current" means. Two weeks can be open at once (2026-08-03).
    .order("number", { ascending: true });

  const earliest = new Map<string, NavOpenWeek>();
  for (const w of (weekRows ?? []) as {
    id: string;
    season_id: string;
    number: number;
    bid_deadline: string | null;
  }[]) {
    if (earliest.has(w.season_id)) continue;
    earliest.set(w.season_id, {
      id: w.id,
      number: w.number,
      seasonId: w.season_id,
      bidDeadline: w.bid_deadline,
    });
  }

  for (const l of leagues) {
    l.openWeek = l.currentSeason ? earliest.get(l.currentSeason.id) ?? null : null;
  }

  return leagues;
}

/**
 * Where a league's front door is: its current season, or the league page when
 * it has never run one.
 *
 * Exists so that "land on the league's current season" has ONE implementation.
 * CH-01 made the nav's Home mean this, and accepting an invitation now means it
 * too — a second copy of the rule would drift the moment either changed, and
 * the rule is subtle enough (see pickCurrentSeason below) that the drift would
 * not be obvious.
 *
 * Reads v_seasons directly rather than going through getNavLeagues: the caller
 * already knows which league, and getNavLeagues fetches every league the user
 * belongs to plus avatars, which is a lot of query for one redirect.
 */
export async function leagueLandingPath(
  supabase: SupabaseClient,
  leagueId: string
): Promise<string> {
  const { data, error } = await supabase
    .from("v_seasons")
    .select("id, name, status, number")
    .eq("league_id", leagueId);

  // A failed read must not swallow the redirect — the league page is always a
  // valid destination, so fall back rather than throwing the caller away.
  if (error) return `/league/${leagueId}`;

  const season = pickCurrentSeason((data ?? []) as NavSeason[]);
  return season ? `/season/${season.id}` : `/league/${leagueId}`;
}

// "Current" is the season the nav lands on — CH-01 makes it Home.
//
// THE RULE CHANGED 2026-08-17. It used to be `active ?? draft ?? null`, with
// the note "finished seasons live in the archive", and that null was a real
// hole: a league between seasons — or one whose every season has finished —
// resolved to nothing, so the nav had no Home to point at and rendered dead.
// Which is most of the year for a league that plays one season at a time.
//
// The rule is now THE MOST RECENT SEASON, OPEN OR CLOSED. The three steps
// below are that rule, not three competing preferences:
//
//  1. `active` first. ADR-020 lets a league run one season at a time, so an
//     active season IS the most recent by construction — this step is a
//     shortcut, not an exception.
//  2. `draft` next, for the same reason: a draft only exists while nothing is
//     active, and it is the one being set up, so it is the newest.
//  3. Otherwise the highest ADR-099 `number` — the genuinely most recent
//     finished season. Numberless seasons (no weeks laid out) sort last rather
//     than first: after ADR-099 only legacy rows can be in that state, so a
//     null number means old-and-incomplete, not new.
//
// Only a league that has never created a season returns null now, and that
// case is a redirect to league creation rather than a nav to render.
function pickCurrentSeason(seasons: NavSeason[]): NavSeason | null {
  const live =
    seasons.find((s) => s.status === "active") ??
    seasons.find((s) => s.status === "draft");
  if (live) return live;

  // Explicit null handling rather than coercing to -Infinity: two numberless
  // seasons would subtract to NaN, and a NaN comparator makes the sort order
  // implementation-defined. Nulls last, everything else descending.
  return (
    [...seasons].sort((a, b) => {
      if (a.number === b.number) return 0;
      if (a.number === null) return 1;
      if (b.number === null) return -1;
      return b.number - a.number;
    })[0] ?? null
  );
}
