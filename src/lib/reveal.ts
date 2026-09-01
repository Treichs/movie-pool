import type { FilmDetailBid } from "@/lib/film-detail";

// THE REVEAL SHEET — the pure half (ADR-107, implementing ADR-096's locked shape).
//
// Everything here is a pure function over bids that have already been revealed.
// No fetch, no Supabase, no clock — so the two things worth arguing about, the
// SPREAD ranking and where the CUT falls, are unit-testable without a database.
//
// The shape this serves is locked and is not ours to redesign; it came out of
// six built variants walked in one sitting, and the winner was the
// commissioner's own results email with a poster added. Docs/design/
// reveal-locked-shape.html carries the locked-vs-open ledger. What is locked and
// implemented here: one film is a poster beside a list, one line per bidder,
// "Everyone else — $0" closing the roster, the cut as a single hairline with
// losing bids KEPT below it rather than hidden, bars scaled to the WEEK's top
// bid, and films ranked by spread then owners then bidders.

/** One bidder's line. Ties are separate rows — collapsing them onto one line is
 *  listed as open in ADR-096's ledger and is deliberately not done here. */
export type RevealRow = {
  seasonMemberId: string;
  profileId: string;
  name: string;
  amount: number;
  /** Above the cut. Owns the film in full and pays their own bid. */
  isWinning: boolean;
  isMe: boolean;
};

export type RevealFilm = {
  filmId: string;
  title: string;
  posterPath: string | null;
  tmdbId: number | null;
  /** Null until the commissioner captures — a `closed` week has none. */
  score: number | null;
  boxOfficeM: number | null;
  tomatometer: number | null;
  removed: boolean;
  /** The film_ratings cache's figure, present ONLY until capture — the
   *  anticipation window's live second factor. Null once the commissioner
   *  has captured (the captured value owns `tomatometer` then, ADR-062) and
   *  null when the cache has nothing to say. */
  liveTomatometer: number | null;
  /** Bidders at more than $0, highest first. */
  rows: RevealRow[];
  /** The lowest WINNING amount — the hairline sits directly under it. Null when
   *  nothing won, which happens on a film nobody bid on. */
  cut: number | null;
  /** Top bid minus the cut: how much argument the film produced. */
  spread: number;
  /** How many players are not on the list. Collapses both the $0 bids and the
   *  players who never opened a sheet, which is what the email always did. */
  everyoneElse: number;
  /** True when I bid at all, at any amount above zero. */
  iBid: boolean;
  iOwn: boolean;
};

/** A film as the week board already has it, narrowed to what the sheet reads. */
export type RevealInput = {
  id: string;
  title: string;
  tmdb_id: number | null;
  score: number | string | null;
  box_office_m: number | string | null;
  tomatometer: number | null;
  status: "active" | "removed";
  detail: {
    posterPath: string | null;
    bids: FilmDetailBid[];
    /** FilmDetail's merged figure: captured ?? live cache (ADR-062). The
     *  sheet derives its live-only view from this against the raw column. */
    tomatometer: number | null;
  };
};

const num = (v: number | string | null): number | null =>
  v === null ? null : Number(v);

/**
 * Build one film's sheet.
 *
 * $0 BIDS COLLAPSE INTO "EVERYONE ELSE". A $0 bid is legal and never wins
 * (rulebook §4) — it records that a player looked at the film and declined it
 * at any price. On the sheet that is indistinguishable from not bidding, and
 * ADR-096 explicitly rejected naming individual $0 bids: "the email already
 * solved this with one collapsed line, which reports the whole roster without
 * listing nine people who did nothing."
 */
function buildFilm(film: RevealInput, rosterSize: number): RevealFilm {
  // `amount` is null only while a week is open, and this sheet never renders
  // then — but the type allows it, so it is filtered rather than asserted.
  const bids = film.detail.bids.filter(
    (b): b is FilmDetailBid & { amount: number } => b.amount !== null
  );

  const rows: RevealRow[] = bids
    .filter((b) => b.amount > 0)
    .map((b) => ({
      seasonMemberId: b.seasonMemberId,
      profileId: b.profileId,
      name: b.name,
      amount: b.amount,
      isWinning: b.isWinning === true,
      isMe: b.isMe,
    }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));

  const winning = rows.filter((r) => r.isWinning);
  const cut = winning.length > 0 ? winning[winning.length - 1].amount : null;
  const top = rows.length > 0 ? rows[0].amount : 0;

  return {
    filmId: film.id,
    title: film.title,
    posterPath: film.detail.posterPath,
    tmdbId: film.tmdb_id,
    score: num(film.score),
    boxOfficeM: num(film.box_office_m),
    tomatometer: film.tomatometer,
    // Live only BEFORE capture: detail.tomatometer is captured ?? cache, so
    // subtracting the captured case leaves exactly the window's live figure.
    liveTomatometer:
      film.tomatometer === null ? film.detail.tomatometer : null,
    removed: film.status === "removed",
    rows,
    cut,
    // Zero when everyone who got in paid the same. ADR-096 treats that as
    // meaningful rather than degenerate: those films sink and separate on
    // owners, which is the tie-break below.
    spread: cut === null ? 0 : top - cut,
    // Never negative: a roster can shrink, and a member who left after bidding
    // would otherwise produce a nonsense count.
    everyoneElse: Math.max(0, rosterSize - rows.length),
    iBid: rows.some((r) => r.isMe),
    iOwn: winning.some((r) => r.isMe),
  };
}

