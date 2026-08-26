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

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  // Defaulted so no existing call site had to change. The notify sweeps pass
  // "automatic" explicitly; everything else is one person, one action.
  category: EmailCategory = "transactional"
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

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (res.ok) return { ok: true };
  return { ok: false, error: `${res.status} ${await res.text()}` };
}
