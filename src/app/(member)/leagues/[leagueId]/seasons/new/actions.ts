"use server";

import { revalidatePath } from "next/cache";

import { ok, fail, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";

/**
 * STARTING A SEASON IN AN EXISTING LEAGUE.
 *
 * ── WHY THIS IS NOT `createLeague`'s SEASON HALF ──────────────────────────
 * They call the same RPC and nothing else is shared. `createLeague` runs three
 * writes in sequence and reports which of them got through; this runs one and
 * either works or does not. Folding them together would produce a function with
 * a league-shaped branch and a season-shaped branch, which is two functions
 * wearing one name.
 *
 * ── THE RPC IS THE GATE ───────────────────────────────────────────────────
 * `create_season` is `SECURITY DEFINER` and refuses a non-commissioner, refuses
 * a league that already has a season under way, and refuses a `bids_due_dow`
 * outside Monday-Thursday. Its messages are written to be read by a player, so
 * they are surfaced as-is. The page gates too, with `requireCommissionerOfLeague`
 * — that one is a navigation answer, this one is the real check.
 */
export async function createSeason(input: {
  leagueId: string;
  firstOpeningDate: string;
  seasonLength: number;
  bankroll: number;
  winningTiers: number;
  minBid: number;
  bidsDueDow: number;
  bidsDueTime: string;
  bidsDueTz: string;
}): Promise<ActionResult<{ seasonId: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_season", {
    p_league_id: input.leagueId,
    p_first_opening_date: input.firstOpeningDate,
    p_default_season_length: input.seasonLength,
    p_fake_bankroll: input.bankroll,
    p_top_n_distinct: input.winningTiers,
    p_min_bid: input.minBid,
    p_bids_due_dow: input.bidsDueDow,
    p_bids_due_time: input.bidsDueTime,
    p_bids_due_tz: input.bidsDueTz,
  });
  if (error) return fail(error.message);

  // A NEW SEASON CHANGES THE FRAME, not just this league's page: the shell's
  // switcher, its nav band and the bell all read the viewer's current seasons
  // from the group layout.
  revalidatePath(`/leagues/${input.leagueId}`);
  revalidatePath("/leagues");
  revalidatePath("/", "layout");
  return ok({ seasonId: data as string });
}
