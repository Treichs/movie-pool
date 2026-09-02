import { getProfile } from "@/lib/auth";
import { getMyInvites, type MyInvite } from "@/lib/invites";
import {
  getNavLeagues,
  liveSeason,
  type NavLeague,
  type NavSeason,
} from "@/lib/nav";
import { rankBy, type StandingsRow } from "@/lib/pool";
import type { SupabaseClient } from "@/lib/supabase";
import { getWeeksAwaitingBid } from "@/lib/unbid-weeks";

// Data for `/leagues` — THE COMMAND CENTRE since ADR-443, and the signpost that
// replaced the Dashboard before that (2026-08-03).
//
// The Dashboard's job was to AGGREGATE: every league, every season, summed into
// points, money, rank, results. That was closed off deliberately and stays
// closed, because each league has its own bankroll and its own rules, so a
// combined figure means nothing.
//
// ── ONE STATISTIC CAME BACK, AND IT IS NOT THE ONE THAT WAS REMOVED ───────
// This module read "if a statistic ever appears in this file, that is the
// regression" until 2026-09-02. ADR-075 wrote that rule and drew the line
// precisely: "anything that EXPIRES helps you choose which league to open and
// is allowed; anything that does not expire and is not a name is a regression."
// It also left the door open in its own consequences — "if cross-league
// aggregation ever returns it is a fresh decision, not a Dashboard revival."
//
// That decision was made on 2026-09-02, when sign-in stopped routing past this
// page. `standing` is PER LEAGUE and PER LIVE SEASON — the viewer's dense rank
// and points inside one season, the same figure League Home shows, listed once
// per league. Nothing is summed across leagues and nothing ever will be; the
// flaw ADR-075 named was the aggregate, and there is no aggregate here. What
// changed is that a page nobody landed on could afford to answer only "where am
// I going", and the page everybody lands on cannot.
//
// ADR-075 is itself superseded (by ADR-094). Its line is quoted rather than
// obeyed because the reasoning behind it is still the best statement of what
// this page must not become.
//
// The one thing beyond a league list is STATE THAT EXPIRES: how many members,
// and when the current week's bidding closes. That is not a statistic, it is
// the thing that helps you choose which league to open first.

export type HomeLeague = NavLeague & {
  memberCount: number;
  /** The earliest still-open week's deadline, if any is taking bids. Under the
   *  2026-08-03 timing rule two weeks can be open at once, and the earliest is
   *  the one with a deadline actually approaching. */
  closesAt: string | null;
  openWeekNumber: number | null;
  /** THE ONE QUESTION A PLAYER OPENS THIS PAGE TO ANSWER, and the row could not
   *  answer it until 2026-08-31: a week is open, but have I bid in it?
   *
   *  "Bids close in 2 hours" and "bids close in 2 hours, and you have not bid"
   *  are different messages needing different actions, and the row was sending
   *  the first while the bell three inches above it knew the second. Same query
   *  as the bell now (`getWeeksAwaitingBid`), so they cannot disagree.
   *
   *  False when nothing is open — there is no debt between weeks. */
  awaitingYourBid: boolean;
  /** The viewer's place in this league's LIVE season, or null when none is
   *  running. Never a cross-league figure — see the header. */
  standing: HomeStanding | null;
};

/** One league's answer to "how am I doing", scoped to one season. Dense ranks
 *  (ADR-028), so ties share a place and the next place does not skip — the same
 *  model the settlement ledger pays on, so nobody is shown one place and paid
 *  another. */
export type HomeStanding = {
  rank: number;
  /** How many are ranked, so "3rd" can say what it is 3rd of. */
  players: number;
};

export async function getHomeLeagues(
  supabase: SupabaseClient,
  userId: string
): Promise<HomeLeague[]> {
  const leagues = await getNavLeagues(supabase, userId);
  if (leagues.length === 0) return [];

  // THE OPEN-WEEK READ MOVED TO getNavLeagues (CH-01-e). It used to be here,
  // and the nav countdown needed the same answer on every page — so rather than
  // a second query computing "earliest open week" a second way, the field comes
  // back on NavLeague and this module just reads it. Home keeps only the count,
  // which is the one thing genuinely its own.
  const countsRes = await supabase
    .from("league_members")
    .select("league_id")
    .in(
      "league_id",
      leagues.map((l) => l.id)
    );

  const counts = new Map<string, number>();
  for (const row of (countsRes.data ?? []) as { league_id: string }[]) {
    counts.set(row.league_id, (counts.get(row.league_id) ?? 0) + 1);
  }

  // Skips the database entirely between weeks — see `getWeeksAwaitingBid`.
  const [awaiting, standings] = await Promise.all([
    getWeeksAwaitingBid(supabase, userId, leagues),
    getHomeStandings(supabase, userId, leagues),
  ]);

  return leagues.map((l) => ({
    ...l,
    memberCount: counts.get(l.id) ?? 0,
    closesAt: l.openWeek?.bidDeadline ?? null,
    openWeekNumber: l.openWeek?.number ?? null,
    awaitingYourBid: l.openWeek ? awaiting.has(l.openWeek.id) : false,
    standing: standings.get(l.id) ?? null,
  }));
}

