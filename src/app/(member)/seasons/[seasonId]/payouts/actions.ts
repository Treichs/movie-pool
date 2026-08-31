"use server";

import { revalidatePath } from "next/cache";
import { createClient as createClient2 } from "@supabase/supabase-js";

import { ok, fail, type ActionResult } from "@/lib/action-result";
import { SITE_URL, sendEmail } from "@/lib/email";
import {
  payoutsFinalEmail,
  type PayoutStatementRow,
} from "@/lib/email-templates";
import {
  getAlreadySeasonEmailed,
  recordSeasonEmail,
  seasonIdempotencyKey,
} from "@/lib/notifications";
import { getSettlement } from "@/lib/settlement";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

/**
 * THE THREE PAYOUT WRITES, AND THE FRICTION LADDER THEY SIT ON.
 *
 * ── WEIGHT MATCHES CONSEQUENCE ─────────────────────────────────────────
 * `generate` and `regenerate` are the same RPC and are ROUTINE — nothing is
 * published, the draft is simply rebuilt from today's standings, and a
 * commissioner may do it as often as they like. `finalize` is once: it
 * publishes to every member and can never be regenerated. The page gives them
 * three different weights for that reason, and these three functions exist
 * separately rather than as one with a flag so that the call sites cannot
 * blur.
 *
 * ── EVERY GUARD IS THE RPC'S ───────────────────────────────────────────
 * `generate_settlement` and `finalize_settlement` both refuse a non
 * commissioner, and finalize additionally refuses a season that is not
 * `completed` or `archived` — "complete the season before finalizing the
 * settlement". The page disables the control and states that reason, but the
 * database is what actually stops it.
 *
 * ── THE LEAGUE'S DUES PAGE READS THIS ──────────────────────────────────
 * Finalizing is what makes a season appear in `get_league_payments`, so the
 * revalidation reaches past this season to the league.
 */

function surfaces(seasonId: string, leagueId: string | null) {
  revalidatePath(`/seasons/${seasonId}`, "layout");
  if (leagueId) revalidatePath(`/leagues/${leagueId}`, "layout");
}

/** Generate and Regenerate are ONE RPC — `generate_settlement` replaces any
 *  existing draft. They are two functions because they are two decisions, and
 *  the page words them differently. */
async function draft(
  seasonId: string,
  leagueId: string | null,
  notice: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("generate_settlement", {
    p_season_id: seasonId,
  });
  if (error) return fail(error.message);
  surfaces(seasonId, leagueId);
  return ok(undefined, notice);
}

export async function generateDraft(
  seasonId: string,
  leagueId: string | null
): Promise<ActionResult> {
  return draft(seasonId, leagueId, "Draft payouts generated. Only you can see them.");
}

export async function regenerateDraft(
  seasonId: string,
  leagueId: string | null
): Promise<ActionResult> {
  return draft(seasonId, leagueId, "Draft rebuilt from today's standings.");
}

/**
 * THE STATEMENT, POSTED — the letter the commissioner used to write by hand.
 *
 * ── IT DOES NOT SWEEP, AND THAT IS THE WHOLE DESIGN ────────────────────
 * Every other automatic email is found by a timer walking recent weeks. This
 * one cannot be: a sweep anchored on any settlement timestamp would have mailed
 * every season the 2026-08-12 replica ingest brought in already-settled — the
 * same class of bug the results window exists for. Finalizing is a human act
 * that happens once, so the act sends the mail.
 *
 * ── SERVICE ROLE, BECAUSE ADDRESSES ARE NOT THE COMMISSIONER'S TO READ ──
 * The settlement lines name profiles; they do not carry email addresses, and no
 * user-facing policy lets one member read another's. Same reason the cron
 * sweeps take an admin client, and the same posture: every WRITE still goes
 * through an RPC (`record_season_email`), only the read is elevated.
 *
 * ── NO PREFERENCE TOGGLE, DELIBERATELY ─────────────────────────────────
 * There is no `notify_payouts_final` column and there should not be. The other
 * two automatic emails are news about a game; this one is what you owe or are
 * owed. EMAIL_MODE still gates it, because that switch is about whether this
 * deployment mails anyone at all.
 *
 * ── A MAIL FAILURE MUST NOT READ AS A FAILED FINALIZE ──────────────────
 * The settlement is published the moment the RPC returns. Everything below is
 * delivery of a page that already exists and that every member can now open, so
 * a bounce is reported as a sentence in the notice rather than as an error that
 * would have the commissioner press Finalize again — which the RPC would then
 * refuse, because it is once.
 */
