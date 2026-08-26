import type { SendResult } from "@/lib/email";
import type { SupabaseClient } from "@/lib/supabase";

// The data layer for scheduled notifications.
//
// This file exists to close an L1 layer leak: /api/cron/notify held seven
// `.from()` calls, which made the app's real data boundary "lib + actions +
// one route" rather than the stated one. The route now composes these helpers
// and owns only the things a route should own — the CRON_SECRET check, the
// service-role client, the Resend call and the loop.
//
// EVERY function here takes a SERVICE-ROLE client. The cron reads across every
// season and writes the email_log ledger, neither of which any user-facing
// policy allows, and that is deliberate rather than accidental — passing the
// client in keeps that fact at the call site instead of hiding it in here.

// A results email is news about last weekend. A final week whose opening date
// is older than this has nothing newsworthy left to say — it is history, and
// history must never email anyone. This is the gate the 2026-08-12 replica
// ingest proved necessary: ~170 historical weeks arrived already-final with no
// email_log rows, and "every final week, deduped only by the ledger" read all
// of them as breaking news (~1,260 attempted sends, days of Resend quota).
export const RESULTS_WINDOW_DAYS = 14;

/** The oldest opening_date (YYYY-MM-DD, UTC) the results sweep will consider. */
export function resultsWindowStart(now: Date): string {
  const start = new Date(now.getTime() - RESULTS_WINDOW_DAYS * 86_400_000);
  return start.toISOString().slice(0, 10);
}

// If one run wants to send more than this, the shape of the work is wrong —
// a real week in a real league is a handful of members, not a backlog. The
// route aborts the whole run rather than sending a partial blast.
export const MAX_SENDS_PER_RUN = 50;

export type Recipient = {
  id: string;
  email: string;
  display_name: string;
};

export type NotifiableWeek = {
  id: string;
  seasonId: string;
  number: number;
  seasonName: string;
  bidDeadline: string | null;
};

type WeekRow = {
  id: string;
  season_id: string;
  number: number;
  bid_deadline?: string | null;
  season: { name: string } | null;
};

const toWeek = (w: WeekRow): NotifiableWeek => ({
  id: w.id,
  seasonId: w.season_id,
  number: w.number,
  seasonName: w.season?.name ?? "your season",
  bidDeadline: w.bid_deadline ?? null,
});

/**
 * Open weeks that opened recently — the slate-up sweep. Window-bounded on
 * opening_date exactly like the results sweep, and for the same reason: an
 * ingested season's weeks must never read as breaking news.
 */
export async function getOpenWeeks(
  admin: SupabaseClient,
  openedOnOrAfter: string
): Promise<NotifiableWeek[]> {
  const { data } = await admin
    .from("weeks")
    .select("id, season_id, number, bid_deadline, season:v_seasons(name)")
    .eq("status", "open")
    .gte("opening_date", openedOnOrAfter);
  return ((data ?? []) as unknown as WeekRow[]).map(toWeek);
}

/**
 * Closed weeks — bidding done, sheet revealed, not yet scored. The reveal
 * sweep. A week that jumped straight to final before the sweep saw it gets
 * the scores email instead; there is no news left for this one to carry.
 */
export async function getClosedWeeks(
  admin: SupabaseClient,
  openedOnOrAfter: string
): Promise<NotifiableWeek[]> {
  const { data } = await admin
    .from("weeks")
    .select("id, season_id, number, season:v_seasons(name)")
    .eq("status", "closed")
    .gte("opening_date", openedOnOrAfter);
  return ((data ?? []) as unknown as WeekRow[]).map(toWeek);
}

/** A week's active slate, titles only — what the slate-up email lists. */
export async function getWeekFilmTitles(
  admin: SupabaseClient,
  weekId: string
): Promise<string[]> {
  const { data } = await admin
    .from("films")
    .select("title")
    .eq("week_id", weekId)
    .eq("status", "active")
    .order("title");
  return (data ?? []).map((f) => f.title as string);
}

/** Open weeks whose deadline lands inside the window — the reminder sweep. */
export async function getWeeksWithDeadlineWithin(
  admin: SupabaseClient,
  from: Date,
  to: Date
): Promise<NotifiableWeek[]> {
  const { data } = await admin
    .from("weeks")
    .select("id, season_id, number, bid_deadline, season:v_seasons(name)")
    .eq("status", "open")
    .not("bid_deadline", "is", null)
    .gte("bid_deadline", from.toISOString())
    .lte("bid_deadline", to.toISOString());
  return ((data ?? []) as unknown as WeekRow[]).map(toWeek);
}

