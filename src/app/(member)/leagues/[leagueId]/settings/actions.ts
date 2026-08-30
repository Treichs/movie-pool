"use server";

import { revalidatePath } from "next/cache";

import { ok, fail, type ActionResult } from "@/lib/action-result";
import type { HouseRulesRow } from "@/lib/league-settings";
import { createClient } from "@/lib/supabase/server";

/**
 * THE SETTINGS WRITES — every one of them an existing RPC.
 *
 * ── ADR-060'S TWO GUARANTEES ARE THE DATABASE'S, AND STAY THERE ────────
 * **Never self-granted**: `promote_league_commissioner` requires the caller to
 * already hold the role. **Never zero**: `demote_league_commissioner` and
 * `remove_league_member` both refuse on the LAST commissioner, and
 * `handoff_league_commissioner` is the one-shot exit for a sole one.
 *
 * None of that is re-implemented here. This layer decides which controls to
 * OFFER; the database decides what actually happens, and its refusal messages
 * are written to be read by a commissioner, so they are surfaced as-is. A UI
 * copy of the never-zero check would be a second implementation that can drift
 * from the one that counts.
 *
 * ── THE HOUSE-RULES WRITE REPLACES THE WHOLE ROW ───────────────────────
 * `update_league_settings` takes all fourteen columns, so the three fields the
 * board edits are sent alongside the eleven the page never showed. Reading
 * them on the server and posting them back is what stops a form that edits a
 * bankroll from silently resetting a payout structure to a default.
 *
 * ── THE LAYOUT IS REVALIDATED, NOT JUST THE PAGE ───────────────────────
 * A league's NAME is in the shell's switcher and its nav band. A page-scoped
 * revalidate would rename the league everywhere except the corner of the
 * screen the reader is looking at.
 */

const surfaces = (leagueId: string) => {
  revalidatePath(`/leagues/${leagueId}`, "layout");
  revalidatePath("/", "layout");
};

