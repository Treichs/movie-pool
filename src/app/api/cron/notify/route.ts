import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import {
  MAX_SENDS_PER_RUN,
  getAlreadyEmailed,
  getClosedWeeks,
  getScoredWeeks,
  getSeasonRecipients,
  notifyIdempotencyKey,
  recordEmail,
  resultsWindowStart,
} from "@/lib/notifications";
import type { NotifyKind } from "@/lib/notifications";
import { mondayScoresEmail, revealEmail } from "@/lib/email-templates";
import {
  SITE_URL,
  emailMode,
  emailSendingEnabled,
  sendEmail,
} from "@/lib/email";

// Scheduled notifications, run by Vercel Cron (see vercel.json) and by the
// pg_cron job `notify-sweep`. TWO sweeps, both deduped through email_log and
// both time-bounded by the results window:
//   1. bids_revealed — a week closed: the sealed sheet is open.
//   2. results_up    — a week reached final: the scores are real.
//
// WAS FOUR (2026-08-30). `slate_up` and `deadline_reminder` were retired: both
// announced something a player can already see on the board, and together they
// turned a weekly game into a weekly nagging. Their queries, templates and
// preference toggles went with them; `email_log.kind` still allows both values
// because the rows already written are true.
//
// The payouts statement (kind payouts_final) deliberately does NOT sweep:
// finalize is a human act and the finalize action sends it directly. A sweep
// anchored on any settlement timestamp would have mailed every ingested
// historical season — the same class of bug the results window exists for.
//
// All sweeps are TIME-BOUNDED and the run is VOLUME-BOUNDED. The 2026-08-12
// replica ingest proved why: ~170 historical weeks arrived already-final with
// no ledger rows, the sweep read them all as breaking news, and Resend's
// daily quota turned one blast into a drip. The window keeps history out of
// the sweep entirely; the send cap keeps any future logic bug from becoming
// mail. Candidates are collected BEFORE anything sends, so a tripped breaker
// sends nothing rather than the first N of a mistake.
//
// CADENCE, honestly: Vercel Hobby rejects sub-daily crons (which is why the
// bidding automation lives in pg_cron, ADR-052), so reveal mail can land up to
// an hour after the moment it describes — the pg_cron sweep runs hourly, which
// is the tighter of the two. The templates are written to survive that: they
// say what is true, not "just now".
//
// TWO SCHEDULERS, not one. vercel.json calls this daily, and the pg_cron job
// `notify-sweep` (20260816170000) calls it HOURLY with the production URL
// hardcoded. Anything meant to stop these emails has to sit in the request
// path, because silencing either scheduler alone silences half of them.
//
// EMAIL_MODE is that stop, and it lives at the mailer (infrastructure/clients/
// email.ts). It gates the SEND only: the sweeps below still run and still write
// their ledger rows while it is off, so re-enabling does not replay the weeks
// that passed in the meantime. See sentOrFailed in lib/notifications.
//
// Every QUERY lives in lib/notifications, every TEMPLATE in
// lib/email-templates. What is left here is what a route should own: the
// secret check, the service-role client, the outbound call and the loop.

