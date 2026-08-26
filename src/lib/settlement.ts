import type { SupabaseClient } from "@/lib/supabase";

// Season-end real-money settlement (phase 9). Reads are RLS-gated: the
// commissioner sees drafts, every member sees the settlement once final.

export type PayoutSnapshot = {
  pot: number;
  buy_in: number;
  member_count: number;
  first_amount: number;
  second_amount: number;
  third_refund: number;
  efficiency_prize: number;
  dessert_penalty: number;
  best_ratio: number | null;
  efficiency_films: string[];
  worst_ratio: number | null;
  dessert_films: string[];
  total_won: number;
  total_owing: number;
};

export type SettlementLine = {
  id: string;
  won: number;
  owing: number;
  net: number;
  breakdown: {
    place: number;
    points: number;
    spent: number;
    place_won: number;
    third_refund: number;
    efficiency_won: number;
    buy_in: number;
    dessert_owed: number;
  };
  member: {
    id: string;
    profile: { id: string; display_name: string };
  };
};

export type Settlement = {
  id: string;
  season_id: string;
  generated_at: string;
  status: "draft" | "final";
  payout_snapshot: PayoutSnapshot;
  lines: SettlementLine[];
};

export async function getSettlement(
  supabase: SupabaseClient,
  seasonId: string
): Promise<Settlement | null> {
  const { data } = await supabase
    .from("settlements")
    .select(
      "id, season_id, generated_at, status, payout_snapshot, lines:settlement_lines(id, won, owing, net, breakdown, member:season_members(id, profile:profiles(id, display_name)))"
    )
    .eq("season_id", seasonId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const settlement = data as unknown as Settlement;
  // Money places first, then by net — the order the email reads in.
  settlement.lines.sort(
    (a, b) => a.breakdown.place - b.breakdown.place || b.net - a.net
  );
  return settlement;
}

// The structured settlement block of the season-end email (management doc
// §5 format). The app generates the figures; the commissioner writes the
// narrative recap around it.
export function buildSettlementEmail(settlement: Settlement): string {
  const s = settlement.payout_snapshot;
  const byPlace = (p: number) =>
    settlement.lines.filter((l) => l.breakdown.place === p);
  const names = (lines: SettlementLine[]) =>
    lines.map((l) => l.member.profile.display_name).join(" / ");

  const out: string[] = [];
  if (byPlace(1).length > 0) {
    out.push(`1st: ${names(byPlace(1))}, $${s.first_amount}`);
  }
  if (byPlace(2).length > 0) {
    out.push(`2nd: ${names(byPlace(2))}, $${s.second_amount}`);
  }
  if (byPlace(3).length > 0) {
    out.push(`3rd: ${names(byPlace(3))}, $${s.third_refund} (buy-in)`);
  }
  const effWinners = settlement.lines.filter(
    (l) => l.breakdown.efficiency_won > 0
  );
  if (effWinners.length > 0) {
    const total = effWinners.reduce((t, l) => t + l.breakdown.efficiency_won, 0);
    out.push(
      `Efficiency: ${names(effWinners)} $${total} ($${s.efficiency_prize}` +
        (s.dessert_penalty > 0 ? ` + dessert $${s.dessert_penalty})` : `)`) +
        (s.efficiency_films.length > 0 ? ` — ${s.efficiency_films.join(", ")}` : "")
    );
  }
  const dessertPayers = settlement.lines.filter(
    (l) => l.breakdown.dessert_owed > 0
  );
  if (dessertPayers.length > 0) {
    out.push(
      `Dessert: ${names(dessertPayers)} (-$${s.dessert_penalty})` +
        (s.dessert_films.length > 0 ? ` — ${s.dessert_films.join(", ")}` : "")
    );
  }
  out.push("");

  const rows = settlement.lines.map((l) => ({
    name: l.member.profile.display_name,
    won: l.won,
    owing: l.owing,
    net: l.net,
  }));
  const nameWidth = Math.max(6, ...rows.map((r) => r.name.length));
  const pad = (v: string | number, w: number) => String(v).padStart(w);
  out.push(`${"Player".padEnd(nameWidth)}  ${pad("Won", 5)} ${pad("Owing", 6)} ${pad("Net", 6)}`);
  for (const r of rows) {
    out.push(
      `${r.name.padEnd(nameWidth)}  ${pad(r.won, 5)} ${pad(r.owing, 6)} ${pad(r.net, 6)}`
    );
  }
  const totalNet = rows.reduce((t, r) => t + r.net, 0);
  out.push(
    `${"Total".padEnd(nameWidth)}  ${pad(s.total_won, 5)} ${pad(s.total_owing, 6)} ${pad(totalNet, 6)}`
  );
  return out.join("\n");
}

// getSeasonPayments (and its SettlementPayment shape) lived here until the
// payouts/payments layer split (2026-08-16). It fed the season workbench's
// payment recording; recording moved onto the league Payments page, whose
// read — getLeaguePayments below — carries the same facts plus the season
// net, so the per-season read had no caller left and was deleted rather than
// exported dead.

export type LeaguePaymentRow = {
  seasonId: string;
  seasonName: string;
  seasonMemberId: string;
  /** ADR-082: the account, so a shared display name still resolves. */
  profileId: string;
  displayName: string;
  /**
   * The member's net from the season's FINAL payout sheet — the debt a payment
   * record is about. Null for a member with no ledger line (enrolled after the
   * roster locked). Added with the payouts/payments layer split (2026-08-16):
   * recording a payment needs the amount, and the all-time rollup needs the
   * season nets, neither of which the recorded-payment columns carry.
   */
  net: number | null;
  status: "paid" | "waived" | null;
  amount: number | null;
  recordedAt: string | null;
};

/** Every finalized season of the league and who is square in it. */
export async function getLeaguePayments(
  supabase: SupabaseClient,
  leagueId: string
): Promise<LeaguePaymentRow[]> {
  const { data } = await supabase.rpc("get_league_payments", {
    p_league_id: leagueId,
  });
  return (
    (data ?? []) as {
      season_id: string;
      season_name: string;
      season_member_id: string;
      profile_id: string;
      display_name: string;
      net: number | null;
      status: "paid" | "waived" | null;
      amount: number | null;
      recorded_at: string | null;
    }[]
  ).map((r) => ({
    seasonId: r.season_id,
    seasonName: r.season_name,
    seasonMemberId: r.season_member_id,
    profileId: r.profile_id,
    displayName: r.display_name,
    net: r.net,
    status: r.status,
    amount: r.amount,
    recordedAt: r.recorded_at,
  }));
}
