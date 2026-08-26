import type { WeekStatus } from "@/lib/commish";

// ADR-048, re-cut by ADR-070: what players see is a PRESENTATION layer over
// the week_status enum, because the enum is written for the state machine and
// tells a player nothing about their money.
//
// ADR-070 collapsed `locked` and `resolved` into a single `closed` — closing a
// week now decides its winners in the same act — and renamed `scored` to
// `final`, which the commissioner presses rather than trips over. So the layer
// is thinner than it was: `closed` and `final` are almost the words a player
// would use. It still earns its place on `draft` and `skipped`, and it stays
// the one place the mapping lives.
//
// This module is the one place that mapping lives. The ADR is explicit that
// every surface printing a week status must come through here rather than
// inlining a label, because a five-way naming rule spread across six files is
// exactly how buildRank drifted.
//
// PURE — no React, no Supabase, no clock. Unit-tested in
// scripts/unit/week-status.test.mts.

/** The Badge `tone` values this module hands out (a subset of the tone axis). */
export type WeekStatusTone = "neutral" | "success" | "warning" | "accent";

export type WeekStatusDisplay = {
  /** The player-facing name. Lowercase — these render inside chips. */
  label: string;
  tone: WeekStatusTone;
  /** One sentence on what is happening, in terms of the player's money. */
  blurb: string;
  /** True for the two states where the week still wants something from someone. */
  live: boolean;
};

const DISPLAY: Record<WeekStatus, WeekStatusDisplay> = {
  draft: {
    label: "pending",
    tone: "neutral",
    blurb: "The commissioner is still building this weekend's slate.",
    live: false,
  },
  open: {
    label: "bidding open",
    tone: "success",
    blurb: "Bids are being taken. Every amount stays sealed until bidding closes.",
    live: true,
  },
  closed: {
    // ADR-070 folded `locked` into this. The old pair split "bids revealed"
    // from "owners decided", which were seconds apart in principle and days
    // apart in practice only because a human had to click. Now they are one
    // event, and the player-facing sentence can finally say both.
    //
    // Still deliberately NOT merged with `final` — ADR-048 rejected that and
    // the timing rule bears it out. Bids are due Thursday and results land
    // Monday, so a player spends three or four days of every week knowing
    // exactly what they own and not yet what it was worth. That is the most
    // interesting state in the game, not a transient one.
    label: "bids settled",
    tone: "accent",
    blurb: "Owners are set and bids are paid. Points land once results are captured.",
    live: false,
  },
  final: {
    label: "final",
    tone: "neutral",
    blurb: "Results are in and the points are final. This week is done.",
    live: false,
  },
  // ADR-069. The other five are stages a week passes THROUGH; this one is a
  // week that never started and never will, said out loud by the commissioner.
  // Without it the same weekend reads as `draft` — "still being built" — which
  // is a promise the season is never going to keep, and players go on checking
  // a week that has nothing coming.
  skipped: {
    label: "no releases",
    tone: "neutral",
    blurb: "Nothing opened this weekend, so there was nothing to bid on.",
    live: false,
  },
};

/**
 * The state between the deadline and the close.
 *
 * The deadline does not close the week — `run_bidding_automation` does, on a
 * pg_cron tick (every minute since 20260815220000; hourly before that). So a
 * week can sit `open` briefly after bidding has actually ended. The RPCs are already correct through that window
 * (`place_bid` and `place_bids` both refuse on the deadline check while the
 * status is still `open`), but the UI was not: it branched on
 * status alone, so it showed "bidding open", a countdown reading zero, and an
 * enabled "Bid now" button that the database would refuse. A live-looking
 * control that cannot work is worse than a disabled one.
 *
 * This is its own display rather than a variant of `closed`, because nothing has
 * been revealed yet — amounts are still sealed until the close actually runs.
 * The player has neither the bidding they had a minute ago nor the reveal they
 * are about to get, and the sentence should say exactly that.
 */
const CLOSING: WeekStatusDisplay = {
  label: "bidding closed",
  tone: "warning",
  blurb: "The deadline has passed. Amounts stay sealed until the week closes, which happens automatically within a minute.",
  live: false,
};

