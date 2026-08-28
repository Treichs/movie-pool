import { getMemberships } from "@/lib/auth";
import { getMyInvites } from "@/lib/invites";
import type { NavLeague } from "@/lib/nav";
import type { SupabaseClient } from "@/lib/supabase";

/**
 * WHAT THE BELL MEANS: things waiting on YOU, not news.
 *
 * There is no notification store in this database and no read state on
 * `league_announcements` — checked against all 114 migrations on 2026-08-28,
 * after an earlier note claimed otherwise. `api/cron/notify` sends its four
 * emails and keeps no row a page could read, so a bell built on "what has
 * happened" would need a table nobody has designed.
 *
 * What the schema DOES answer is "what is unfinished", and that is the better
 * bell anyway: an invitation you have not answered, and an open week you have
 * not bid in. Both are actions only the viewer can take, and the second is the
 * only thing in this app with a clock on it.
 *
 * Announcements join this list the day someone adds a `read_at` — that is a
 * migration and a decision, not a line of UI.
 */
export type ShellAlert = {
  /** Stable across renders: the invite row's id, or the week's. */
  id: string;
  kind: "invite" | "unbid-week";
  title: string;
  detail: string;
  href: string;
};

export async function getShellAlerts(
  supabase: SupabaseClient,
  userId: string,
  leagues: NavLeague[]
): Promise<ShellAlert[]> {
  const alerts: ShellAlert[] = [];

  // The invite RPC swallows its own errors and returns [] — an accessory to
  // the frame must never be the reason the frame fails to render.
  for (const invite of await getMyInvites(supabase)) {
    alerts.push({
      id: invite.id,
      kind: "invite",
      title: `${invite.leagueName} invited you`,
      detail: `From ${invite.invitedBy}`,
      // NOT `/join/[token]`: the token is in the emailed link and this read
      // does not carry it. `/home` is where an invite is accepted in the app.
      href: "/home",
    });
  }

  // COSTED DELIBERATELY. Two queries, and only when a league actually has an
  // open week — between weeks this whole block is skipped, which is most of
  // the calendar. `getNavLeagues` already fetched the open weeks for the
  // countdown, so this adds the bid check and nothing else.
  const openWeeks = leagues.flatMap((league) =>
    league.openWeek ? [{ league, week: league.openWeek }] : []
  );
  if (openWeeks.length === 0) return alerts;

  const memberships = await getMemberships(supabase, userId);
  const memberIdBySeason = new Map(memberships.map((m) => [m.season.id, m.id]));
  const memberIds = openWeeks
    .map(({ week }) => memberIdBySeason.get(week.seasonId))
    .filter((id): id is string => id !== undefined);
  if (memberIds.length === 0) return alerts;

  const weekIds = openWeeks.map(({ week }) => week.id);
  const { data: filmRows } = await supabase
    .from("films")
    .select("id, week_id")
    .in("week_id", weekIds);
  const films = filmRows ?? [];
  if (films.length === 0) return alerts;

  // A bid is keyed by film, not by week — `bids.week_id` does not exist — so
  // the week a bid belongs to is resolved through its film.
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

  for (const { league, week } of openWeeks) {
    if (weeksBidIn.has(week.id)) continue;
    alerts.push({
      id: week.id,
      kind: "unbid-week",
      title: `Week ${String(week.number).padStart(2, "0")} is taking bids`,
      detail: `${league.name} — you have not bid yet`,
      href: `/season/${week.seasonId}/weeks/${week.id}/bid`,
    });
  }

  return alerts;
}
