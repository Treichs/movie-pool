import { getMyInvites } from "@/lib/invites";
import type { NavLeague } from "@/lib/nav";
import type { SupabaseClient } from "@/lib/supabase";
import { getWeeksAwaitingBid } from "@/lib/unbid-weeks";

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
      // NOT `/invites/[token]`: the token is in the emailed link and this read
      // does not carry it. `/leagues` is where an invite is accepted in the app.
      href: "/leagues",
    });
  }

  // THE QUERY LIVES IN `unbid-weeks.ts` because Home asks the same question on
  // its league rows. One implementation, so the bell and the row cannot
  // disagree about who owes a bid.
  const awaiting = await getWeeksAwaitingBid(supabase, userId, leagues);
  if (awaiting.size === 0) return alerts;

  const openWeeks = leagues.flatMap((league) =>
    league.openWeek ? [{ league, week: league.openWeek }] : []
  );

  for (const { league, week } of openWeeks) {
    if (!awaiting.has(week.id)) continue;
    alerts.push({
      id: week.id,
      kind: "unbid-week",
      title: `Week ${String(week.number).padStart(2, "0")} is taking bids`,
      detail: `${league.name} — you have not bid yet`,
      href: `/seasons/${week.seasonId}/weeks/${week.id}/bid`,
    });
  }

  return alerts;
}