/**
 * The week's films, ranked for the sheet.
 *
 * SPREAD, THEN OWNERS, THEN BIDDERS (ADR-096, locked). Spread measures the
 * distance between getting in and overpaying — the argument the film produced —
 * where ranking by the cut alone answers "which was expensive to get into" and
 * leads with the dullest film on the sheet. Removed films sort last regardless:
 * they score for no one and their bids were refunded, so they are an epilogue
 * rather than a result.
 */
export function buildRevealSheet(
  films: readonly RevealInput[],
  rosterSize: number
): RevealFilm[] {
  return films
    .map((f) => buildFilm(f, rosterSize))
    .sort((a, b) => {
      if (a.removed !== b.removed) return a.removed ? 1 : -1;
      return (
        b.spread - a.spread ||
        b.rows.filter((r) => r.isWinning).length -
          a.rows.filter((r) => r.isWinning).length ||
        b.rows.length - a.rows.length ||
        a.title.localeCompare(b.title)
      );
    });
}

/**
 * The largest bid anywhere in the week.
 *
 * BARS SCALE TO THIS, NOT PER FILM (ADR-096, locked). Per-film scaling would
 * make a $2 top bid draw the same full-width bar as a $40 one, so every film
 * would look equally contested and the week would lose its shape. Returns 0 for
 * a week nobody bid on, and callers must not divide by it blind.
 */
export function weekTopBid(sheet: readonly RevealFilm[]): number {
  return sheet.reduce(
    (max, f) => (f.rows.length > 0 ? Math.max(max, f.rows[0].amount) : max),
    0
  );
}

// ————— The Monday half (the payoff storyboard's locked shape) —————

/**
 * One winning row's points per dollar — what the bar shows once it reverses.
 *
 * A LOSING ROW IS ZERO, not null: losers pay nothing and bank nothing, so
 * their reversed bar collapses honestly. A winning bid is never $0 (a $0 bid
 * is legal and never wins, rulebook §4), but the guard stays because a
 * division by a bad row must collapse a bar, not NaN the sheet.
 */
export function rowEfficiency(row: RevealRow, score: number | null): number {
  if (!row.isWinning || score === null || row.amount <= 0) return 0;
  return score / row.amount;
}

/**
 * The best points-per-dollar anywhere in the week — the reversed bars scale
 * to THIS, the same week-not-film rule the money bars follow (ADR-096).
 * Returns 0 when nothing has scored; callers must not divide by it blind.
 */
export function weekTopEfficiency(sheet: readonly RevealFilm[]): number {
  return sheet.reduce(
    (max, f) =>
      f.rows.reduce((m, r) => Math.max(m, rowEfficiency(r, f.score)), max),
    0
  );
}

/**
 * The films re-ranked BY WHAT THEY EARNED — the Monday storyboard's locked
 * re-rank beat ("the change of order is itself information"). Score
 * descending, unscored films after scored ones in their Thursday order,
 * removed films last as ever. Pure and non-mutating, so a ceremony can hold
 * both orders at once and step between them.
 */
export function rankFilmsByScore(sheet: readonly RevealFilm[]): RevealFilm[] {
  return [...sheet].sort((a, b) => {
    if (a.removed !== b.removed) return a.removed ? 1 : -1;
    const as = a.score;
    const bs = b.score;
    if (as === null && bs === null) return 0; // keep Thursday order
    if (as === null) return 1;
    if (bs === null) return -1;
    return bs - as || a.title.localeCompare(b.title);
  });
}

// ————— The ceremony's own copy (2026-09-01) —————

/** One player named in a brief, and whether they are the reader. */
export type RevealName = { name: string; isMine: boolean };

/**
 * The closest film the reader lost — the sentence a reveal exists to deliver.
 *
 * "You were outbid on Kraven by $1" is the whole drama of a sealed auction,
 * and every number in it was already on the sheet: the reader's own row and
 * the film's cut. Null when they won everything they bid on, or bid on
 * nothing, or lost only films that were never close.
 */
export type NearMiss = { title: string; mine: number; cut: number; short: number };

export type RevealBrief = {
  kind: "top" | "contested" | "narrowest" | "overpaid" | "value";
  label: string;
  names: RevealName[];
  film: string;
  figure: string;
  detail: string;
};

export type RevealStory = {
  nearMiss: NearMiss | null;
  briefs: RevealBrief[];
};

const nameOf = (r: RevealRow): RevealName => ({ name: r.isMe ? "You" : r.name, isMine: r.isMe });

