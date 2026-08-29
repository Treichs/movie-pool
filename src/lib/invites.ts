import type { SupabaseClient } from "@/lib/supabase";

// Read helpers for league invitations. Every one is a SECURITY DEFINER RPC
// rather than a table select: league_invites' RLS deliberately shows a row only
// to the league's commissioner or to the person it names, and the extra reads
// these need (the league's name, who sent it) cross that boundary.

export type MyInvite = {
  id: string;
  leagueId: string;
  leagueName: string;
  /** ADR-082: who sent it, by account. */
  invitedById: string;
  invitedBy: string;
  expiresAt: string;
};

/** Pending invitations addressed to the signed-in user. */
export async function getMyInvites(supabase: SupabaseClient): Promise<MyInvite[]> {
  const { data, error } = await supabase.rpc("get_my_league_invites");
  // An invite list is an accessory to the dashboard, never its reason to
  // render — a failure here must not take the page down with it.
  if (error || !data) return [];
  return (
    data as {
      id: string;
      league_id: string;
      league_name: string;
      invited_by_id: string;
      invited_by: string;
      expires_at: string;
    }[]
  ).map((r) => ({
    id: r.id,
    leagueId: r.league_id,
    leagueName: r.league_name,
    invitedById: r.invited_by_id,
    invitedBy: r.invited_by,
    expiresAt: r.expires_at,
  }));
}

export type PendingInvite = {
  id: string;
  email: string | null;
  token: string;
  expiresAt: string;
};

/** A league's outstanding invitations, for the commissioner's panel. */
export async function getLeagueInvites(
  supabase: SupabaseClient,
  leagueId: string
): Promise<PendingInvite[]> {
  const { data } = await supabase
    .from("league_invites")
    .select("id, email, token, expires_at")
    .eq("league_id", leagueId)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  return ((data ?? []) as { id: string; email: string | null; token: string; expires_at: string }[]).map(
    (r) => ({ id: r.id, email: r.email, token: r.token, expiresAt: r.expires_at })
  );
}

export type InvitePeek = {
  leagueName: string;
  alreadyMember: boolean;
  expired: boolean;
  targetedAt: string | null;
  /** Everyone on the league's roster today. */
  memberCount: number;
  /** The season you would be joining, or null between seasons. The three are
   *  null together — a league with no active season has no bankroll to report,
   *  and null is a more honest answer than a bankroll of $0. */
  bankroll: number | null;
  winningTiers: number | null;
  /** True when joining puts you straight into that season; false when bidding
   *  has already begun and you play from the next one. */
  joinsCurrentSeason: boolean | null;
};

/** What a token points at, before accepting. Null when the token is bogus. */
export async function peekInvite(
  supabase: SupabaseClient,
  token: string
): Promise<InvitePeek | null> {
  const { data, error } = await supabase.rpc("peek_league_invite", { p_token: token });
  if (error || !data) return null;
  const row = (
    data as {
      league_name: string;
      already_member: boolean;
      expired: boolean;
      targeted_at: string | null;
      member_count: number;
      bankroll: number | null;
      winning_tiers: number | null;
      joins_current_season: boolean | null;
    }[]
  )[0];
  if (!row) return null;
  return {
    leagueName: row.league_name,
    alreadyMember: row.already_member,
    expired: row.expired,
    targetedAt: row.targeted_at,
    memberCount: row.member_count,
    bankroll: row.bankroll,
    winningTiers: row.winning_tiers,
    joinsCurrentSeason: row.joins_current_season,
  };
}
