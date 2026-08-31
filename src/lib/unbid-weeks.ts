import { getMemberships } from "@/lib/auth";
import type { NavLeague } from "@/lib/nav";
import type { SupabaseClient } from "@/lib/supabase";

/**
 * WHICH OPEN WEEKS IS THIS PLAYER STILL OWING A BID IN?
 *
 * Lifted out of `shell-alerts.ts` on 2026-08-31, when Home needed the same
 * answer. Two surfaces now ask it — the bell, and the league row on `/leagues`
 * — and the whole point of one function is that they cannot disagree. A bell
 * saying "waiting on you" beside a row that looks settled is worse than either
 * alone, and that is exactly what two copies of this query would drift into.
 *
 * ── COSTED, AND SKIPPED ENTIRELY BETWEEN WEEKS ────────────────────────────
 * Three queries, and only when some league actually has an open week — which
 * is a minority of the calendar. `getNavLeagues` has already fetched the open
 * weeks for the countdown, so this adds the membership, film and bid reads and
 * nothing else. With no open week it returns an empty set without touching the
 * database.
 *
 * ── A BID IS KEYED BY FILM, NOT BY WEEK ───────────────────────────────────
 * `bids.week_id` does not exist, so the week a bid belongs to is resolved
 * through its film. That indirection is the reason this is three queries rather
 * than one, and the reason it is worth having in a single place.
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
  const memberIds = openWeeks
    .map(({ week }) => memberIdBySeason.get(week.seasonId))
    .filter((id): id is string => id !== undefined);
  if (memberIds.length === 0) return new Set();

  const weekIds = openWeeks.map(({ week }) => week.id);
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
    .in("season_member_id", memberIds)
    .in(
      "film_id",
      films.map((f) => f.id)
    );
  const weekByFilm = new Map(films.map((f) => [f.id, f.week_id]));
  const weeksBidIn = new Set((bidRows ?? []).map((b) => weekByFilm.get(b.film_id)));

  return new Set(
    openWeeks
      .filter(({ week }) => !weeksBidIn.has(week.id))
      .map(({ week }) => week.id)
  );
}
