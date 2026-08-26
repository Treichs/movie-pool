// The /releases data loader — TMDB's US wide-release calendar, resolved against
// one season's weeks and slate.
//
// Season is a FILTER here, not the subject. The theatrical calendar is
// season- and league-agnostic; a member between seasons still gets the full
// list, just without the "-> Week 5" column and the on-the-slate badges. That
// is why /releases is a top-level route rather than living under
// /season/[id]: nesting it would imply it IS season data and would force a
// season context a between-seasons league does not have.

import type { SupabaseClient } from "@/lib/supabase";
import { getMemberships } from "@/lib/auth";
import { getFilms, getWeeks, type Week, type WeekStatus } from "@/lib/commish";
import { weekOf } from "@/lib/release-week";
import {
  fetchMovieDetail,
  fetchUsWideDates,
  tmdbConfigured,
  type DiscoverFilm,
} from "@/lib/tmdb";
import { fetchReleaseWindow } from "@/lib/release-window";
import { fetchOmdb, omdbConfigured } from "@/lib/omdb";
import {
  buildUpcoming,
  pickWideDateInWindow,
  rangeFor,
  type ReleaseTypeLabel,
  type SlateEntry,
  type UpcomingFilm,
  type UpcomingGroup,
} from "@/lib/upcoming";

// Re-exported so a server page imports its range helpers from one place, while
// the definitions stay in the pure module the client component can reach.
export { parseRange, RANGE_OPTIONS } from "@/lib/upcoming";

export type ReleasesData = {
  /** False when TMDB_READ_TOKEN is unset — a distinct state from an API error. */
  configured: boolean;
  /** Set when TMDB was reachable but unhappy. Null on success. */
  error: string | null;
  groups: UpcomingGroup[];
  /** Films TMDB has not dated. Surfaced, never silently dropped. */
  undated: UpcomingFilm[];
  /** Films whose US release list held no wide date inside the window — the
   *  one drop ADR-051 permits, surfaced as a count rather than silence. */
  unresolvedRereleases: number;
  season: { id: string; name: string } | null;
  weeks: Week[];
  /** Drives whether the picker renders at all. Players get no add affordance. */
  isCommissioner: boolean;
  rangeWeeks: number;
  from: string;
  to: string;
};

/**
 * A film whose TMDB release date has moved since it was added to a week.
 *
 * `sameWeek` is the whole distinction. A date that moved within the week is a
 * stale label and nothing more — films.release_date is a display field, not a
 * scoring input — so it is offered as a one-click correction. A date that moved
 * to a DIFFERENT week means the film is on the wrong weekend, possibly with
 * bids already against it, and that is the commissioner's call to make.
 */
export type ReleaseDrift = {
  filmId: string;
  title: string;
  storedDate: string | null;
  tmdbDate: string;
  sameWeek: boolean;
  /** The Monday of the week TMDB now says it opens in. */
  tmdbWeekOf: string;
  /** The season week that Monday maps to, when one exists. */
  targetWeekNumber: number | null;
  /** The same week's id, so a move can be offered without a second lookup.
   *  Null and targetWeekNumber null travel together — there is nowhere to
   *  move the film to, and the UI must offer Remove alone. */
  targetWeekId: string | null;
  /** The target week's status. Only draft/open can take a film, so a week that
   *  exists but has closed still cannot be moved into — and the difference
   *  between "no such week" and "that week has closed" is worth telling. */
  targetWeekStatus: WeekStatus | null;
};

/**
 * Re-read TMDB for films already on a week and report any whose wide-release
 * date has moved.
 *
 * Cached (1h) rather than fresh: this runs on a page view, not at pick time,
 * and its only job is to notice a change. Films with no tmdb_id — every
 * manually-added one — cost no request.
 */
