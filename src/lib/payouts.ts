import type { SeasonContext } from "@/lib/auth";
import { getSettlement, type Settlement, type SettlementLine } from "@/lib/settlement";

/**
 * `/seasons/[seasonId]/payouts` — boards 5.1a and 5.1b, ONE route.
 *
 * ── THE MERGE, AND THE CONDITION IT HAS TO SATISFY (IA map §2) ──────────
 * The player's view opens with THEIR OWN RESULT. The commissioner's controls
 * are additive and secondary — not the player page with a toolbar bolted on,
 * and not a workbench with the player's summary demoted. The split that makes
 * that work is by KIND: **status goes to the top** as one line, because it
 * qualifies the meaning of everything below it; **controls go to the foot**.
 * A commissioner's own result opens their page identically to a player's,
 * because a commissioner is a player too.
 *
 * ── THE AWARD WINNERS ARE IN THE LINES, NOT THE SNAPSHOT ────────────────
 * `payout_snapshot` carries the RATIOS and the films — `best_ratio`,
 * `efficiency_films`, `worst_ratio`, `dessert_films` — but not who won them.
 * The person is the line with a non-zero `efficiency_won` or `dessert_owed`,
 * which is also the only place the two can never disagree.
 *
 * ── THE FINALIZE BLOCKER IS THE SEASON'S STATUS, AND IT IS THE RPC'S ────
 * `finalize_settlement` refuses unless the season is `completed` or
 * `archived`. That is restated here so the page can DISABLE the control and
 * say why, which is the one thing a disabled button owes its reader.
 */

export type PayoutAward = {
  label: string;
  holder: string;
  holderProfileId: string;
  isMe: boolean;
  value: string;
  detail: string;
  /** The two money awards lead; the dessert is a penalty and recedes. */
  marquee: boolean;
};

export type PayoutRow = {
  lineId: string;
  profileId: string;
  name: string;
  isMe: boolean;
  place: number;
  points: number;
  spent: number;
  /** What they win, owe, or neither. Positive: the pot pays them. */
  net: number;
  /** The parts, for the row's own explanation. */
  breakdown: SettlementLine["breakdown"];
};

export type MyPayout = {
  place: number;
  points: number;
  spent: number;
  net: number;
};

export type Payouts = {
  season: { id: string; name: string; status: string };
  league: { id: string; name: string } | null;
  isCommissioner: boolean;
  /** Null when no settlement has ever been generated. */
  settlement: Settlement | null;
  /** True once published. A draft is visible to the commissioner alone. */
  isFinal: boolean;
  mine: MyPayout | null;
  awards: PayoutAward[];
  ledger: PayoutRow[];
  /** Why Finalize cannot be pressed, or null when it can. Commissioner only —
   *  a player never sees the control, so they are never told about it. */
  finalizeBlocker: string | null;
};

const two = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export async function getPayouts(
  ctx: SeasonContext,
  seasonId: string
): Promise<Payouts | null> {
  const { db, memberId, role } = ctx;

  const [{ data: season }, { data: seasonRow }, settlement] = await Promise.all([
    db.from("v_seasons").select("id, name, status").eq("id", seasonId).maybeSingle(),
    db
      .from("seasons")
      .select("league:leagues(id, name)")
      .eq("id", seasonId)
      .maybeSingle(),
    getSettlement(db, seasonId),
  ]);
  if (!season) return null;

  const isCommissioner = role === "commissioner";
  const status = season.status as string;
  const isFinal = settlement?.status === "final";

  const ledger: PayoutRow[] = (settlement?.lines ?? []).map((l) => ({
    lineId: l.id,
    profileId: l.member.profile.id,
    name: l.member.profile.display_name,
    isMe: l.member.id === memberId,
    place: l.breakdown.place,
    points: l.breakdown.points,
    spent: l.breakdown.spent,
    net: l.net,
    breakdown: l.breakdown,
  }));

  const mineRow = ledger.find((r) => r.isMe) ?? null;
  const snapshot = settlement?.payout_snapshot ?? null;

  const awards: PayoutAward[] = [];
  // A TIE FOR FIRST IS A SHARED TITLE, NOT A COIN TOSS. Places are dense
  // ranks, so two players on identical points are both 1st and the pot's
  // first-place money is split between them — naming one of them the champion
  // would be the page picking a winner the rules did not.
  const champions = ledger.filter((r) => r.place === 1);
  if (champions.length > 0) {
    const first = champions[0];
    awards.push({
      label: champions.length > 1 ? "Champions" : "Champion",
      holder: champions.map((c) => c.name).join(" & "),
      holderProfileId: first.profileId,
      isMe: champions.some((c) => c.isMe),
      value: two(first.points),
      detail:
        champions.length > 1
          ? `Tied · $${first.breakdown.place_won} each`
          : `${first.breakdown.place_won > 0 ? `$${first.breakdown.place_won} · ` : ""}$${first.spent} spent`,
      marquee: true,
    });
  }

  const efficiency = ledger.find((r) => r.breakdown.efficiency_won > 0);
  if (efficiency && snapshot?.best_ratio != null) {
    awards.push({
      label: "Best efficiency",
      holder: efficiency.name,
      holderProfileId: efficiency.profileId,
      isMe: efficiency.isMe,
      value: two(snapshot.best_ratio),
      detail: `Points per dollar · spent $${efficiency.spent}`,
      marquee: true,
    });
  }

  const dessert = ledger.find((r) => r.breakdown.dessert_owed > 0);
  if (dessert) {
    awards.push({
      label: "Dessert prize",
      holder: dessert.name,
      holderProfileId: dessert.profileId,
      isMe: dessert.isMe,
      value: `$${dessert.breakdown.dessert_owed}`,
      // The films the snapshot blames, when it named any — the story of the
      // award is which film sank them, not the penalty's size.
      detail:
        snapshot?.dessert_films?.length
          ? snapshot.dessert_films.join(", ")
          : "The season's worst owned film",
      // A penalty, not a prize. It recedes.
      marquee: false,
    });
  }

  return {
    season: { id: seasonId, name: (season.name as string) ?? "This season", status },
    league:
      (seasonRow as { league: { id: string; name: string } | null } | null)
        ?.league ?? null,
    isCommissioner,
    settlement,
    isFinal,
    mine: mineRow
      ? {
          place: mineRow.place,
          points: mineRow.points,
          spent: mineRow.spent,
          net: mineRow.net,
        }
      : null,
    awards,
    ledger,
    finalizeBlocker: !isCommissioner
      ? null
      : settlement === null
        ? "There is no draft to finalize yet."
        : isFinal
          ? "These payouts are already final."
          : status !== "completed" && status !== "archived"
            ? "Unavailable until the season is over — it is still running."
            : null,
  };
}

/** The awards and the ledger have to agree about a decimal, so they share the
 *  one formatter rather than each carrying its own. */
export { two as formatPoints };
