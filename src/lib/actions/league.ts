"use server";

import { revalidatePath } from "next/cache";

import { ok, fail, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";

/**
 * INVITATION WRITES — shared, because two routes make them.
 *
 * They started in `(member)/leagues/actions.ts` and moved here the moment
 * `/invites/[token]` needed the same RPC. That is rule 2's own condition: a
 * write colocates until a second route needs it, and then it moves once.
 *
 * ── TWO NAMES, NOT ONE FUNCTION TAKING EITHER ─────────────────────────────
 * `accept_league_invite(p_token, p_invite_id)` accepts exactly one of the two
 * and raises if given both or neither. A single wrapper taking an optional pair
 * would push that error to runtime for no gain; the caller always knows which
 * it has. `/leagues` holds ids from `get_my_league_invites`; the emailed link
 * holds a token and nothing else.
 *
 * ── NO GATE IN THIS FILE, AND THAT IS DELIBERATE ──────────────────────────
 * The RPCs are `SECURITY DEFINER` and do the checking that matters — signed in,
 * the invitation exists, a targeted invitation matches the caller's own address,
 * not expired, not already used. Their exception messages are written to be read
 * by a player, so they are surfaced as-is rather than translated here.
 *
 * `revalidatePath`, never `revalidateTag`: the Supabase client carries the
 * user's JWT under RLS, so the same read returns different rows per user, and a
 * tag-keyed cache over an RLS-scoped read is a cross-user leak.
 */

/** Joining changes the FRAME as well as the page — the switcher, the bell and
 *  the nav band all read the viewer's leagues from the group layout, so its
 *  path is revalidated too or the new league is missing from the chrome until a
 *  hard reload. */
function revalidateMembershipSurfaces() {
  revalidatePath("/leagues");
  revalidatePath("/", "layout");
}

/** From `/leagues`, where the read already returned the invitation's id. */
export async function acceptInviteById(
  inviteId: string
): Promise<ActionResult<{ leagueId: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_league_invite", {
    p_invite_id: inviteId,
  });
  if (error) return fail(error.message);
  revalidateMembershipSurfaces();
  return ok({ leagueId: data as string }, "You are in.");
}

/** From an emailed link, which carries a token and no id. */
export async function acceptInviteByToken(
  token: string
): Promise<ActionResult<{ leagueId: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_league_invite", {
    p_token: token,
  });
  if (error) return fail(error.message);
  revalidateMembershipSurfaces();
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
  revalidateMembershipSurfaces();
  return ok(undefined, "Invitation declined.");
}
