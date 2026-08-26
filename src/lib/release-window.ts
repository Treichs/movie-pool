import { fetchUpcomingAll, tmdbConfigured, type DiscoverFilm } from "@/lib/tmdb";
import type { ReleaseTypeLabel } from "@/lib/upcoming";

// THE ONE PLACE THE RELEASE WINDOW IS FETCHED AND LABELLED (2026-08-12).
//
// Every surface that browses the theatrical calendar needs the same two facts:
// which films open inside a window, and whether each opening is wide or
// limited. Getting the second one right takes TWO discover queries, because
// TMDB's filter takes `2|3` as an OR and then will not say which side matched
// — so a single call can only ever establish "wide or limited". Asking for
// everything, then for wide-only, and labelling by membership of the wide set
// gives TMDB's own answer for every row.
//
// WHY THIS MODULE EXISTS. That two-query fix had to be made three times, and
// was missed twice. lib/releases.ts still carries the note: "/releases was
// fixed on 2026-08-07 and getReleases earlier today; this surface was missed
// both times BECAUSE EACH HAS ITS OWN LOADER." Three copies of a fix is three
// chances to miss the next one, and the app had already spent two of them. The
// three callers — getCalendar, getReleases and getWeekPickCandidates — do
// genuinely different things AFTER this step (re-release re-dating, week
// mapping, slate badging, and they disagree about those deliberately), so what
// is shared is exactly this: the fetch and the label, and nothing downstream.
//
// A NOTE ON WHAT IS *NOT* SHARED, so nobody folds it in later. The range lists
// stay with their callers (CALENDAR_RANGES reaches 30, RANGE_OPTIONS reaches
// 26) — lib/upcoming.ts records why `rangeFor` stopped validating them, and the
// short version is that two callers with two legitimate lists means the list
// cannot live in the shared layer. Re-release handling stays split too: the
// picker re-dates them per ADR-051 at the cost of a lookup per outlier, the
// public calendar drops them. Both are deliberate.

/** A fetched window: the films, and TMDB's own wide/limited answer for each. */
export type ReleaseWindow = {
  /** False when TMDB is unconfigured OR the primary query failed. Callers
   *  report the two states differently, which is why `error` is null for the
   *  first — an unset token is a configuration state, not an API error. */
  ok: boolean;
  error: string | null;
  /** Every film TMDB reported in [from, to]. Empty unless `ok`. */
  films: DiscoverFilm[];
  /**
   * The release type for one film.
   *
   * A FUNCTION RATHER THAN A MAP, because the three callers label different
   * subsets: the calendar labels every row it keeps, the week picker labels one
   * Monday's worth, and getReleases labels the set that survives re-dating —
   * which contains ids the original fetch never returned under those dates.
   * Handing back a prebuilt map would force each caller to rebuild it anyway.
   */
  labelOf: (tmdbId: number) => ReleaseTypeLabel;
};

/**
 * "unknown" for everything.
 *
 * THIS IS THE FAILURE ANSWER EVERYWHERE NOW (developer's call, 2026-08-12).
 * The three copies disagreed: two returned "unknown" when the wide-only query
 * failed, and the public calendar returned "wide" for every film on the
 * argument that wide is the commoner case and the one the page is for.
 *
 * That argument loses on a straightforward point. Wide release is what makes a
 * film ELIGIBLE (rulebook §2), so labelling an unverified film "wide" is
 * asserting a fact we tried and failed to fetch — on the surface with the
 * widest audience and the least context to catch it. The honest cost is that a
 * TMDB hiccup empties the calendar's release-type filter instead of matching
 * everything: it looks broken because something IS broken, which is the correct
 * failure and the opposite of the silent-default class of bug this codebase has
 * been dug out of repeatedly.
 */
const ALL_UNKNOWN = (): ReleaseTypeLabel => "unknown";

/**
 * Fetch one window and label it.
 *
 * The two queries run in parallel: the wide-only call is pure decoration, so it
 * must never serialise behind the call that produces the actual list.
 *
 * A FAILED WIDE-ONLY CALL STILL RETURNS THE FILMS. Losing the label is not
 * losing the window — the page renders every film with no release-type badge,
 * which is materially better than an empty calendar and is why this returns
 * `ok: true` with `ALL_UNKNOWN` rather than failing the whole thing.
 */
export async function fetchReleaseWindow(
  from: string,
  to: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ReleaseWindow> {
  // Checked here rather than by each caller so an unconfigured deployment takes
  // the same path everywhere. Callers still call tmdbConfigured() themselves for
  // the `configured` flag they report — that is a different question (should
  // this surface exist at all) from this one (did we get any films).
  if (!tmdbConfigured()) {
    return { ok: false, error: null, films: [], labelOf: ALL_UNKNOWN };
  }

  const [everything, wideOnly] = await Promise.all([
    fetchUpcomingAll(from, to, fetchImpl, true),
    fetchUpcomingAll(from, to, fetchImpl, false),
  ]);

  if (!everything.ok) {
    return { ok: false, error: everything.error, films: [], labelOf: ALL_UNKNOWN };
  }
  if (!wideOnly.ok) {
    return { ok: true, error: null, films: everything.data, labelOf: ALL_UNKNOWN };
  }

  // Wide wins a tie, by construction: a film carrying both a wide and a limited
  // date is in the wide set, and it is the one a league can actually bid on.
  const wideIds = new Set(wideOnly.data.map((f) => f.tmdbId));
  return {
    ok: true,
    error: null,
    films: everything.data,
    labelOf: (tmdbId) => (wideIds.has(tmdbId) ? "wide" : "limited"),
  };
}