export async function checkReleaseDrift(
  films: readonly { id: string; title: string; tmdb_id: number | null; release_date: string | null }[],
  weeks: readonly Week[],
): Promise<ReleaseDrift[]> {
  if (!tmdbConfigured()) return [];
  const weekAt = new Map(weeks.map((w) => [w.week_of, w]));

  // PARALLEL SINCE 2026-08-07. One week's slate is at most a handful of films,
  // so sequential was fine while this only ever ran on a single week's page.
  // The season-wide check calls it with every film on every editable week — 44
  // on the S33 replica — and forty-four serialised detail lookups is a page
  // nobody would wait for. Cached reads, so a warm season costs nothing either
  // way; this is about the cold one.
  const checked = await Promise.all(
    films.map(async (film) => {
      if (film.tmdb_id === null) return null;
      const res = await fetchMovieDetail(film.tmdb_id, fetch, "cached");
      if (!res.ok) return null; // a TMDB blip must never break the page
      const tmdbDate = res.data.release_date_us_wide;
      if (!tmdbDate || tmdbDate === film.release_date) return null;

      const tmdbWeekOf = weekOf(tmdbDate);
      if (tmdbWeekOf === null) return null;
      const target = weekAt.get(tmdbWeekOf) ?? null;
      return {
        filmId: film.id,
        title: film.title,
        storedDate: film.release_date,
        tmdbDate,
        sameWeek: film.release_date !== null && weekOf(film.release_date) === tmdbWeekOf,
        tmdbWeekOf,
        targetWeekNumber: target?.number ?? null,
        targetWeekId: target?.id ?? null,
        targetWeekStatus: target?.status ?? null,
      } satisfies ReleaseDrift;
    }),
  );
  // Input order preserved, which for a season-wide check means week order.
  return checked.filter((d): d is ReleaseDrift => d !== null);
}

/** A drifted film plus the week it is CURRENTLY on, so a season-wide list can
 *  link to the page where something can be done about it. */
export type SeasonReleaseDrift = ReleaseDrift & {
  weekId: string;
  weekNumber: number;
};

/**
 * Every date that has moved across the whole season, not just the week someone
 * happens to be looking at (2026-08-07).
 *
 * THE GAP THIS CLOSES. checkReleaseDrift has existed since 20260801120000, but
 * it only ever ran on one week's commissioner page and only while that week was
 * still editable. So a studio could move a film to a different weekend and the
 * app knew — silently — until a commissioner opened that exact week. On a
 * nineteen-week season that is a notice nobody is going to trip over in time to
 * act on it.
 *
 * ONLY EDITABLE WEEKS ARE CHECKED, and that bound is doing real work. A closed
 * or final week is history: bids are in, points may be awarded, and the film's
 * stored date is a record of what players actually bid on rather than a claim
 * about the future. Re-checking those against a live TMDB would produce
 * warnings about things nobody may change, which is how a warning surface stops
 * being read. It also keeps the fan-out proportional to the weeks still ahead
 * rather than to the season's whole history.
 */
export async function getSeasonReleaseDrift(
  supabase: SupabaseClient,
  seasonId: string,
): Promise<SeasonReleaseDrift[]> {
  if (!tmdbConfigured()) return [];

  const weeks = await getWeeks(supabase, seasonId);
  const editable = weeks.filter((w) => w.status === "draft" || w.status === "open");
  if (editable.length === 0) return [];

  const slates = await Promise.all(
    editable.map(async (week) => ({
      week,
      // `active` only: a film already removed from a slate scores for nobody,
      // so its date moving is not news.
      films: (await getFilms(supabase, week.id)).filter((f) => f.status === "active"),
    })),
  );

  const perWeek = await Promise.all(
    slates.map(async ({ week, films }) => {
      const drift = await checkReleaseDrift(films, weeks);
      return drift.map((d) => ({ ...d, weekId: week.id, weekNumber: week.number }));
    }),
  );

  return perWeek.flat();
}

/**
 * What OMDb currently reports for a film, offered as a SUGGESTION at capture
 * time. Never persisted, never written to a scoring column — it reaches
 * films.tomatometer only if the commissioner submits it themselves (ADR-041).
 */
export type CaptureSuggestion = { tomatometer: number; source: "omdb" };

/**
 * Look up suggestions for a week's films, keyed by film id.
 *
 * Sequential, and only for films that need one: a free-tier OMDb key and at
 * most eight films. A film with no imdb_id (every manually-added one) is
 * skipped without a request, and a film with no Rotten Tomatoes score yet
 * simply produces no entry — that is not an error, and the capture form must
 * render exactly as it did before when it happens.
 */
export async function getCaptureSuggestions(
  films: readonly { id: string; imdb_id: string | null }[],
): Promise<Map<string, CaptureSuggestion>> {
  const out = new Map<string, CaptureSuggestion>();
  if (!omdbConfigured()) return out;
  for (const film of films) {
    if (!film.imdb_id) continue;
    const res = await fetchOmdb(film.imdb_id);
    if (res.ok && res.data.tomatometer !== null) {
      out.set(film.id, { tomatometer: res.data.tomatometer, source: "omdb" });
    }
  }
  return out;
}

/** One film opening in a single week's window, for the inline picker on the
 *  week page. A leaner shape than UpcomingFilm — the week is already known, so
 *  there is no week-mapping to carry. */
export type WeekCandidate = {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  releaseType: ReleaseTypeLabel;
  /** Already on this week's slate — shown, but not offered to add again. */
  onSlate: boolean;
};