/**
 * The player-facing name, tone and blurb for a week status.
 *
 * `deadlinePassed` is supplied by the CALLER rather than read from a clock
 * here: this module is pure and unit-tested, and a `new Date()` inside it would
 * make it neither. Callers that have no deadline to compare simply omit it.
 */
export function weekStatusDisplay(
  status: WeekStatus,
  deadlinePassed = false,
): WeekStatusDisplay {
  if (status === "open" && deadlinePassed) return CLOSING;
  return DISPLAY[status];
}

/** Just the label, for the many call sites that only print the chip text. */
export function weekStatusLabel(status: WeekStatus): string {
  return DISPLAY[status].label;
}

// ---------------------------------------------------------------------------
// When results may be captured (ADR-080)
// ---------------------------------------------------------------------------

/**
 * The Monday after a week's Mon-Sun range — the first day its results may be
 * captured (ADR-080: scoring is gated until after the opening weekend).
 *
 * Extracted here on 2026-08-07 because a SECOND surface needed it. It lived as
 * two private helpers inside the commissioner's week page, and the overdue
 * notice would have had to copy the arithmetic. A five-way naming rule spread
 * across six files is how buildRank drifted, and a gate date computed two ways
 * is worse than a label computed two ways — the two copies would disagree
 * about whether a commissioner may score at all.
 *
 * UTC so it never drifts a day across a timezone, mirroring the database's
 * `week_of + n` date arithmetic. The RPC stays authoritative; this is the soft
 * mirror the UI reads so it never offers an action the database will refuse.
 */
export function resultsOpenOn(weekOf: string): string {
  const d = new Date(`${weekOf}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

/** Today as an ISO date in UTC, to compare against the database's current_date. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** True once the opening weekend is over and results may be captured. */
export function resultsAreOpen(weekOf: string, today: string = todayIso()): boolean {
  return today >= resultsOpenOn(weekOf);
}

// ---------------------------------------------------------------------------
// What the commissioner does next (2026-08-07)
// ---------------------------------------------------------------------------

export type CommissionerStep = {
  /** The action, named as the commissioner would say it. */
  label: string;
  /** Why it cannot be done yet, or null when it can. */
  blockedBy: string | null;
  /** Nothing left to do on this week. */
  done: boolean;
};

/**
 * The single next step a commissioner owes a week, and what is stopping it.
 *
 * WHY THIS IS A FUNCTION AND NOT A SENTENCE IN A COMPONENT. A week's lifecycle
 * is draft -> open -> closed -> final (ADR-070), each transition a thing the
 * commissioner presses, and the app now says so in three places: the week's own
 * admin page, the member-facing week board, and the season's week list. Three
 * hand-written descriptions of one state machine is how buildRank drifted, and
 * here the cost would be worse than a wrong label — a surface that names the
 * wrong next step sends a commissioner to press something the RPC will refuse.
 *
 * PURE, so the whole lifecycle is unit-testable without a database or a clock.
 * The caller supplies `resultsOpen` (ADR-080's gate) and `hasFilms` rather than
 * this module reaching for them.
 */
export function nextCommissionerStep(
  status: WeekStatus,
  opts: { resultsOpen: boolean; hasFilms: boolean; uncaptured: number },
): CommissionerStep {
  switch (status) {
    case "draft":
      return {
        label: "Open the week for bids",
        // A week with an empty slate can be opened by the database, and should
        // not be: players would see a week that takes bids on nothing.
        blockedBy: opts.hasFilms ? null : "Add films to the slate first",
        done: false,
      };
    case "open":
      return {
        label: "Close bidding",
        blockedBy: null,
        done: false,
      };
    case "closed":
      return {
        label:
          opts.uncaptured > 0
            ? `Capture ${opts.uncaptured} ${opts.uncaptured === 1 ? "result" : "results"}`
            : "Finish the week",
        // ADR-080: nothing may be scored until the opening weekend is over.
        blockedBy: opts.resultsOpen ? null : "Results open the Monday after the weekend",
        done: false,
      };
    case "final":
    case "skipped":
      return { label: "", blockedBy: null, done: true };
  }
}