/**
 * THE VIEWER'S PLACE IN EVERY LIVE SEASON, IN ONE QUERY.
 *
 * `v_standings` carries `season_id`, so every league's season is answered by a
 * single `.in()` rather than a round trip per league. A player belongs to a
 * handful of leagues and this page is the first thing they see after signing
 * in, so the difference is the difference between one query and five.
 *
 * LIVE SEASONS ONLY, and that is ADR-075's own line rather than a shortcut: a
 * rank that can still move is state that expires, and it is why this page can
 * carry it at all. A finished season's placing never changes again — it is
 * history, it belongs in the record book, and putting it here would be the
 * Dashboard growing back one column at a time.
 *
 * Ordered by points descending for the whole set at once, which keeps each
 * season's rows in the order `rankBy` requires without sorting per season.
 * A season the viewer is not enrolled in yields no row and no standing, which
 * is the honest answer rather than a rank of last.
 */
async function getHomeStandings(
  supabase: SupabaseClient,
  userId: string,
  leagues: NavLeague[]
): Promise<Map<string, HomeStanding>> {
  const live = leagues
    .map((l) => ({ leagueId: l.id, season: liveSeason(l) }))
    .filter((x): x is { leagueId: string; season: NavSeason } => x.season !== null);
  const byLeague = new Map<string, HomeStanding>();
  if (live.length === 0) return byLeague;

  const { data } = await supabase
    .from("v_standings")
    .select("season_id, profile_id, points")
    .in(
      "season_id",
      live.map((x) => x.season.id)
    )
    .order("points", { ascending: false });

  const rows = (data ?? []) as Pick<
    StandingsRow,
    "season_id" | "profile_id" | "points"
  >[];

  const bySeason = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = bySeason.get(row.season_id);
    if (list) list.push(row);
    else bySeason.set(row.season_id, [row]);
  }

  for (const { leagueId, season } of live) {
    const seasonRows = bySeason.get(season.id);
    if (!seasonRows) continue;
    const ranked = rankBy(seasonRows, (r) => r.points);
    const mine = ranked.find(([, r]) => r.profile_id === userId);
    if (!mine) continue;
    byLeague.set(leagueId, { rank: mine[0], players: seasonRows.length });
  }

  return byLeague;
}

/** What `/leagues` renders. The invites are the only thing on the page that
 *  asks the viewer to act, which is why they are a field of their own rather
 *  than something the page fetches on the side. */
export type Home = {
  displayName: string;
  email: string;
  leagues: HomeLeague[];
  invites: MyInvite[];
};

/**
 * URGENCY ORDER, and it is the one editorial decision this module makes.
 *
 * The page answers "what needs me, and where". Alphabetical order answers
 * neither — it is a filing system, and a filing system is what the spreadsheet
 * was. So a league with bidding open sorts above one without, and among those,
 * the deadline closing soonest sorts first.
 *
 * It matters at one league as much as at five: the row that moves to the top is
 * the row that has a clock on it, and a player with a single league still needs
 * to see at a glance whether this is a week they owe something in.
 *
 * NOT SORTED BY: points, rank, or anything else a season knows. Those are
 * statistics, and this module's whole point is that it holds none — see the
 * header. Sorting by one would smuggle it in through the back door.
 */
export function byUrgency(a: HomeLeague, b: HomeLeague): number {
  const openA = a.closesAt !== null;
  const openB = b.closesAt !== null;
  if (openA !== openB) return openA ? -1 : 1;
  if (openA && openB) {
    const diff = Date.parse(a.closesAt!) - Date.parse(b.closesAt!);
    if (diff !== 0) return diff;
  }
  // Then a live season above a league between seasons or not yet started —
  // "there is something to look at" above "there is not".
  const liveA = a.currentSeason?.status === "active";
  const liveB = b.currentSeason?.status === "active";
  if (liveA !== liveB) return liveA ? -1 : 1;
  return a.name.localeCompare(b.name);
}

/** The `/leagues` composer. Three reads, all of which the shell's layout has
 *  already made for its own purposes — Next dedupes them within one render, so
 *  this costs the profile query and nothing else. */
export async function getHome(ctx: {
  supabase: SupabaseClient;
  user: { id: string; email?: string };
}): Promise<Home> {
  const [leagues, invites, profile] = await Promise.all([
    getHomeLeagues(ctx.supabase, ctx.user.id),
    getMyInvites(ctx.supabase),
    getProfile(ctx.supabase, ctx.user.id),
  ]);

  return {
    // NOT THE EMAIL. A missing profile row is an anomaly (a trigger creates one
    // on sign-up), and the fallback used to be the address — which rendered as
    // "EVENING, DEV-COMMISH@MOVIEPOOL.LOCAL" in 40px caps, the first thing on
    // the first screen after signing in. An email is an identifier, not a name;
    // "there" is a worse greeting and a better one to fail to.
    displayName: profile?.display_name ?? "there",
    email: ctx.user.email ?? "",
    leagues: [...leagues].sort(byUrgency),
    invites,
  };
}