export type WeekPickData = {
  /** False when TMDB_READ_TOKEN is unset — distinct from an API error. */
  configured: boolean;
  /** Set when TMDB was reachable but unhappy; null on success. */
  error: string | null;
  candidates: WeekCandidate[];
};

/**
 * The films opening in ONE week's Mon–Sun window, for the inline picker on the
 * week page (ADR-080 walkthrough). A focused slice of getReleases: just this
 * weekend, typed and slate-marked, so a commissioner ticks the weekend's
 * releases without leaving the week they are building. The full forward
 * calendar still lives at /commish/[seasonId]/picker for looking further ahead.
 */
export async function getWeekPickCandidates(
  supabase: SupabaseClient,
  week: { week_of: string },
  slateTmdbIds: ReadonlySet<number>,
): Promise<WeekPickData> {
  if (!tmdbConfigured()) return { configured: false, error: null, candidates: [] };
  const from = week.week_of;
  const sunday = new Date(`${week.week_of}T00:00:00Z`);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const to = sunday.toISOString().slice(0, 10);

  // Wide AND limited both: eligibility is a per-film call at settlement now
  // (ADR-078), so the picker offers the whole weekend and the commissioner
  // filters and decides.
  //
  // This was the THIRD copy of the two-query labelling fix, and the one that
  // got missed twice: "/releases was fixed on 2026-08-07 and getReleases
  // earlier today; this surface was missed both times BECAUSE EACH HAS ITS OWN
  // LOADER." All three share lib/release-window now (2026-08-12) — that note
  // acted on rather than merely recorded. Why the label needs two queries at
  // all, and why a failed second one means "unknown", is documented there.
  const pickWindow = await fetchReleaseWindow(from, to);
  if (!pickWindow.ok) return { configured: true, error: pickWindow.error, candidates: [] };

  // Exactly this Monday's films. A re-release TMDB dates to its ORIGINAL year
  // (ADR-051) falls outside the window and drops out here — the full calendar
  // route resolves those; a single-week quick-add does not need to.
  const films = pickWindow.films.filter(
    (f) => f.releaseDate !== null && weekOf(f.releaseDate) === week.week_of,
  );

  const candidates: WeekCandidate[] = films.map((f) => ({
    tmdbId: f.tmdbId,
    title: f.title,
    posterPath: f.posterPath,
    releaseDate: f.releaseDate,
    releaseType: pickWindow.labelOf(f.tmdbId),
    onSlate: slateTmdbIds.has(f.tmdbId),
  }));

  // Wide first, then limited, then unknown; alphabetical within each so the
  // order is stable across renders (discover sorts by popularity, which jitters).
  const rank: Record<ReleaseTypeLabel, number> = { wide: 0, limited: 1, unknown: 2 };
  candidates.sort(
    (a, b) => rank[a.releaseType] - rank[b.releaseType] || a.title.localeCompare(b.title),
  );

  return { configured: true, error: null, candidates };
}

/**
 * ADR-051: wide re-releases are biddable, so a discover row dated OUTSIDE the
 * queried window (TMDB reports the film's FIRST US date) is resolved against
 * its full US release list and re-dated to the wide date INSIDE the window —
 * Cars stops appearing under 2006 and lands on the weekend it actually
 * returns to theatres. Films with no in-window wide date are dropped and
 * counted; a lookup failure (API blip) keeps the film under its old date,
 * where buildUpcoming's past-group demotion still handles it honestly.
 *
 * PARALLEL SINCE 2026-08-07, and it had to become so. It ran sequentially on
 * the note that "outliers are a handful per window and the reads are cached, so
 * a request storm buys nothing" — true while the discover fetch stopped at 3
 * pages and returned 60 films. Uncapping it returns every film in the window,
 * several hundred, and the outliers scale with them: what was a handful of
 * sequential lookups became something like ninety, each with an 8-second
 * timeout, one after another. That is a cold load nobody would wait through.
 *
 * Only the outliers are fetched — a film already dated inside the window costs
 * nothing — so the fan-out is proportional to re-releases, not to the slate.
 */
