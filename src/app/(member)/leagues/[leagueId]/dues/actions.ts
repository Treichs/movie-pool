"use server";

import { revalidatePath } from "next/cache";

import { ok, fail, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";

/**
 * THE TWO WRITES ON THE DUES SCREEN, AND BOTH GO THROUGH AN RPC.
 *
 * ── DIRECT TABLE WRITES ARE REFUSED AT THE DATABASE ─────────────────────
 * `settlement_payments` has no INSERT or UPDATE policy at all; the only way in
 * is `record_settlement_payment`, which is `SECURITY DEFINER`. So this is not
 * a convention the app could forget — a client that tried the table directly
 * would be refused by Postgres.
 *
 * ── THE RPC REFUSES AN UNFINALIZED SETTLEMENT, AND SAYS WHY ─────────────
 * "finalize the season settlement before recording payments — until then the
 * amounts can still be regenerated." That message is better than anything this
 * layer could invent, so a failure is passed through rather than rewritten.
 *
 * ── MARKING PAID IS REVERSIBLE, WHICH IS WHY THE UNDO IS HERE ───────────
 * `clear_settlement_payment` exists and this screen uses it. A one-way "mark
 * paid" on a page about real money would make a mis-click permanent, and the
 * commissioner's own fix would be a database query.
 */

export async function markPaymentPaid(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const leagueId = String(formData.get("leagueId") ?? "");
  const seasonMemberId = String(formData.get("seasonMemberId") ?? "");
  const amount = Number(formData.get("amount") ?? NaN);

  if (!leagueId || !seasonMemberId) return fail("Which payment is this?");
  // The RPC's own rule, restated so a caller is told before the round trip.
  if (!Number.isInteger(amount) || amount < 0) {
    return fail("An amount is a whole number of dollars, 0 or more.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_settlement_payment", {
    p_season_member_id: seasonMemberId,
    p_status: "paid",
    p_amount: amount,
    p_note: null,
  });
  if (error) return fail(error.message);

  revalidatePath(`/leagues/${leagueId}`, "layout");
  return ok(undefined, "Marked paid.");
}

export async function clearPayment(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const leagueId = String(formData.get("leagueId") ?? "");
  const seasonMemberId = String(formData.get("seasonMemberId") ?? "");
  if (!leagueId || !seasonMemberId) return fail("Which payment is this?");

  const supabase = await createClient();
  const { error } = await supabase.rpc("clear_settlement_payment", {
    p_season_member_id: seasonMemberId,
  });
  if (error) return fail(error.message);

  revalidatePath(`/leagues/${leagueId}`, "layout");
  return ok(undefined, "Payment record removed.");
}
