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

/**
 * The two automatic emails, and the single source of their names.
 *
 * These strings are three things at once: the `kind` written to `email_log`,
 * the suffix of the `profiles.notify_*` column that gates each one, and the
 * discriminator the cron sweeps switch on. Keeping one definition is what lets
 * the recipient query derive its filter instead of carrying a second mapping.
 *
 * WAS FOUR (2026-08-30). `slate_up` and `deadline_reminder` were retired: a
 * slate going up and a deadline approaching are both things a player can see
 * on the board, and mailing them turned a weekly game into a weekly nagging.
 * `email_log.kind` still ALLOWS both, because the ledger is history and the
 * rows it already holds are true.
 */
export type NotifyKind = "bids_revealed" | "results_up";

export type NotifiableWeek = {
  id: string;
  seasonId: string;
  number: number;
  seasonName: string;
};

type WeekRow = {
  id: string;
  season_id: string;
  number: number;
  season: { name: string } | null;
};

const toWeek = (w: WeekRow): NotifiableWeek => ({
  id: w.id,
  seasonId: w.season_id,
  number: w.number,
  seasonName: w.season?.name ?? "your season",
});

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
  const weeks = ((data ?? []) as unknown as WeekRow[]).map(toWeek);
  if (weeks.length === 0) return weeks;

  // A WEEK NOBODY BID IN HAS NOTHING TO REVEAL, so nobody is told it does.
  //
  // `revealEmail` says "the sealed sheet is open… who bid what, who owns each
  // film, and who missed by a dollar". On a week the whole league passed on,
  // every one of those clauses is false — and the recipients are precisely the
  // people who know it, because they are the ones who did not bid. Mailing it
  // is how a real notification learns to be ignored.
  //
  // The scores email is a separate sweep and has the same hole by construction:
  // a week with no owners cannot reach `final` with anything to report. It is
  // filtered the same way, in `getScoredWeeks`.
  return withOwners(admin, weeks);
}

/** Keeps only the weeks that produced at least one owning bid. One query for
 *  the whole batch — a sweep runs over every league at once, so this must not
 *  become a read per week. */
async function withOwners(
  admin: SupabaseClient,
  weeks: NotifiableWeek[]
): Promise<NotifiableWeek[]> {
  const { data } = await admin
    .from("bids")
    .select("film:films!inner(week_id)")
    .eq("is_winning", true)
    .in(
      "film.week_id",
      weeks.map((w) => w.id)
    );
  const owned = new Set(
    ((data ?? []) as unknown as { film: { week_id: string } | null }[])
      .map((r) => r.film?.week_id)
      .filter((id): id is string => id !== undefined)
  );
  return weeks.filter((w) => owned.has(w.id));
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
  const weeks = ((data ?? []) as unknown as WeekRow[]).map(toWeek);
  if (weeks.length === 0) return weeks;
  // Same filter as the reveal: "the scores are in" is not worth an email about
  // a week where nobody owned anything to score. See `withOwners`.
  return withOwners(admin, weeks);
}

/**
 * A season's members who want THIS kind of email, with the fields one needs.
 *
 * ── THE FILTER COLUMN IS BUILT FROM THE KIND ──────────────────────────────
 * `profiles.notify_<kind>` exists for each of the two kinds, named for them
 * deliberately (migration `20260829030000`). Deriving the column name here
 * rather than keeping a kind→column map means a renamed kind fails loudly at
 * the database instead of quietly mailing everyone.
 *
 * **The kind is required.** It was tempting to default it and filter nothing,
 * which would have left every existing caller compiling and silently ignoring
 * the preference it was added to honour — the failure mode this whole change
 * exists to remove.
 *
 * ── `!inner` IS LOAD-BEARING, AND THAT WAS PROVEN RATHER THAN ASSUMED ─────
 * A PostgREST filter on an EMBEDDED resource nulls the embed by default rather
 * than dropping the parent row. Probed against the real database: without
 * `!inner` a two-member season returned two rows, one carrying
 * `profile: null`. The `.filter()` below would have discarded it and the
 * answer would still have been right — by accident, after fetching what it
 * then threw away. `!inner` makes the exclusion happen in the database, which
 * is both correct on purpose and one fewer row over the wire.
 */
export async function getSeasonRecipients(
  admin: SupabaseClient,
  seasonId: string,
  kind: NotifyKind
): Promise<{ seasonMemberId: string; profile: Recipient }[]> {
  const { data } = await admin
    .from("season_members")
    .select("id, profile:profiles!inner(id, email, display_name)")
    .eq("season_id", seasonId)
    .eq(`profile.notify_${kind}`, true);
  return ((data ?? []) as unknown as {
    id: string;
    profile: Recipient | null;
  }[])
    .filter((m) => m.profile !== null)
    .map((m) => ({ seasonMemberId: m.id, profile: m.profile! }));
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
 * The season-scoped twin of `getAlreadyEmailed` — the payouts statement is
 * about a season, not a week, and `email_log_season_dedupe` is the unique index
 * that says so.
 */
export async function getAlreadySeasonEmailed(
  admin: SupabaseClient,
  seasonId: string,
  kind: string
): Promise<Set<string>> {
  const { data } = await admin
    .from("email_log")
    .select("profile_id")
    .eq("season_id", seasonId)
    .eq("kind", kind)
    .eq("status", "sent");
  return new Set((data ?? []).map((r) => r.profile_id as string));
}

/**
 * The Resend idempotency key for one notification.
 *
 * IT IS THE UNIQUE INDEX, SPELLED OUT. `email_log_week_id_profile_id_kind_key`
 * is what stops a duplicate ledger row; this is what stops the duplicate email
 * that would otherwise already have been sent by the time the index fires. The
 * two must mean the same thing, so this function lives beside `recordEmail`
 * rather than in the route — changing one without the other is the mistake it
 * exists to make visible.
 *
 * `<kind>/<week>:<profile>` is Resend's documented `<event-type>/<entity-id>`
 * shape, and lands around 90 of the 256 characters allowed.
 */
export function notifyIdempotencyKey(
  kind: NotifyKind,
  weekId: string,
  profileId: string
): string {
  return `${kind}/${weekId}:${profileId}`;
}

/** The same idea against `email_log_season_dedupe`. `payouts_final` is the only
 *  season-scoped kind, and it is not a NotifyKind because nothing sweeps for
 *  it — finalizing is a human act, and the action sends it directly. */
export function seasonIdempotencyKey(
  kind: string,
  seasonId: string,
  profileId: string
): string {
  return `${kind}/${seasonId}:${profileId}`;
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
