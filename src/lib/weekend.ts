import type { RevealFilm } from "@/lib/reveal";
import type { StandingsRow } from "@/lib/pool";
import { rankBy } from "@/lib/pool";

/**
 * THE WEEKEND — the three or four days between the reveal and Monday's capture.
 *
 * `week-status.ts` already names this state better than any brief could: "a
 * player spends three or four days of every week knowing exactly what they own
 * and not yet what it was worth. That is the most interesting state in the
 * game, not a transient one." Until now the page spent it showing two dashes
 * where a score would go.
 *
 * ── IT PREDICTS NOTHING, AND THAT IS THE DESIGN ───────────────────────────
 * There is no box office between Friday and Monday. The rulebook captures on
 * Monday morning precisely so a moving Tomatometer cannot be gamed, and
 * inventing a mid-weekend estimate would be this app answering a question the
 * game deliberately refuses to answer.
 *
 * So nothing here forecasts. Every number is either something already true
 * (what you own, what you paid, how far behind you are) or a RATE — the exact
 * arithmetic the rulebook's own formula gives, run forwards:
 *
 *     score = opening ($M) × Tomatometer / 100
 *
 * At 90%, every $10M a film opens is worth 9.00 points. That is not a guess
 * about the weekend; it is what the rule will do to whatever the weekend
 * produces, and it is the difference between anticipation and fabrication.
 *
 * ── THE LIVE TOMATOMETER IS HALF THE FORMULA, AND IT IS ALREADY HERE ──────
 * `RevealFilm.liveTomatometer` is documented as "the anticipation window's
 * live second factor" — polled from OMDb, present ONLY until the commissioner
 * captures. This is the window it was named for. A film with no rating yet has
 * a null rate rather than a rate of zero: nobody has reviewed it, which is not
 * the same as it being worthless.
 */

/** One film the reader owns, and what it is worth per $10M it opens. */
export type WeekendFilm = {
  filmId: string;
  title: string;
  posterPath: string | null;
  tmdbId: number | null;
  /** What the reader paid for it. Owners pay their own bid. */
  paid: number;
  /** Captured if it exists, otherwise the live cache. */
  tomatometer: number | null;
  /**
   * Points per $10M of opening, at the current Tomatometer. Null until the
   * film has a rating — a film nobody has reviewed has no rate, and printing
   * 0.00 would read as a prediction that it will score nothing.
   */
  ratePer10M: number | null;
  /** Other owners, because a film you share is a film you cannot gain on. */
  sharedWith: string[];
};

export type WeekendRival = {
  name: string;
  /** Their season points minus yours: positive means they are ahead. */
  gap: number;
  /** How many of this weekend's films they own. */
  filmsOwned: number;
  /** Films you both own — neither of you gains a point on the other there. */
  shared: string[];
};

export type WeekendWatch = {
  films: WeekendFilm[];
  spent: number;
  /** The Monday capture opens on, as an ISO date. */
  resultsOn: string;
  /** The season rival nearest you on points, and what they hold this weekend.
   *  Null before anything has scored, when nobody is ahead of anybody. */
  rival: WeekendRival | null;
};

/** The rulebook's formula, run forwards: what $10M is worth at this rating. */
function ratePer10M(tomatometer: number | null): number | null {
  if (tomatometer === null || tomatometer <= 0) return null;
  return Math.round(10 * (tomatometer / 100) * 100) / 100;
}

export function buildWeekendWatch(
  sheet: readonly RevealFilm[],
  standings: readonly StandingsRow[],
  seasonMemberId: string,
  weekOf: string,
  resultsOn: string,
): WeekendWatch | null {
  // A REMOVED FILM IS NOT PART OF THE WEEKEND. It scores for nobody and its
  // bids were refunded, so watching it all weekend would be watching nothing.
  const played = sheet.filter((f) => !f.removed);

  const films: WeekendFilm[] = played
    .filter((f) => f.rows.some((r) => r.isMe && r.isWinning))
    .map((f) => {
      const mine = f.rows.find((r) => r.isMe && r.isWinning)!;
      const tomatometer = f.tomatometer ?? f.liveTomatometer;
      return {
        filmId: f.filmId,
        title: f.title,
        posterPath: f.posterPath,
        tmdbId: f.tmdbId,
        paid: mine.amount,
        tomatometer,
        ratePer10M: ratePer10M(tomatometer),
        sharedWith: f.rows
          .filter((r) => r.isWinning && !r.isMe)
          .map((r) => r.name),
      };
    });

  if (films.length === 0) return null;

  // ---- The season rival either side of you -------------------------------
  //
  // The week view does not otherwise pay for a whole-season read on an
  // unscored week, and its own comment gives the reason: "an unscored week
  // moved nobody anywhere". That is right about MOVEMENT and wrong about
  // POSITION — where you stand is exactly what is at stake across a weekend,
  // and it is why this screen asks for the read the rank line does not.
  let rival: WeekendRival | null = null;
  const scored = standings.some((r) => Number(r.points) > 0);
  const me = standings.find((r) => r.season_member_id === seasonMemberId);

  if (scored && me) {
    const ranks = new Map(
      rankBy(
        [...standings].sort((a, b) => Number(b.points) - Number(a.points)),
        (r) => Number(r.points),
      ).map(([rank, r]) => [r.season_member_id, rank]),
    );
    const myRank = ranks.get(seasonMemberId) ?? 1;
    // Nearest on POINTS, either side, and never somebody level with you: a
    // player you are tied with is not a gap to close.
    const others = standings
      .filter((r) => r.season_member_id !== seasonMemberId)
      .filter((r) => (ranks.get(r.season_member_id) ?? 0) !== myRank)
      .sort(
        (a, b) =>
          Math.abs(Number(a.points) - Number(me.points)) -
          Math.abs(Number(b.points) - Number(me.points)),
      );
    const nearest = others[0];
    if (nearest) {
      const theirFilms = played.filter((f) =>
        f.rows.some(
          (r) => r.isWinning && r.seasonMemberId === nearest.season_member_id,
        ),
      );
      rival = {
        name: nearest.display_name,
        gap:
          Math.round((Number(nearest.points) - Number(me.points)) * 100) / 100,
        filmsOwned: theirFilms.length,
        shared: theirFilms.filter((f) => f.iOwn).map((f) => f.title),
      };
    }
  }

  return {
    films,
    spent: films.reduce((n, f) => n + f.paid, 0),
    resultsOn,
    rival,
  };
}