/**
 * Final weeks that are still NEWS — opening date inside the results window.
 * The email_log dedupe stops re-sends within the window; the window itself is
 * what stops backfilled history (a replica ingest, a workbook load) from ever
 * entering the sweep, no matter what the ledger says.
 */
export async function getScoredWeeks(
  admin: SupabaseClient,
  openedOnOrAfter: string
): Promise<NotifiableWeek[]> {
  const { data } = await admin
    .from("weeks")
    .select("id, season_id, number, season:v_seasons(name)")
    .eq("status", "final")
    .gte("opening_date", openedOnOrAfter);
  return ((data ?? []) as unknown as WeekRow[]).map(toWeek);
}

/** A season's members, with the profile fields an email needs. */
export async function getSeasonRecipients(
  admin: SupabaseClient,
  seasonId: string
): Promise<{ seasonMemberId: string; profile: Recipient }[]> {
  const { data } = await admin
    .from("season_members")
    .select("id, profile:profiles(id, email, display_name)")
    .eq("season_id", seasonId);
  return ((data ?? []) as unknown as {
    id: string;
    profile: Recipient | null;
  }[])
    .filter((m) => m.profile !== null)
    .map((m) => ({ seasonMemberId: m.id, profile: m.profile! }));
}

/**
 * Season members who have already bid on a week's ACTIVE films.
 *
 * Reads amounts' rows but not amounts — only `season_member_id` — so the
 * reminder sweep never has to touch a sealed bid value to know who to leave
 * alone (ADR-022).
 */
export async function getMembersWhoBid(
  admin: SupabaseClient,
  weekId: string
): Promise<Set<string>> {
  const { data } = await admin
    .from("bids")
    .select("season_member_id, film:films!inner(week_id, status)")
    .eq("film.week_id", weekId)
    .eq("film.status", "active");
  return new Set((data ?? []).map((b) => b.season_member_id as string));
}

/** Profile ids already emailed for this (week, kind) — the dedupe ledger. */
export async function getAlreadyEmailed(
  admin: SupabaseClient,
  weekId: string,
  kind: string
): Promise<Set<string>> {
  const { data } = await admin
    .from("email_log")
    .select("profile_id")
    .eq("week_id", weekId)
    .eq("kind", kind)
    .eq("status", "sent");
  return new Set((data ?? []).map((r) => r.profile_id as string));
}

/**
 * The ledger has two statuses and the CHECK constraint on email_log.status
 * (20260713010000) allows no third, so a SUPPRESSED send is recorded as 'sent'
 * with its reason in the free-text error column.
 *
 * That is not a fudge — it is the mechanism. getAlreadyEmailed filters on
 * status = 'sent', so a suppressed row is what stops the same notification from
 * firing later. Without it, turning EMAIL_MODE back on would mail every week
 * that opened, closed or scored while the switch was off: the exact catch-up
 * blast the 2026-08-12 incident (see 20260815160000) taught us to fear.
 *
 * A 'failed' row, by contrast, is retried on the next run. Suppression is not a
 * failure and must never be recorded as one.
 */
function sentOrFailed(result: SendResult): "sent" | "failed" {
  return result.ok || result.suppressed ? "sent" : "failed";
}

/**
 * Record an attempt. The RPC upserts, so a retry overwrites a previous failure.
 * Direct table access went away with ADR-416 gate 1 rule 3 (20260819010000).
 */
export async function recordEmail(
  admin: SupabaseClient,
  weekId: string,
  profileId: string,
  kind: string,
  result: SendResult
): Promise<void> {
  await admin.rpc("record_email", {
    p_week_id: weekId,
    p_profile_id: profileId,
    p_kind: kind,
    p_status: sentOrFailed(result),
    p_error: result.error ?? null,
  });
}

/**
 * The season-scoped twin — the payouts statement is about a season, not a
 * week (the 20260816150000 migration is what made the ledger able to say
 * so). Same upsert posture: a retry overwrites a failure, a success stands.
 */
export async function recordSeasonEmail(
  admin: SupabaseClient,
  seasonId: string,
  profileId: string,
  kind: string,
  result: SendResult
): Promise<void> {
  await admin.rpc("record_season_email", {
    p_season_id: seasonId,
    p_profile_id: profileId,
    p_kind: kind,
    p_status: sentOrFailed(result),
    p_error: result.error ?? null,
  });
}
