"use server";

import { revalidatePath } from "next/cache";

import { ok, fail, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";

/**
 * ANSWERING AN INVITATION, from inside the app.
 *
 * ── WHY THIS EXISTS ALONGSIDE `/invites/[token]` ──────────────────────────
 * `accept_league_invite(p_token, p_invite_id)` takes EITHER. The token is what
 * an emailed link carries; the invite id is what `get_my_league_invites`
 * returns to the person the invite names. So someone who lost the email, or who
 * never opened it, can still accept — which is the whole reason the bell points
 * its invite alerts at `/leagues` rather than at a token URL it does not have.
 *
 * ── NO GATE HERE, AND IT IS THE SAME REASON THE BID ACTIONS GIVE ──────────
 * The RPC is `SECURITY DEFINER` and checks that the signed-in user is the
 * person the invite names. A gate in this file would buy a worse failure mode
 * and no extra safety, and its exception messages are written to be read by a
 * player, so they are surfaced as-is rather than translated.
 *
 * `revalidatePath`, never `revalidateTag`: the Supabase client carries the
 * user's JWT under RLS, so the same read returns different rows per user, and a
 * tag-keyed cache over an RLS-scoped read is a cross-user leak.
 */
export async function acceptInvite(
  inviteId: string
): Promise<ActionResult<{ leagueId: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_league_invite", {
    p_invite_id: inviteId,
  });
  if (error) return fail(error.message);

  // ACCEPTING CHANGES THE FRAME, NOT JUST THIS PAGE. The switcher, the bell and
  // the nav band all read the viewer's leagues, and they are rendered by the
  // group layout — so the layout's own path has to be revalidated or the new
  // league is missing from the chrome until a hard reload.
  revalidatePath("/leagues");
  revalidatePath("/", "layout");
  return ok({ leagueId: data as string }, "You are in.");
}

export async function declineInvite(
  inviteId: string
): Promise<ActionResult<void>> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("decline_league_invite", {
    p_invite_id: inviteId,
  });
  if (error) return fail(error.message);

  revalidatePath("/leagues");
  revalidatePath("/", "layout");
  return ok(undefined, "Invitation declined.");
}
