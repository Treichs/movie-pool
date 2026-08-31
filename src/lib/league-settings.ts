import type { SupabaseClient } from "@/lib/supabase";
import { getLeague, getLeagueRoster, type LeagueMember } from "@/lib/league";
import { getLeagueInvites, type PendingInvite } from "@/lib/invites";

/**
 * `/leagues/[leagueId]/settings` — board 4.11.
 *
 * ── CONFIGURATION CENTRALIZES, OPERATIONS DISTRIBUTE (IA map §7.2) ──────
 * Four things live here: identity, house rules, member roles, invites.
 * NOTHING operational. Closing a week, capturing results, generating payouts
 * and starting a season all stay next to the object they act on, which is why
 * there is no fifth section and should not be one.
 *
 * ── IT IS `LeagueSettingsPage`, NOT `LeagueSettings` ────────────────────
 * `src/lib/commish.ts` already exports `LeagueSettings` for the database row.
 * A second meaning of that name in one import graph is a bug waiting to be
 * typed, and the `…Page` suffix is what this plan uses for exactly that
 * collision on `/account` and `/players/[profileId]`.
 *
 * ── NULL MEANS "NOT YOURS", AND THE PAGE 404s ON IT ────────────────────
 * Not a redirect. Sending a player to `/leagues` tells them the page is real
 * and merely not theirs; `notFound()` tells them nothing, which is the same
 * reasoning `requireSeasonMember` already follows.
 *
 * ── HOUSE RULES ARE THE LEAGUE'S DEFAULTS, NOT A SEASON'S SETTINGS ─────
 * `league_settings` is what a NEW season copies from; a running season keeps
 * the `season_settings` row it was created with. That distinction is the
 * board's own caption and is the reason this reads `league_settings` directly
 * rather than `getSettingsForSeason`, which answers a different question.
 */

/** The two house rules board 4.11 draws, out of the fourteen the row holds.
 *  The rest are carried untouched so the full-replace RPC can put them back.
 *
 *  It was three until 2026-08-31. `includeLimitedReleases` came off with its
 *  switch: ADR-078 replaced that rule with a per-film eligibility call at
 *  settlement, and nothing had read the column since. */
export type HouseRules = {
  fakeBankroll: number;
  topNDistinct: number;
};

/** Everything `update_league_settings` needs, since it replaces the whole row
 *  rather than patching it. Held opaque on purpose: the form edits three
 *  fields and this is how the other eleven survive the round trip. */
export type HouseRulesRow = {
  fake_bankroll: number;
  top_n_distinct: number;
  min_bid: number;
  buy_in: number;
  payout_structure: unknown;
  bids_due_dow: number;
  bids_due_time: string;
  bids_due_tz: string;
  league_type: string;
  default_season_length: number;
  include_limited_releases: boolean;
  side_bets_enabled: boolean;
  box_office_days: number[];
};

export type LeagueSettingsPage = {
  league: { id: string; name: string };
  members: LeagueMember[];
  /** How many commissioners the league has right now — the never-zero rule's
   *  numerator, and what decides whether "step down" is offered at all. */
  commissionerCount: number;
  /** The viewer's own membership row id, for the role actions. */
  myMemberId: string | null;
  rules: HouseRules | null;
  /** The untouched row, for the full-replace write. Null when the league has
   *  no settings row — which `create_league` always makes, so it means the
   *  league predates that and the form says so rather than writing defaults
   *  the commissioner never chose. */
  rulesRow: HouseRulesRow | null;
  invites: PendingInvite[];
};

export async function getLeagueSettingsPage(
  ctx: { supabase: SupabaseClient; user: { id: string } },
  leagueId: string
): Promise<LeagueSettingsPage | null> {
  const { supabase, user } = ctx;

  const league = await getLeague(supabase, leagueId);
  if (!league) return null;

  const members = await getLeagueRoster(supabase, leagueId);
  const me = members.find((m) => m.profile.id === user.id) ?? null;
  // THE GATE. A member who is not a commissioner gets null and the page 404s;
  // every RPC below refuses them anyway, so this decides what they SEE rather
  // than what they can do.
  if (me?.role !== "commissioner") return null;

  const [{ data: settings }, invites] = await Promise.all([
    supabase
      .from("league_settings")
      .select(
        "fake_bankroll, top_n_distinct, min_bid, buy_in, payout_structure, bids_due_dow, bids_due_time, bids_due_tz, league_type, default_season_length, include_limited_releases, side_bets_enabled, box_office_days"
      )
      .eq("league_id", leagueId)
      .maybeSingle(),
    getLeagueInvites(supabase, leagueId),
  ]);

  const rulesRow = (settings as HouseRulesRow | null) ?? null;

  return {
    league: { id: league.id, name: league.name },
    members,
    commissionerCount: members.filter((m) => m.role === "commissioner").length,
    myMemberId: me.id,
    rules: rulesRow
      ? {
          fakeBankroll: rulesRow.fake_bankroll,
          topNDistinct: rulesRow.top_n_distinct,
        }
      : null,
    rulesRow,
    invites,
  };
}
