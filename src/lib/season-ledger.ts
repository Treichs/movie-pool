import type { LeaderboardData } from "@/lib/leaderboard";
import type { SeasonHub } from "@/lib/season-hub";
import { weekStatusDisplay } from "@/lib/week-status";

/**
 * THE WEEK LEDGER — one row per week of the season, read from the viewer's
 * side, for the table that replaced the Weeks tab.
 *
 * ── IT QUERIES NOTHING, THE SAME WAY `season-story.ts` QUERIES NOTHING ────
 * Every figure here is already in hand. `hub.myFilms` carries every film the
 * viewer owns with its week, its score and what they paid; `hub.tableRows` is
 * one row per active film in the season, so a slate size is a count of it;
 * `leaderboard.allTrends` carries the viewer's own rank at the end of each
 * scored week. Adding a per-week read would duplicate all three and could
 * disagree with them, which is the exact drift the derived-not-stored rule
 * exists to prevent.
 *
 * ── THE STATUS WORD COMES FROM `weekStatusDisplay`, NOT FROM A LOCAL MAP ──
 * The Weeks tab this replaces carried its own five-entry map — "Taking bids",
 * "Scored", "Nobody bid" — which is precisely what ADR-048 forbids: every
 * surface printing a week status comes through the one module, or a five-way
 * naming rule ends up spread across six files. The `noOwners` flag that module
 * takes is `hub.unbidWeekIds`, and `deadlinePassed` is compared here because
 * the module is pure and refuses to read a clock.
 *
 * ── THE DEFAULT ORDER IS THE COMPOSER'S, AND IT IS NOT A SORT ─────────────
 * Played and open weeks run NEWEST FIRST, because the live week is the one
 * asking for something and a fourteen-week season would otherwise open on week
 * 01. Weeks that have not opened yet are pinned BELOW them in date order,
 * because they are a schedule rather than a ledger — with a plain descending
 * sort, seven pending weeks would sit above the week actually taking bids.
 * The table starts with no sort applied so this order is what a reader sees,
 * the same convention `career-table.tsx` follows.
 */
export type LedgerFilm = {
  id: string;
  title: string;
  /** What the viewer paid for it. */
  bid: number | null;
  /** Null until the commissioner captures the result. */
  score: number | null;
};

export type WeekLedgerRow = {
  weekId: string;
  number: number;
  openingDate: string;
  /** The player-facing word, straight from `weekStatusDisplay`. */
  status: string;
  isOpen: boolean;
  /** A week that has not opened yet: a date on the schedule, nothing more. */
  isUpcoming: boolean;
  /** Null for a pending week. IT IS NOT A DESTINATION — it has no slate and no
   *  bids, and linking to one lands on a page with nothing on it. */
  href: string | null;
  /** Films on the slate. Zero for a week the commissioner has not built. */
  slate: number;
  owned: number;
  /** Dollars committed to the films won that week. Null when none were won —
   *  a dash, because $0 is a real and different outcome. */
  paid: number | null;
  /** Points from the films owned that week. Null when nothing has scored:
   *  zero is a score a player can genuinely earn. */
  points: number | null;
  /** The viewer's place in the standings at the end of this week. Null until
   *  the week has scored. */
  rankAfter: number | null;
  /** Best score first, for the row's expansion. */
  films: LedgerFilm[];
};

export function buildWeekLedger(
  hub: SeasonHub,
  leaderboard: LeaderboardData,
  seasonId: string,
  now: Date = new Date(),
): WeekLedgerRow[] {
  const slateOf = new Map<number, number>();
  for (const row of hub.tableRows) {
    slateOf.set(row.weekNumber, (slateOf.get(row.weekNumber) ?? 0) + 1);
  }

  const filmsOf = new Map<number, LedgerFilm[]>();
  for (const film of hub.myFilms) {
    const list = filmsOf.get(film.weekNumber) ?? [];
    list.push({
      id: film.id,
      title: film.title,
      bid: film.myBid,
      score: film.score === null ? null : Number(film.score),
    });
    filmsOf.set(film.weekNumber, list);
  }

  const myTrend = leaderboard.allTrends.find((s) => s.isMe)?.trend ?? [];
  const rankOf = new Map(myTrend.map((p) => [p.week, p.pointsRank]));

  const rows = hub.weeks.map((week): WeekLedgerRow => {
    const deadline = week.bid_deadline_override ?? week.bid_deadline;
    const display = weekStatusDisplay(
      week.status,
      deadline !== null && new Date(deadline) <= now,
      hub.unbidWeekIds.has(week.id),
    );
    const films = (filmsOf.get(week.number) ?? []).sort(
      (a, b) => (b.score ?? 0) - (a.score ?? 0),
    );
    const scored = films.filter((f) => f.score !== null);

    return {
      weekId: week.id,
      number: week.number,
      openingDate: week.opening_date,
      status: display.label,
      isOpen: week.status === "open",
      isUpcoming: week.status === "draft",
      href:
        week.status === "draft"
          ? null
          : `/seasons/${seasonId}/weeks/${week.id}`,
      slate: slateOf.get(week.number) ?? 0,
      owned: films.length,
      paid: films.length === 0 ? null : films.reduce((n, f) => n + (f.bid ?? 0), 0),
      points:
        scored.length === 0
          ? null
          : scored.reduce((n, f) => n + (f.score as number), 0),
      rankAfter: rankOf.get(week.number) ?? null,
      films,
    };
  });

  return [
    ...rows.filter((r) => !r.isUpcoming).sort((a, b) => b.number - a.number),
    ...rows.filter((r) => r.isUpcoming).sort((a, b) => a.number - b.number),
  ];
}
