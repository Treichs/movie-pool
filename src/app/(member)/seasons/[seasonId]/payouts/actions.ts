"use server";

import { revalidatePath } from "next/cache";

import { ok, fail, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";

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
  return ok(undefined, "Payouts published to the league.");
}