async function redateRereleases(
  films: readonly DiscoverFilm[],
  from: string,
  to: string,
): Promise<{ films: DiscoverFilm[]; unresolvedRereleases: number }> {
  const inWindowAlready = (f: DiscoverFilm) =>
    f.releaseDate === null || (f.releaseDate >= from && f.releaseDate <= to);

  // Three outcomes, kept apart because two of them look alike and are not:
  //   re-dated  — TMDB had a wide date inside the window; use it
  //   dropped   — TMDB ANSWERED and had none; drop the film and count it
  //   neither   — the lookup FAILED; keep the film at its old date, where
  //               buildUpcoming's past-group demotion shows it honestly
  // Collapsing a failure into a drop would silently hide films whenever TMDB
  // hiccuped, which is the opposite of what the count is for.
  const outliers = films.filter((f) => !inWindowAlready(f));
  const lookups = await Promise.all(
    outliers.map(async (f) => {
      const dates = await fetchUsWideDates(f.tmdbId);
      return { tmdbId: f.tmdbId, dates };
    }),
  );

  const redated = new Map<number, string>();
  const dropped = new Set<number>();
  for (const { tmdbId, dates } of lookups) {
    if (!dates.ok) continue;
    const inWindow = pickWideDateInWindow(dates.data, from, to);
    if (inWindow) redated.set(tmdbId, inWindow);
    else dropped.add(tmdbId);
  }

  // Rebuilt in the ORIGINAL order. The caller groups by week afterwards, and
  // popularity order survives inside each group — which is what orders a week.
  const out: DiscoverFilm[] = [];
  for (const film of films) {
    if (dropped.has(film.tmdbId)) continue;
    const date = redated.get(film.tmdbId);
    out.push(date ? { ...film, releaseDate: date } : film);
  }
  return { films: out, unresolvedRereleases: dropped.size };
}

/** Every film already on this season's slate, so the browse list can badge it. */
async function getSlate(
  supabase: SupabaseClient,
  weeks: Week[],
): Promise<SlateEntry[]> {
  if (weeks.length === 0) return [];
  const { data } = await supabase
    .from("films")
    .select("tmdb_id, week_id")
    .in(
      "week_id",
      weeks.map((w) => w.id),
    )
    .eq("status", "active")
    .not("tmdb_id", "is", null);
  const numberOf = new Map(weeks.map((w) => [w.id, w.number]));
  return ((data ?? []) as { tmdb_id: number; week_id: string }[]).map((f) => ({
    tmdbId: f.tmdb_id,
    weekNumber: numberOf.get(f.week_id) ?? 0,
  }));
}

export async function getReleases(
  supabase: SupabaseClient,
  userId: string,
  opts: { seasonId: string | null; rangeWeeks: number; today: string },
): Promise<ReleasesData> {
  const { from, to } = rangeFor(opts.today, opts.rangeWeeks);

  const memberships = await getMemberships(supabase, userId);
  const membership = opts.seasonId
    ? (memberships.find((m) => m.season.id === opts.seasonId) ?? null)
    : (memberships.find((m) => m.season.status === "active") ?? null);
  const seasonId = membership?.season.id ?? null;

  // Deliberately parallel and independently failable: a TMDB outage must not
  // stop the page rendering the season context, and an empty season must not
  // stop it rendering the calendar.
  //
  // The calendar shows EVERY release — wide and limited both. There is no
  // eligibility filter: what lands on a week is whatever the commissioner
  // picks, week by week, so the picker offers the full theatrical calendar.
  //
  // The fetch and the wide/limited label both come from lib/release-window now
  // (2026-08-12), which is where the two-query reasoning lives. The extra
  // reason it matters more HERE than on the public browse page: eligibility is
  // wide-release by default (rulebook §2), so "show me only the wide ones" is
  // the commissioner's actual question when filling a slate — and it cannot be
  // asked honestly while the answer is a guess.
  const [weeks, releaseWindow] = await Promise.all([
    seasonId ? getWeeks(supabase, seasonId) : Promise.resolve([]),
    fetchReleaseWindow(from, to),
  ]);
  const slate = await getSlate(supabase, weeks);

  const { films, unresolvedRereleases } = await redateRereleases(
    releaseWindow.films,
    from,
    to,
  );

  // Built over the RE-DATED set, not the fetched one: redateRereleases drops
  // films and rewrites dates, so labelling before it would carry entries for
  // films that are no longer here. `labelOf` is keyed on tmdb id, which
  // re-dating does not touch, so the lookup stays valid across it.
  const releaseTypes = new Map<number, ReleaseTypeLabel>(
    films.map((f) => [f.tmdbId, releaseWindow.labelOf(f.tmdbId)]),
  );

  const { groups, undated } = buildUpcoming(
    films,
    weeks,
    slate,
    opts.today,
    releaseTypes,
    true,
  );

  return {
    configured: tmdbConfigured(),
    error: releaseWindow.error,
    groups,
    undated,
    unresolvedRereleases,
    season: membership ? { id: membership.season.id, name: membership.season.name } : null,
    weeks,
    isCommissioner: membership?.role === "commissioner",
    rangeWeeks: opts.rangeWeeks,
    from,
    to,
  };
}

