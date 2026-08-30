"use server";

import { revalidatePath } from "next/cache";

import { ok, fail, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";

/**
 * THE ONE WRITE THIS SCREEN HAS.
 *
 * ── THE AUTHZ IS THE RPC'S, AND SAYING SO IS THE POINT ──────────────────
 * `delete_league_announcement` is `SECURITY DEFINER` and refuses anyone who is
 * not a commissioner of the league the announcement belongs to — it resolves
 * the league from the announcement id itself, so there is no league parameter
 * in flight that a caller could point somewhere else. This layer hides the
 * button; the database is what actually stops the request.
 *
 * ── IT DOES NOT REDIRECT ────────────────────────────────────────────────
 * A `redirect()` inside a server action throws a control-flow error that the
 * caller's try/catch would swallow, and the page it lands on cannot report
 * that the delete failed. The action returns, the client navigates.
 *
 * ── EDIT IS NOT HERE BECAUSE THERE IS NO RPC FOR IT ─────────────────────
 * Board 4.7 draws Edit beside Delete. `post_league_announcement` and
 * `delete_league_announcement` are the only two functions on this table; there
 * is no update, and no `/announcements/[id]/edit` in the 25-route map either.
 * A button that cannot work is worse than an absent one.
 */
export async function deleteAnnouncement(
  leagueId: string,
  announcementId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_league_announcement", {
    p_id: announcementId,
  });
  if (error) return fail(error.message);

  // The list and League Home's rail both show this post; the detail page is
  // about to stop existing. A layout-scoped revalidate is the cheapest way to
  // catch all three without naming each one.
  revalidatePath(`/leagues/${leagueId}`, "layout");
  return ok(undefined, "Announcement deleted.");
}