export async function updateLeagueIdentity(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const leagueId = String(formData.get("leagueId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!leagueId) return fail("Which league is this?");
  if (!name) return fail("A league needs a name.", "name");
  if (name.length > 60) {
    return fail("A league name is capped at 60 characters.", "name");
  }

  const supabase = await createClient();
  // The avatar pair and glyph are passed through unchanged — `null` means
  // "leave it", and this form does not edit them. See the page's note on why
  // the board's avatar picker is not built.
  const { error } = await supabase.rpc("update_league_identity", {
    p_league_id: leagueId,
    p_name: name,
    p_avatar_pair: null,
    p_avatar_glyph: null,
  });
  if (error) return fail(error.message);

  surfaces(leagueId);
  return ok(undefined, "League renamed.");
}

export async function updateHouseRules(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const leagueId = String(formData.get("leagueId") ?? "");
  const rest = String(formData.get("rest") ?? "");
  if (!leagueId || !rest) return fail("Which league is this?");

  const bankroll = Number(formData.get("fakeBankroll"));
  const tiers = Number(formData.get("topNDistinct"));
  const includeLimited = formData.get("includeLimitedReleases") === "on";

  // Restated so a commissioner is told before the round trip; the RPC and its
  // table constraints still decide.
  if (!Number.isInteger(bankroll) || bankroll < 1) {
    return fail("A bankroll is a whole number of dollars, 1 or more.", "fakeBankroll");
  }
  if (!Number.isInteger(tiers) || tiers < 1) {
    return fail("A season needs at least one winning tier.", "topNDistinct");
  }

  // The eleven fields this form does not show, carried through the browser and
  // posted back. They came off the server on the same render, so they are the
  // row as it stood when the form was drawn.
  let row: HouseRulesRow;
  try {
    row = JSON.parse(rest) as HouseRulesRow;
  } catch {
    return fail("Those settings could not be read. Reload and try again.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_league_settings", {
    p_league_id: leagueId,
    p_fake_bankroll: bankroll,
    p_top_n_distinct: tiers,
    p_include_limited_releases: includeLimited,
    p_min_bid: row.min_bid,
    p_buy_in: row.buy_in,
    // The generated RPC type wants `Json`; the row carries it opaque because
    // nothing on this page reads inside it. It goes back exactly as it came.
    p_payout_structure: row.payout_structure as never,
    p_bids_due_dow: row.bids_due_dow,
    p_bids_due_time: row.bids_due_time,
    p_bids_due_tz: row.bids_due_tz,
    p_league_type: row.league_type,
    p_default_season_length: row.default_season_length,
    p_side_bets_enabled: row.side_bets_enabled,
    p_box_office_days: row.box_office_days,
  });
  if (error) return fail(error.message);

  surfaces(leagueId);
  return ok(undefined, "House rules saved. New seasons will start from these.");
}

/**
 * The four role writes.
 *
 * They were briefly one helper taking an RPC name as a string, which does not
 * typecheck: `database.types.ts` types `supabase.rpc()`'s first argument as a
 * UNION of the schema's function names, and a `string` variable is not one of
 * them. That refusal is the generated types doing their job — a typo in an RPC
 * name is caught at build rather than at runtime — so each call names its
 * function literally and the shared part is the small wrapper below.
 */
async function afterRoleWrite(
  leagueId: string,
  error: { message: string } | null,
  notice: string
): Promise<ActionResult> {
  if (error) return fail(error.message);
  surfaces(leagueId);
  return ok(undefined, notice);
}

export async function promoteLeagueCommissioner(
  leagueId: string,
  memberId: string
): Promise<ActionResult> {
  if (!leagueId || !memberId) return fail("Which member is this?");
  const supabase = await createClient();
  const { error } = await supabase.rpc("promote_league_commissioner", {
    p_member_id: memberId,
  });
  return afterRoleWrite(leagueId, error, "They are a commissioner now.");
}

export async function demoteLeagueCommissioner(
  leagueId: string,
  memberId: string
): Promise<ActionResult> {
  if (!leagueId || !memberId) return fail("Which member is this?");
  const supabase = await createClient();
  const { error } = await supabase.rpc("demote_league_commissioner", {
    p_member_id: memberId,
  });
  return afterRoleWrite(leagueId, error, "They are a player now.");
}

/** The sole commissioner's one-shot exit: hands the role over and steps down
 *  in one call, which is the only way out that never passes through zero. */
export async function handoffLeagueCommissioner(
  leagueId: string,
  toMemberId: string
): Promise<ActionResult> {
  if (!leagueId || !toMemberId) return fail("Which member is this?");
  const supabase = await createClient();
  const { error } = await supabase.rpc("handoff_league_commissioner", {
    p_to_member_id: toMemberId,
  });
  return afterRoleWrite(
    leagueId,
    error,
    "Handed over. You are a player in this league now."
  );
}

export async function removeLeagueMember(
  leagueId: string,
  memberId: string
): Promise<ActionResult> {
  if (!leagueId || !memberId) return fail("Which member is this?");
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_league_member", {
    p_member_id: memberId,
  });
  return afterRoleWrite(leagueId, error, "Removed from the league.");
}

export async function createInvite(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const leagueId = String(formData.get("leagueId") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  if (!leagueId) return fail("Which league is this?");
  if (!email) return fail("An invitation needs an address.", "email");

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_league_invite", {
    p_league_id: leagueId,
    p_email: email,
    p_profile_id: null,
  });
  if (error) return fail(error.message);

  surfaces(leagueId);
  return ok(undefined, `Invitation created for ${email}.`);
}

export async function revokeInvite(
  leagueId: string,
  inviteId: string
): Promise<ActionResult> {
  if (!leagueId || !inviteId) return fail("Which invitation is this?");
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_league_invite", {
    p_invite_id: inviteId,
  });
  if (error) return fail(error.message);
  surfaces(leagueId);
  return ok(undefined, "Invitation revoked.");
}
