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