export async function GET(request: Request) {
  // `!cronSecret` FIRST, which is Vercel's own documented shape and not
  // defensive noise: without it an unset variable makes the expected header the
  // literal string "Bearer undefined", and the route is then open to anyone who
  // guesses the obvious. A missing secret must fail closed, not fail open.
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Service-role client: the sweeps read across every season and write the
  // email_log ledger, neither of which any user-facing policy allows.
  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  );

  // EMAIL_MODE gates the send, not the sweep. The candidates are still
  // collected and still written to the ledger while mail is off — that is what
  // keeps a later re-enable from mailing every week the switch slept through.
  const sending = emailSendingEnabled("automatic");

  const summary = {
    reveals: 0,
    results: 0,
    failed: 0,
    suppressed: 0,
  };

  // One definition, in `notifications.ts` — these strings are also the
  // `email_log` kind and the `profiles.notify_*` column suffix.
  type Kind = NotifyKind;
  type Job = {
    kind: Kind;
    weekId: string;
    profileId: string;
    email: string;
    subject: string;
    html: string;
  };
  const jobs: Job[] = [];

  const now = new Date();
  const windowStart = resultsWindowStart(now);

  // ---- 1. The reveal --------------------------------------------------------
  for (const week of await getClosedWeeks(admin, windowStart)) {
    const [members, sent] = await Promise.all([
      getSeasonRecipients(admin, week.seasonId, "bids_revealed"),
      getAlreadyEmailed(admin, week.id, "bids_revealed"),
    ]);
    const link = `${SITE_URL}/seasons/${week.seasonId}/weeks/${week.id}`;

    for (const { profile } of members) {
      if (sent.has(profile.id)) continue;
      const mail = revealEmail({
        name: profile.display_name,
        seasonName: week.seasonName,
        weekNumber: week.number,
        link,
        siteUrl: SITE_URL,
      });
      jobs.push({
        kind: "bids_revealed",
        weekId: week.id,
        profileId: profile.id,
        email: profile.email,
        ...mail,
      });
    }
  }

  // ---- 2. Monday scores -----------------------------------------------------
  for (const week of await getScoredWeeks(admin, windowStart)) {
    const [members, sent] = await Promise.all([
      getSeasonRecipients(admin, week.seasonId, "results_up"),
      getAlreadyEmailed(admin, week.id, "results_up"),
    ]);
    // CH-02: /standings is Season Home's Leaderboard tab. Emails link to the
    // real URL rather than leaning on the redirect — a mail client following a
    // 308 is one more thing to go wrong in someone's inbox.
    const link = `${SITE_URL}/seasons/${week.seasonId}?tab=leaderboard`;

    for (const { profile } of members) {
      if (sent.has(profile.id)) continue;
      const mail = mondayScoresEmail({
        name: profile.display_name,
        seasonName: week.seasonName,
        weekNumber: week.number,
        link,
        siteUrl: SITE_URL,
      });
      jobs.push({
        kind: "results_up",
        weekId: week.id,
        profileId: profile.id,
        email: profile.email,
        ...mail,
      });
    }
  }

  // ---- 3. The breaker, then the sends ---------------------------------------
  // The breaker guards against a mass SEND. With EMAIL_MODE off nothing reaches
  // Resend, so the risk it exists for is absent — and aborting here would skip
  // the ledger writes below, leaving the backlog unmarked and re-arming the
  // very blast this whole switch was added to avoid. Still shout about the
  // volume: an abnormal count is a selection bug whether or not it mails.
  if (!sending && jobs.length > MAX_SENDS_PER_RUN) {
    console.warn(
      `notify: ${jobs.length} candidates exceeds the ${MAX_SENDS_PER_RUN}-per-run ` +
        `cap, but EMAIL_MODE is "${emailMode()}" so nothing will be sent. ` +
        `Recording them as suppressed. If this volume is unexpected, inspect ` +
        `email_log for rows whose error begins "Email sending is disabled" — ` +
        `deleting them re-arms those notifications.`
    );
  }
  if (sending && jobs.length > MAX_SENDS_PER_RUN) {
    console.error(
      `notify: aborting — ${jobs.length} candidate sends exceeds the ` +
        `${MAX_SENDS_PER_RUN}-per-run cap. Nothing was sent. A legitimate run ` +
        `is a handful of members in the current week; this volume means ` +
        `backfilled weeks or a selection bug.`
    );
    return Response.json({
      ...summary,
      mode: emailMode(),
      aborted: true,
      candidates: jobs.length,
    });
  }

  const tally: Record<Kind, keyof typeof summary> = {
    bids_revealed: "reveals",
    results_up: "results",
  };

  for (const job of jobs) {
    // The key makes the two schedulers safe to overlap: whichever run reaches
    // Resend second gets the first one's response back instead of sending.
    const result = await sendEmail(
      job.email,
      job.subject,
      job.html,
      "automatic",
      notifyIdempotencyKey(job.kind, job.weekId, job.profileId)
    );
    await recordEmail(admin, job.weekId, job.profileId, job.kind, result);
    if (result.ok) summary[tally[job.kind]]++;
    else if (result.suppressed) summary.suppressed++;
    else summary.failed++;
  }

  // mode is echoed so that hitting this route tells you plainly that email is
  // off, rather than leaving you to infer it from a row of zeros.
  return Response.json({ ...summary, mode: emailMode() });
}
