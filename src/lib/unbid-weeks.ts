import { getMemberships } from "@/lib/auth";
import type { NavLeague } from "@/lib/nav";
import type { SupabaseClient } from "@/lib/supabase";

/**
 * WHICH OPEN WEEKS IS THIS PLAYER STILL OWING A BID IN?
 *
 * Lifted out of `shell-alerts.ts` on 2026-08-31, when Home needed the same
 * answer. Three surfaces now ask it — the bell, the league row on `/leagues`,
 * and the open-week call to action on League Home — and the whole point of one
 * function is that they cannot disagree. A bell saying "waiting on you" beside
 * a row that looks settled is worse than either alone, and that is exactly what
 * two copies of this query would drift into.
 *
 * ── COSTED, AND SKIPPED ENTIRELY WHEN THERE IS NOTHING OPEN ───────────────
 * Two queries plus the membership read, and only when some week is actually
 * open — which is a minority of the calendar. With nothing open it returns an
 * empty set without touching the database.
 *
 * ── A BID IS KEYED BY FILM, NOT BY WEEK ───────────────────────────────────
 * `bids.week_id` does not exist, so the week a bid belongs to is resolved
 * through its film. That indirection is the reason this is two queries rather
 * than one, and the reason it is worth having in a single place.
 */
export async function getWeeksWithoutBids(
  supabase: SupabaseClient,
  pairs: { weekId: string; seasonMemberId: string }[]
): Promise<Set<string>> {
  if (pairs.length === 0) return new Set();

  const weekIds = pairs.map((p) => p.weekId);
  const { data: filmRows } = await supabase
    .from("films")
    .select("id, week_id")
    .in("week_id", weekIds);
  const films = filmRows ?? [];
  // NO FILMS MEANS NOTHING TO BID ON, so nothing is owed — an open week whose
  // slate the commissioner has not built yet must not read as the player's
  // debt.
  if (films.length === 0) return new Set();

  const { data: bidRows } = await supabase
    .from("bids")
    .select("film_id")
    .in("season_member_id", [...new Set(pairs.map((p) => p.seasonMemberId))])
    .in(
      "film_id",
      films.map((f) => f.id)
    );
  const weekByFilm = new Map(films.map((f) => [f.id, f.week_id]));
  const weeksBidIn = new Set((bidRows ?? []).map((b) => weekByFilm.get(b.film_id)));

  return new Set(weekIds.filter((id) => !weeksBidIn.has(id)));
}

/**
 * The same answer for the shell, which asks it across every league at once and
 * has to resolve each open week's season to the viewer's member row first.
 */
export async function getWeeksAwaitingBid(
  supabase: SupabaseClient,
  userId: string,
  leagues: NavLeague[]
): Promise<Set<string>> {
  const openWeeks = leagues.flatMap((league) =>
    league.openWeek ? [{ league, week: league.openWeek }] : []
  );
  if (openWeeks.length === 0) return new Set();

  const memberships = await getMemberships(supabase, userId);
  const memberIdBySeason = new Map(memberships.map((m) => [m.season.id, m.id]));

  return getWeeksWithoutBids(
    supabase,
    openWeeks.flatMap(({ week }) => {
      const seasonMemberId = memberIdBySeason.get(week.seasonId);
      return seasonMemberId ? [{ weekId: week.id, seasonMemberId }] : [];
    })
  );
}

/**
 * WHICH OPEN WEEK THE CALL TO ACTION POINTS AT — one rule, so League Home and
 * Season Home cannot send the same player to two different weeks.
 *
 * THE EARLIEST WEEK YOU HAVE NOT BID IN, and only the earliest open week when
 * you have bid in all of them. Two weeks can be open at once (`league.ts`), and
 * every surface used to point at the earliest regardless: a player who had bid
 * in week 3 and not in week 4 was sent back to week 3, which is a page telling
 * them they are done when they are not.
 *
 * THE FALLBACK IS NOT NULL, deliberately. When every open week is settled the
 * control stays, changes to "Review your bids", and points at the earliest —
 * a bid is editable until the deadline, so "done" is a state to show, not a
 * reason to take the way back away.
 *
 * `weeks` is assumed ordered by number, which is how every composer in this app
 * returns them; `hasBid` is therefore "you have bid in every open week".
 */
export function pickBidTarget<W extends { id: string }>(
  openWeeks: W[],
  awaitingBid: Set<string>
): { week: W; hasBid: boolean } | null {
  if (openWeeks.length === 0) return null;
  const unbid = openWeeks.find((w) => awaitingBid.has(w.id));
  return unbid ? { week: unbid, hasBid: false } : { week: openWeeks[0], hasBid: true };
}
