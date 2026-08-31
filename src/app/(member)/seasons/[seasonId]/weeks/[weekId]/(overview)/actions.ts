"use server";

import { revalidatePath } from "next/cache";

import { ok, fail, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";

/**
 * THE WEEK BOARD'S ONE WRITE — finishing a week nobody bid in.
 *
 * ── WHY THIS IS THE ONLY ACTION HERE ──────────────────────────────────────
 * Capturing results is a screen of its own and is not built yet; the season
 * page's queue links here and this page offers nothing, which is the gap this
 * fills for the one case that needs no capture at all. When the capture screen
 * lands, this stays: a week with no owners will still have nothing to capture.
 *
 * ── EVERY GUARD IS THE RPC'S ──────────────────────────────────────────────
 * `finalize_week` refuses a non-commissioner, a week that is not closed, a week
 * whose weekend has not ended, and — when the week HAS owners — one with
 * uncaptured films. The button is only rendered when none of those apply, but
 * the database is what actually decides, and its refusals are written to be
 * read by a commissioner, so they are surfaced as-is.
 */
export async function finishUnbidWeek(
  seasonId: string,
  weekId: string
): Promise<ActionResult> {
  if (!seasonId || !weekId) return fail("Which week is this?");

  const supabase = await createClient();
  const { error } = await supabase.rpc("finalize_week", { p_week_id: weekId });
  if (error) return fail(error.message);

  // The season page carries the "waiting on you" queue this week was sitting
  // in, so the layout is revalidated rather than just this page.
  revalidatePath(`/seasons/${seasonId}`, "layout");
  return ok(undefined, "Week finished. Nobody bid, so nothing scored.");
}
