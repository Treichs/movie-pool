import "server-only";

import { sendEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/email";
import { leagueInviteEmail } from "@/lib/email-templates";
import { formatDateFull } from "@/lib/format";
import type { SupabaseClient } from "@/lib/supabase";

/**
 * CREATE AN INVITATION AND ACTUALLY DELIVER IT.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * `create_league_invite` has always RETURNED the token, and both callers threw
 * it away: `const { error } = await supabase.rpc(...)`. So an invitation was a
 * database row and a page at `/invites/[token]` that nobody was ever told the
 * address of. The commissioner saw "Invitation created" and the invited player
 * saw nothing at all. `lib/email.ts`'s own header says the mailer was extracted
 * because "ADR-121's invite work needed it from a server action too" — this is
 * that call site, finally made.
 *
 * Two routes create invitations (the new-league wizard and league settings), so
 * per rule 2 the shared write lives in `lib/actions/` rather than being written
 * twice and drifting.
 *
 * ── TRANSACTIONAL, AND IT COULD NOT BE ANYTHING ELSE ──────────────────────
 * The recipient usually has NO ACCOUNT YET, so there is no `profiles` row to
 * carry a `notify_*` preference and nothing to consult. It is also one message
 * to one person as the direct result of one commissioner's act, which is the
 * definition the mailer's category split already uses.
 *
 * ── EITHER AN ADDRESS OR A PICKED ACCOUNT ─────────────────────────────────
 * `create_league_invite` has always taken both and resolves a `p_profile_id`
 * to that account's address ITSELF. This passed `null` for it until
 * 2026-08-31, so the invite picker's whole reason to exist went unused: an
 * account can now be invited without its address ever reaching the browser.
 * When both arrive the RPC prefers the id, which is the explicit choice.
 *
 * ── THE ROW IS THE INVITATION; THE EMAIL IS DELIVERY ──────────────────────
 * A send failure must not fail the invitation. The row exists, it is listed in
 * league settings, and the link can be copied from there — so a bounced address
 * comes back as a NAME in `failed`, not as an exception that makes the
 * commissioner think nothing happened.
 */
export type InviteOutcome = { email: string; sent: boolean };

export async function inviteToLeague(
  supabase: SupabaseClient,
  opts: {
    leagueId: string;
    leagueName: string;
    /** Who is asking — shown in the subject line and the first sentence. */
    invitedBy: string;
    /** Typed by the commissioner. Omit when `profileId` is given — the RPC
     *  looks that account's address up rather than trusting one sent from a
     *  browser, which is what lets the picker show a NAME and never an email. */
    email?: string;
    /** A picked account, from the invite picker. */
    profileId?: string;
  }
): Promise<{ ok: boolean; error?: string; outcome?: InviteOutcome }> {
  const { data, error } = await supabase.rpc("create_league_invite", {
    p_league_id: opts.leagueId,
    p_email: opts.email ?? null,
    p_profile_id: opts.profileId ?? null,
  });
  if (error) return { ok: false, error: error.message };

  // The RPC returns a one-row TABLE, so PostgREST hands back an array.
  const row = (
    data as unknown as
      | { id: string; token: string; email: string; expires_at: string | null }[]
      | null
  )?.[0];
  if (!row) {
    return { ok: false, error: "The invitation was not created." };
  }

  const mail = leagueInviteEmail({
    leagueName: opts.leagueName,
    invitedBy: opts.invitedBy,
    link: `${SITE_URL}/invites/${row.token}`,
    expires: row.expires_at ? formatDateFull(row.expires_at.slice(0, 10)) : null,
  });

  // Keyed on the INVITE ID, which is new on every call — re-inviting an address
  // deletes the live invite and mints a fresh token, so each send genuinely is a
  // different email. What the key buys is a double-submitted form: two requests
  // for one invite reach Resend once.
  const result = await sendEmail(
    row.email ?? opts.email ?? "",
    mail.subject,
    mail.html,
    "transactional",
    `league_invite/${row.id}`
  );

  return {
    ok: true,
    outcome: { email: row.email ?? opts.email ?? "", sent: result.ok },
  };
}
