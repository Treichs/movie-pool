import "server-only";

// THE ONE OUTBOUND MAILER.
//
// This lived as a private function inside app/api/cron/notify/route.ts until
// ADR-121's invite work needed it from a server action too. Extracted rather
// than copied: FROM and SITE_URL are the kind of constants that get edited in
// one place and forgotten in the other, and the second copy would have been
// the one sending mail to people who are not yet members.
//
// It stays a plain fetch against Resend rather than the SDK — the call is four
// lines and adding a dependency to save them is not a trade worth making.
//
// NOTE ON FAILURE. Every caller gets a result rather than an exception, and
// that is deliberate: the cron sweeps log and retry on the next run, and the
// invite action must not fail the invitation just because the mail bounced.
// The invitation IS the database row; the email is a courtesy delivery of a
// link that also exists in the UI.

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.moviepool.app";

const FROM = process.env.EMAIL_FROM ?? "The Movie Pool <pool@moviepool.app>";

// THE KILL SWITCH (2026-08-24).
//
// Automatic mail was stopped so the notification logic could be tuned without
// a live audience. The switch lives HERE, at the one outbound call, rather than
// in vercel.json — because vercel.json is not the only scheduler. The pg_cron
// job `notify-sweep` (20260816170000) calls /api/cron/notify hourly with the
// production URL hardcoded, so removing the Vercel entry would have stopped
// one of two callers and looked like success.
//
// Deleting RESEND_KEY was the other obvious lever and is the wrong one: it
// cannot tell a timer sweep from a league invitation, and it makes every
// suppressed send read as a configuration fault in a log someone is debugging.
//
// A send is one of two CATEGORIES, and the middle mode exists to separate them:
//   automatic     — the timer sweeps, and the payouts statement. Anything that
//                   fans out to a whole roster without a person addressing it.
//   transactional — one message to one person as the direct result of their
//                   own action: an invitation, a password-changed notice.
export type EmailMode = "off" | "transactional" | "on";
export type EmailCategory = "automatic" | "transactional";

/**
 * The current mode. UNSET MEANS OFF, deliberately: the whole point was that
 * deploying the change stops production mail. A default of "on" would have left
 * the app sending until someone correctly added a variable in a dashboard, and
 * a missed dashboard step is indistinguishable from success.
 */
export function emailMode(): EmailMode {
  const raw = process.env.EMAIL_MODE?.trim().toLowerCase();
  if (raw === "on") return "on";
  if (raw === "transactional") return "transactional";
  return "off";
}

/** Whether a send of this category would actually reach Resend right now. */
export function emailSendingEnabled(category: EmailCategory): boolean {
  const mode = emailMode();
  if (mode === "on") return true;
  if (mode === "transactional") return category === "transactional";
  return false;
}

export type SendResult = { ok: boolean; error?: string; suppressed?: boolean };

/**
 * IDEMPOTENCY, AND WHY IT IS NOT OPTIONAL FOR THE SWEEPS.
 *
 * Deduplication used to rest entirely on the ledger: the sweep reads who has
 * been mailed, sends to everyone else, then records it. Read, send, write —
 * with no lock across the three. TWO SCHEDULERS CALL THAT SWEEP: vercel.json
 * daily, and the pg_cron job `notify-sweep` hourly at :05. Vercel Hobby fires
 * anywhere inside its scheduled HOUR, so the daily run and the 15:05 hourly run
 * genuinely overlap. Both read an empty set, both send, and the unique index on
 * (week_id, profile_id, kind) then rejects the second LEDGER ROW — after the
 * second email has already left.
 *
 * Resend closes that from the other side. A repeated request carrying a key it
 * has seen returns the first request's response without sending again; keys
 * live 24 hours, which is longer than any gap between the two schedulers.
 *
 * THE KEY IS THE LEDGER'S OWN UNIQUE INDEX, spelled in Resend's documented
 * `<event-type>/<entity-id>` shape. That is deliberate: the two mechanisms then
 * agree on what "the same email" means by construction rather than by comment.
 *
 * A 409 (`invalid_idempotent_request`) means the same key was used with a
 * DIFFERENT payload — for this app that is a template change mid-run, and it is
 * reported like any other failure rather than swallowed.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  // Defaulted so no existing call site had to change. The notify sweeps pass
  // "automatic" explicitly; everything else is one person, one action.
  category: EmailCategory = "transactional",
  // Omitted where there is no natural key. The account and auth notices are one
  // message per deliberate human act, and a second act genuinely IS a second
  // email — giving them a key would suppress the real one.
  idempotencyKey?: string
): Promise<SendResult> {
  // Suppression is NOT a failure and must not be recorded as one — see
  // recordEmail in lib/notifications, which maps `suppressed` to a 'sent'
  // ledger row so that re-enabling mail does not fire a catch-up blast.
  if (!emailSendingEnabled(category)) {
    return {
      ok: false,
      suppressed: true,
      error: `Email sending is disabled (EMAIL_MODE=${emailMode()}, category=${category})`,
    };
  }

  // A missing key is a configuration fault, not a runtime one, and it must not
  // read as "Resend rejected it" in a log someone is debugging later.
  if (!process.env.RESEND_KEY) {
    return { ok: false, error: "RESEND_KEY is not set" };
  }

  // 256 is Resend's documented ceiling. A key built from two uuids and a kind
  // is ~90 characters, so the guard is a belt rather than a real bound — but a
  // silently-rejected key would silently restore the double-send.
  if (idempotencyKey && idempotencyKey.length > 256) {
    return { ok: false, error: "Idempotency key exceeds 256 characters" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_KEY}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (res.ok) return { ok: true };
  return { ok: false, error: `${res.status} ${await res.text()}` };
}
