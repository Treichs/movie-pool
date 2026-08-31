"use server";

import { revalidatePath } from "next/cache";

import { ok, fail, type ActionResult } from "@/lib/action-result";
import { inviteToLeague } from "@/lib/actions/invite";
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

/** Everything the four-step wizard collects, in one object because it is
 *  submitted once at the end rather than a step at a time. */
export type NewLeague = {
  name: string;
  bankroll: number;
  winningTiers: number;
  minBid: number;
  /** 1 = Monday … 4 = Thursday. `create_season` refuses anything else. */
  bidsDueDow: number;
  /** "HH:MM", in the commissioner's own zone, which travels with it. */
  bidsDueTime: string;
  bidsDueTz: string;
  /** The first Friday films open on. */
  firstOpeningDate: string;
  seasonLength: number;
  inviteEmails: string[];
  /** Accounts picked by name in the wizard. Invited by id, so their addresses
   *  are resolved in the database and never travel to the browser. */
  inviteProfileIds: string[];
};

/**
 * STARTING A LEAGUE — three RPCs, in an order that cannot be transactional.
 *
 * `create_league`, then `create_season`, then one `create_league_invite` per
 * address. Postgres cannot roll the three back together from here, so the
 * order is chosen so that each failure leaves something a person can finish
 * rather than something they have to unpick:
 *
 *   - league fails    → nothing exists, the form is still filled in
 *   - season fails    → the league exists with no season, which is a state the
 *                       app already renders honestly ("No season started yet")
 *                       and `/leagues/[id]/seasons/new` is built to complete
 *   - an invite fails → the league and season are real and playable, and the
 *                       addresses that did not send come back named so the
 *                       commissioner can retry them from league settings
 *
 * WHICH IS WHY THE RESULT CARRIES `failedInvites` RATHER THAN THROWING. A
 * mistyped address must not read as "your league was not created".
 *
 * ── WHAT IT DOES NOT ACCEPT: WHETHER LIMITED RELEASES COUNT ───────────────
 * The board draws a toggle for it and the rulebook retired the setting — wide
 * release is the commissioner's per-film judgement when they build the slate,
 * not a rule the app enforces. `create_season` has no parameter for it either,
 * so a toggle here would have been a control that changed nothing. Confirmed
 * with the developer on 2026-08-29.
 */
export async function createLeague(
  input: NewLeague
): Promise<ActionResult<{ leagueId: string; failedInvites: string[] }>> {
  const supabase = await createClient();

  const { data: leagueId, error: leagueError } = await supabase.rpc(
    "create_league",
    { p_name: input.name }
  );
  if (leagueError) return fail(leagueError.message, "name");

  const { error: seasonError } = await supabase.rpc("create_season", {
    p_league_id: leagueId as string,
    p_first_opening_date: input.firstOpeningDate,
    p_fake_bankroll: input.bankroll,
    p_top_n_distinct: input.winningTiers,
    p_min_bid: input.minBid,
    p_bids_due_dow: input.bidsDueDow,
    p_bids_due_time: input.bidsDueTime,
    p_bids_due_tz: input.bidsDueTz,
    p_default_season_length: input.seasonLength,
  });
  if (seasonError) {
    // The league IS real, so the revalidation has to happen before returning —
    // otherwise the commissioner goes back to a list that does not show it.
    revalidateMembershipSurfaces();
    return fail(
      `The league was created, but its first season was not: ${seasonError.message}. Open the league and start the season from there.`
    );
  }

  // The inviter's own name goes in the subject line, so it is read once rather
  // than per address.
  const { data: me } = await supabase.auth.getUser();
  const { data: myProfile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", me.user?.id ?? "")
    .maybeSingle();
  const invitedBy = myProfile?.display_name ?? "A commissioner";

  const failedInvites: string[] = [];
  for (const email of input.inviteEmails) {
    const res = await inviteToLeague(supabase, {
      leagueId: leagueId as string,
      leagueName: input.name,
      invitedBy,
      email,
    });
    // A created invitation whose EMAIL bounced is still a failure worth naming:
    // the commissioner is the only person who can retry it, and the invited
    // player has no other way of learning the link exists.
    if (!res.ok || !res.outcome?.sent) failedInvites.push(email);
  }
  // Picked accounts, by id. The address comes BACK from the RPC, which is the
  // only place it is known here — so a failure is still named by address even
  // though one was never sent.
  for (const profileId of input.inviteProfileIds) {
    const res = await inviteToLeague(supabase, {
      leagueId: leagueId as string,
      leagueName: input.name,
      invitedBy,
      profileId,
    });
    if (!res.ok || !res.outcome?.sent) {
      failedInvites.push(res.outcome?.email || "someone you picked");
    }
  }

  revalidateMembershipSurfaces();
  return ok({ leagueId: leagueId as string, failedInvites });
}
