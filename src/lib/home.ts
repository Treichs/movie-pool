import { getProfile } from "@/lib/auth";
import { getMyInvites, type MyInvite } from "@/lib/invites";
import { getNavLeagues, type NavLeague } from "@/lib/nav";
import type { SupabaseClient } from "@/lib/supabase";
import { getWeeksAwaitingBid } from "@/lib/unbid-weeks";

// Data for HOME — the signpost that replaced the Dashboard (2026-08-03).
//
// The Dashboard's job was to aggregate: every league, every season, points,
// money, rank, results. That was closed off deliberately, because each league
// has its own bankroll and its own rules, so a combined figure means nothing.
// The player's own numbers now live on League Home, scoped to one season.
//
// So this module is deliberately THIN. It answers "where am I going", nothing
// else. If a statistic ever appears in this file, that is the regression —
// Home slowly re-accumulating the surface it replaced.
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
  /** The open week's bid page, when there is one. The row links here rather
   *  than to League Home when a bid is owed. */
  bidHref: string | null;
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
  const awaiting = await getWeeksAwaitingBid(supabase, userId, leagues);

  return leagues.map((l) => ({
    ...l,
    memberCount: counts.get(l.id) ?? 0,
    closesAt: l.openWeek?.bidDeadline ?? null,
    openWeekNumber: l.openWeek?.number ?? null,
    awaitingYourBid: l.openWeek ? awaiting.has(l.openWeek.id) : false,
    bidHref: l.openWeek
      ? `/seasons/${l.openWeek.seasonId}/weeks/${l.openWeek.id}/bid`
      : null,
  }));
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
