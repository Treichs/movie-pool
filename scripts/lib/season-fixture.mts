import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * SPIKE FIXTURES FOR ADR-099.
 *
 * `create_season` now REQUIRES a first opening date and lays the schedule out
 * itself — a season cannot exist without weeks, because a season without
 * weeks has no earliest week and therefore no derivable number. Two
 * consequences for the spikes, and this module is both of them in one place
 * so eighteen files do not each invent their own answer.
 */

/**
 * A Friday far enough ahead that `seed_season_weeks`' future-deadline gate
 * passes whatever day the suite runs on.
 *
 * The gate refuses a first week whose bids were already due ("the week would
 * open and never close"), and the deadline lands Monday-to-Thursday of that
 * Friday's own week — so the date has to clear TODAY plus that offset, not
 * merely be in the future. Three weeks out is comfortable and keeps the
 * fixture's dates readable in a failure message.
 */
export function futureFriday(weeksAhead = 3): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  // Strictly future: a run on a Friday takes the NEXT one, never today's.
  const toFriday = (5 - d.getUTCDay() + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + toFriday + (weeksAhead - 1) * 7);
  return d.toISOString().slice(0, 10);
}

/**
 * Drop the week `create_season` seeded, for a spike that lays out its own
 * calendar (usually in the PAST, which the product's own seeding refuses).
 *
 * Service role, deliberately: this manufactures a state the product no longer
 * produces — a season with no weeks — which the database still represents and
 * which most spikes have always started from. Anything that goes through a
 * commissioner RPC would be testing the product; this is fixture setup.
 */
export async function clearSeededWeeks(
  admin: SupabaseClient,
  seasonId: string,
): Promise<void> {
  const { error } = await admin.from("weeks").delete().eq("season_id", seasonId);
  if (error) throw new Error(`clearSeededWeeks: ${error.message}`);
}
