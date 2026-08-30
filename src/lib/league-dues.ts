import type { SupabaseClient } from "@/lib/supabase";
import { getLeague } from "@/lib/league";
import {
  getLeaguePayments,
  getSettlement,
  type LeaguePaymentRow,
} from "@/lib/settlement";

/**
 * `/leagues/[leagueId]/dues` — board 4.4.
 *
 * ── REAL MONEY, TRACKED OUTSIDE THE GAME ────────────────────────────────
 * The app records WHO PAID WHOM and nothing about how. There is no payment
 * processor, no card, no balance held anywhere — `settlement_payments` is one
 * row per member per season saying "this is settled", and everything on this
 * screen is derived from that row's absence.
 *
 * ── A POSITIVE BALANCE MEANS THE LEAGUE OWES THEM ───────────────────────
 * That is the opposite of the intuitive reading of "your balance", which is
 * why the board labels it in words beside every number and why this type says
 * it too. `net` comes straight from the season's final payout sheet: a
 * champion's net is positive because the pot owes them, and a player who
 * finished out of the money has a negative net because they owe their buy-in.
 *
 * ── A SETTLED SEASON CONTRIBUTES NOTHING ────────────────────────────────
 * Not "contributes zero" — DROPS OUT. Once a payment row exists for a member
 * in a season, that season is closed for them whatever the amount was, and the
 * balance is only ever the sum of what is still outstanding. That is what lets
 * the same number answer both "what do you owe" and "what are you owed".
 *
 * ── ONLY THE LATEST FINALIZED SEASON GETS A SETTLEMENT TABLE ────────────
 * Board 4.4 draws one — "Season 33 settlement" — under the all-time balances,
 * and `getSettlement` is one query per season. Fetching every season's would
 * be thirty-three queries to draw one table, and the all-time rollup above it
 * already carries the rest.
 */

export type DuesBalance = {
  profileId: string;
  name: string;
  isMe: boolean;
  /** Positive: the league owes them. Negative: they owe the league. */
  balance: number;
};

export type DuesRow = {
  seasonMemberId: string;
  profileId: string;
  name: string;
  isMe: boolean;
  /** From the final payout sheet. Null for a member with no ledger line. */
  net: number | null;
  status: "paid" | "waived" | null;
  amount: number | null;
  recordedAt: string | null;
  /** Finishing place, for the board's Finish column. Null when the settlement
   *  has no line for them. */
  place: number | null;
};

export type LeagueDues = {
  league: { id: string; name: string };
  isCommissioner: boolean;
  /** Every member with a settled or outstanding season, worst debt first. */
  balances: DuesBalance[];
  /** The most recent finalized season, if there is one. */
  season: { id: string; name: string; rows: DuesRow[] } | null;
  /** The viewer's own line, for the panel. Null if they have never settled. */
  mine: { balance: number; throughSeason: string | null } | null;
  outstanding: {
    /** What members still owe the league, as a positive number. */
    owedToLeague: number;
    /** What the league still owes members, as a positive number. */
    owedByLeague: number;
    notSquare: number;
    members: number;
  };
};

/** A season is settled for a member once a payment row exists, whatever it
 *  said. Until then their net is still outstanding. */
const outstandingNet = (r: LeaguePaymentRow) =>
  r.status !== null || r.net === null ? 0 : r.net;

export async function getLeagueDues(
  ctx: { supabase: SupabaseClient; user: { id: string } },
  leagueId: string
): Promise<LeagueDues | null> {
  const { supabase, user } = ctx;

  // THE GATE IS THIS READ AND IT IS RLS'S — `leagues` gates SELECT on
  // `is_league_member`, so a stranger's league comes back null and 404s.
  const league = await getLeague(supabase, leagueId);
  if (!league) return null;

  const [payments, { data: membership }] = await Promise.all([
    getLeaguePayments(supabase, leagueId),
    supabase
      .from("league_members")
      .select("role")
      .eq("league_id", leagueId)
      .eq("profile_id", user.id)
      .maybeSingle(),
  ]);
  const isCommissioner =
    (membership as { role: string } | null)?.role === "commissioner";

  // ---- all-time balances, one row per ACCOUNT (ADR-082) -------------------
  const byProfile = new Map<string, DuesBalance>();
  for (const r of payments) {
    const row = byProfile.get(r.profileId) ?? {
      profileId: r.profileId,
      name: r.displayName,
      isMe: r.profileId === user.id,
      balance: 0,
    };
    row.balance += outstandingNet(r);
    // Every row of this account carries the same name — the RPC joins profiles
    // live — so which one wins does not matter.
    row.name = r.displayName;
    byProfile.set(r.profileId, row);
  }
  const balances = [...byProfile.values()].sort(
    // Debts first and largest first, then the people owed money, then everyone
    // square. The order IS the commissioner's chase list.
    (a, b) => a.balance - b.balance || a.name.localeCompare(b.name)
  );

  // ---- the latest finalized season's own table ---------------------------
  // `get_league_payments` returns finalized seasons only, newest first by the
  // RPC's own ordering; the first row's season is therefore the latest.
  const latestId = payments[0]?.seasonId ?? null;
  let season: LeagueDues["season"] = null;

  if (latestId) {
    const settlement = await getSettlement(supabase, latestId);
    const placeOf = new Map(
      (settlement?.lines ?? []).map((l) => [l.member.id, l.breakdown.place])
    );
    season = {
      id: latestId,
      name: payments.find((r) => r.seasonId === latestId)!.seasonName,
      rows: payments
        .filter((r) => r.seasonId === latestId)
        .map((r) => ({
          seasonMemberId: r.seasonMemberId,
          profileId: r.profileId,
          name: r.displayName,
          isMe: r.profileId === user.id,
          net: r.net,
          status: r.status,
          amount: r.amount,
          recordedAt: r.recordedAt,
          place: placeOf.get(r.seasonMemberId) ?? null,
        }))
        .sort((a, b) => (a.place ?? 99) - (b.place ?? 99)),
    };
  }

  const me = byProfile.get(user.id) ?? null;

  return {
    league: { id: league.id, name: league.name },
    isCommissioner,
    balances,
    season,
    mine: me
      ? {
          balance: me.balance,
          // "Square through Season 33" only means something if there IS a
          // latest season; a league mid-first-season has nothing to be through.
          throughSeason: season?.name ?? null,
        }
      : null,
    outstanding: {
      owedToLeague: balances.reduce(
        (s, b) => s + (b.balance < 0 ? -b.balance : 0),
        0
      ),
      owedByLeague: balances.reduce(
        (s, b) => s + (b.balance > 0 ? b.balance : 0),
        0
      ),
      notSquare: balances.filter((b) => b.balance !== 0).length,
      members: balances.length,
    },
  };
}