/**
 * WHO BID WELL AND WHO BID POORLY — the half of a reveal that is about other
 * people, and the half this page never showed.
 *
 * Everything is read off the sheet the page already has. The four bid briefs
 * need no scores, so they land the moment a week closes — which is the moment
 * anybody cares — and the fifth appears on Monday once the films are captured.
 *
 * REMOVED FILMS ARE EXCLUDED. They score for nobody and their bids were
 * refunded, so naming somebody the week's biggest bid on a film that was
 * withdrawn would be a headline about money nobody spent.
 */
export function buildRevealStory(sheet: readonly RevealFilm[]): RevealStory {
  const live = sheet.filter((f) => !f.removed && f.rows.length > 0);
  const briefs: RevealBrief[] = [];

  // ---- The biggest bid anyone put in --------------------------------------
  const top = weekTopBid(live);
  if (top > 0) {
    const holders = live.flatMap((f) =>
      f.rows.filter((r) => r.amount === top).map((r) => ({ row: r, film: f }))
    );
    if (holders.length > 0) {
      briefs.push({
        kind: "top",
        label: "Biggest bid",
        names: holders.map((h) => nameOf(h.row)),
        film: [...new Set(holders.map((h) => h.film.title))].join(", "),
        figure: `$${top}`,
        detail: holders[0].row.isWinning ? "and it won" : "and it still lost",
      });
    }
  }

  // ---- The film that drew the most people ---------------------------------
  const contested = [...live].sort(
    (a, b) => b.rows.length - a.rows.length || a.title.localeCompare(b.title)
  )[0];
  if (contested && contested.rows.length > 1) {
    briefs.push({
      kind: "contested",
      label: "Most contested",
      names: [],
      // The only brief whose figure is a COUNT rather than a sum of money, so
      // the title has to sit inside the sentence rather than in front of it:
      // "Project Hail Mary — bidders" is not English.
      film: "",
      figure: String(contested.rows.length),
      detail: `bidders on ${contested.title}${
        contested.everyoneElse > 0 ? `, ${contested.everyoneElse} passed` : ""
      }`,
    });
  }

  // ---- The narrowest miss anywhere on the sheet ---------------------------
  //
  // The smallest gap between the lowest winning bid and the highest losing one.
  // It is the week's cruelty, and it is what people remember: a dollar decided
  // it. Only films where somebody actually lost can produce one.
  let narrowest: { film: RevealFilm; row: RevealRow; short: number } | null = null;
  for (const f of live) {
    if (f.cut === null) continue;
    const losers = f.rows.filter((r) => !r.isWinning);
    if (losers.length === 0) continue;
    // Rows are sorted descending, so the first loser is the highest one.
    const closest = losers[0];
    const short = f.cut - closest.amount;
    if (short > 0 && (narrowest === null || short < narrowest.short)) {
      narrowest = { film: f, row: closest, short };
    }
  }
  if (narrowest) {
    briefs.push({
      kind: "narrowest",
      label: "Narrowest miss",
      names: [nameOf(narrowest.row)],
      film: narrowest.film.title,
      figure: `$${narrowest.short}`,
      detail: `short of the cut at $${narrowest.film.cut}`,
    });
  }

  // ---- The widest spread: paying far more than it took to get in ----------
  //
  // `spread` is the film's own top-minus-cut, which ADR-096 already ranks the
  // sheet on. As a brief it names the person who paid the premium rather than
  // the film that produced it — "who bid poorly" is a person, not a title.
  const widest = [...live].sort((a, b) => b.spread - a.spread)[0];
  if (widest && widest.spread > 0 && widest.cut !== null) {
    briefs.push({
      kind: "overpaid",
      label: "Paid the most over",
      names: widest.rows
        .filter((r) => r.amount === widest.rows[0].amount)
        .map(nameOf),
      film: widest.title,
      figure: `$${widest.spread}`,
      detail: `more than the $${widest.cut} it took to get in`,
    });
  }

  // ---- Monday only: the best points per dollar in the week ----------------
  const bestRate = weekTopEfficiency(live);
  if (bestRate > 0) {
    const winners = live.flatMap((f) =>
      f.rows
        .filter((r) => Math.abs(rowEfficiency(r, f.score) - bestRate) < 0.005)
        .map((r) => ({ row: r, film: f }))
    );
    if (winners.length > 0) {
      briefs.push({
        kind: "value",
        label: "Best value",
        names: winners.map((w) => nameOf(w.row)),
        film: [...new Set(winners.map((w) => w.film.title))].join(", "),
        figure: bestRate.toFixed(2),
        detail: `points per dollar at $${winners[0].row.amount}`,
      });
    }
  }

  // ---- The reader's own near miss ----------------------------------------
  let nearMiss: NearMiss | null = null;
  for (const f of live) {
    if (f.cut === null) continue;
    const mine = f.rows.find((r) => r.isMe);
    if (!mine || mine.isWinning) continue;
    const short = f.cut - mine.amount;
    if (short > 0 && (nearMiss === null || short < nearMiss.short)) {
      nearMiss = { title: f.title, mine: mine.amount, cut: f.cut, short };
    }
  }

  return { nearMiss, briefs };
}