async function postTheStatement(
  seasonId: string
): Promise<{ sent: number; failed: number }> {
  const admin = createClient2<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const [settlement, { data: season }] = await Promise.all([
    getSettlement(admin, seasonId),
    admin.from("v_seasons").select("name").eq("id", seasonId).maybeSingle(),
  ]);
  // Read back rather than trusted from the caller: if it is not final, the
  // finalize did not do what this function is here to announce.
  if (!settlement || settlement.status !== "final") return { sent: 0, failed: 0 };

  const seasonName = (season?.name as string) ?? "your season";
  const link = `${SITE_URL}/seasons/${seasonId}/payouts`;

  const [{ data: people }, already] = await Promise.all([
    admin
      .from("profiles")
      .select("id, email, display_name")
      .in("id", settlement.lines.map((l) => l.member.profile.id)),
    getAlreadySeasonEmailed(admin, seasonId, "payouts_final"),
  ]);
  const byId = new Map(
    (people ?? []).map((p) => [p.id as string, p as { id: string; email: string; display_name: string }])
  );

  // Finishing order, which is the order the statement is read in.
  const ordered = [...settlement.lines].sort(
    (a, b) => a.breakdown.place - b.breakdown.place
  );
  const rows: PayoutStatementRow[] = ordered.map((l) => ({
    name: l.member.profile.display_name,
    place: l.breakdown.place,
    points: l.breakdown.points,
    won: l.won,
    owing: l.owing,
    net: l.net,
  }));

  let sent = 0;
  let failed = 0;
  for (const line of ordered) {
    const profileId = line.member.profile.id;
    if (already.has(profileId)) continue;
    const person = byId.get(profileId);
    if (!person?.email) continue;

    const mail = payoutsFinalEmail({
      name: person.display_name,
      seasonName,
      mine: {
        place: line.breakdown.place,
        total: ordered.length,
        points: line.breakdown.points,
        net: line.net,
      },
      rows,
      link,
      siteUrl: SITE_URL,
    });

    const result = await sendEmail(
      person.email,
      mail.subject,
      mail.html,
      "automatic",
      seasonIdempotencyKey("payouts_final", seasonId, profileId)
    );
    await recordSeasonEmail(admin, seasonId, profileId, "payouts_final", result);
    // Suppressed is not failed — with EMAIL_MODE off the ledger row still lands,
    // which is what stops a later re-enable from posting the statement twice.
    if (result.ok) sent++;
    else if (!result.suppressed) failed++;
  }
  return { sent, failed };
}

export async function finalizeSettlement(
  seasonId: string,
  leagueId: string | null,
  settlementId: string
): Promise<ActionResult> {
  if (!settlementId) return fail("There is no draft to finalize.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("finalize_settlement", {
    p_settlement_id: settlementId,
  });
  if (error) return fail(error.message);
  surfaces(seasonId, leagueId);

  const { sent, failed } = await postTheStatement(seasonId);
  if (failed > 0) {
    return ok(
      undefined,
      `Payouts published to the league. ${sent} statement${sent === 1 ? "" : "s"} emailed, ${failed} did not send — everyone can still open the page.`
    );
  }
  return ok(
    undefined,
    sent > 0
      ? `Payouts published, and the statement emailed to ${sent} player${sent === 1 ? "" : "s"}.`
      : "Payouts published to the league."
  );
}
