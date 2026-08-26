import type { Film, LeagueSettings, WeekStatus } from "@/lib/commish";
import type { RevealedBid } from "@/lib/pool";

// The film slide-out's data contract (ADR-023). One shape, built server-side
// and handed to the client drawer, so the drawer never fetches and every
// surface that lists a film can open the same panel: the season hub's slate
// and owned films today, the week/bidding screen next.
//
// The bid-secrecy rule is enforced HERE rather than in the drawer, so a
// component can't leak an amount by rendering the wrong field: while a week is
// open, `bids[].amount` is null for everyone but you, because the amounts were
// never fetched (ADR-022 — they aren't ours to have yet).

export type FilmDetailBid = {
  seasonMemberId: string;
  /** The account behind the seat (ADR-082) — how the drawer's chips identify. */
  profileId: string;
  name: string;
  isMe: boolean;
  /** null while the week is open — sealed, not merely hidden (ADR-022). */
  amount: number | null;
  /** null until the week closes — closing decides ownership (ADR-070). */
  isWinning: boolean | null;
};

export type FilmDetail = {
  id: string;
  title: string;
  weekNumber: number;
  /** The week's Monday — what the UI labels "Week of {date}" (ADR-042). */
  weekOf: string;
  openingDate: string;
  /** The film's OWN US wide-release date. Null for a manually-added film. */
  releaseDate: string | null;
  /** Set only for catalog films — the key to /films/[tmdbId]. */
  tmdbId: number | null;

  // ---- from film_catalog; all null for a manually-added film ----
  posterPath: string | null;
  overview: string | null;
  certification: string | null;
  runtimeMin: number | null;
  trailerKey: string | null;

  eligible: boolean;
  removed: boolean;
  removedReason: string | null;

  weekStatus: WeekStatus;
  /** True once the week is locked or later — amounts and winners are public. */
  revealed: boolean;

  myBid: number | null;
  minBid: number;
  /** How many distinct amounts win the film, from the SEASON's settings.
   *  Carried for the same reason as `minBid`: the drawer states this rule to a
   *  player who is deciding what to bid, and it used to say "three" in hardcoded
   *  prose while `top_n_distinct` was configurable per season (fixed 2026-08-12). */
  topNDistinct: number;
  iOwn: boolean;

  boxOfficeM: number | null;
  tomatometer: number | null;
  score: number | null;

  bids: FilmDetailBid[];
};

// Sealed-week ordering can't be by amount (we don't have them), so it falls
// back to name — anything else would imply an order that leaks something.
export function sortDetailBids(bids: FilmDetailBid[]): FilmDetailBid[] {
  return [...bids].sort(
    (a, b) => (b.amount ?? 0) - (a.amount ?? 0) || a.name.localeCompare(b.name)
  );
}

/** A film plus the week facts the detail needs. Both callers already have these. */
export type FilmWithWeek = Film & {
  weekNumber: number;
  weekOf: string;
  openingDate: string;
  weekStatus: WeekStatus;
};

// The ONE place a FilmDetail is assembled, so the season hub and the week board
// cannot drift on what may be known when. It lives beside the type rather than
// inside either caller's data loader for exactly that reason.
//
// `revealed` (real bids, post-close) is passed whole and filtered here.
//
// AN OPEN WEEK NOW LISTS NOBODY (2026-08-05). It used to map every bidder to a
// row carrying their display_name with `amount: null` — sealed amounts, public
// participation, which is what ADR-022 chose. That signal is withdrawn: knowing
// WHO has bid is strategic information in its own right, and a count would leak
// the same thing in aggregate. So an open week returns an empty list and your
// own bid is reported separately, via `myBid`.
export function buildFilmDetail({
  liveTomatometer,
  film,
  config,
  myBid,
  iOwn,
  seasonMemberId,
  revealed,
}: {
  film: FilmWithWeek;
  config: LeagueSettings | null;
  myBid: number | null;
  iOwn: boolean;
  seasonMemberId: string;
  revealed: RevealedBid[];
  /** The film_ratings cache for this film's imdb_id (ADR-062), used ONLY when
   *  the commissioner has captured nothing yet. Omit and the drawer shows a
   *  dash until capture, which is what it did before 2026-08-07. */
  liveTomatometer?: number | null;
}): FilmDetail {
  const open = film.weekStatus === "open";

  // Nothing at all while the week is open — not names, not a count.
  const bids: FilmDetailBid[] = open
    ? []
    : revealed
        .filter((b) => b.film_id === film.id)
        .map((b) => ({
          seasonMemberId: b.member.id,
          profileId: b.member.profile.id,
          name: b.member.profile.display_name,
          isMe: b.member.id === seasonMemberId,
          amount: b.amount,
          isWinning: b.is_winning,
        }));

  return {
    id: film.id,
    title: film.title,
    weekNumber: film.weekNumber,
    weekOf: film.weekOf,
    openingDate: film.openingDate,
    // The film's own date when we have it; otherwise nothing, rather than
    // borrowing the week's date and presenting a guess as a fact (ADR-042).
    releaseDate: film.release_date,
    tmdbId: film.tmdb_id,
    posterPath: film.catalog?.poster_path ?? null,
    overview: film.catalog?.overview ?? null,
    certification: film.catalog?.certification ?? null,
    runtimeMin: film.catalog?.runtime_min ?? null,
    trailerKey: film.catalog?.trailer_youtube_key ?? null,
    eligible: film.eligible,
    removed: film.status === "removed",
    removedReason: film.removed_reason,
    weekStatus: film.weekStatus,
    revealed: !open,
    myBid,
    minBid: config?.min_bid ?? 1,
    // The 3 fallback matches lib/season-settings.ts's default and the rulebook's
    // stated rule. It applies only when a season has no settings row at all.
    topNDistinct: config?.top_n_distinct ?? 3,
    iOwn,
    boxOfficeM: film.box_office_m,
    // THE CAPTURED VALUE WINS, ALWAYS; the cached live one fills in until there
    // is one (ADR-062). Never the other way round — showing a fresher figure in
    // place of the one that actually SCORED the film would contradict the
    // points printed beside it.
    tomatometer: film.tomatometer ?? liveTomatometer ?? null,
    score: film.score,
    bids: sortDetailBids(bids),
  };
}
