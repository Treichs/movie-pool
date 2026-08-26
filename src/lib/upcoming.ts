// Composition: the TMDB release list × a season's weeks × what is already on
// the slate. Everything here is PURE — no fetch, no Supabase, no clock except
// the `today` a caller passes in — so the whole grouping and week-mapping story
// is unit-testable without a network or a database.

import { matchReleaseToWeek, weekOf, type IsoDate, type WeekLike, type WeekMatch } from "@/lib/release-week";
import type { DiscoverFilm } from "@/lib/tmdb";

/** How far ahead /releases looks by default. */
export const DEFAULT_RANGE_WEEKS = 8;

/**
 * The ranges the picker offers, in weeks ahead.
 *
 * These live in this PURE module rather than beside the /releases data loader
 * because the range picker is a client component. Importing them from
 * lib/releases.ts pulled lib/auth — and with it next/navigation's redirect and
 * the cookie store — into the browser bundle and failed the build outright.
 * Anything a client component needs belongs on the pure side of the line.
 */
export const RANGE_OPTIONS = [4, DEFAULT_RANGE_WEEKS, 12, 26] as const;

/**
 * today → today + N weeks.
 *
 * IT NO LONGER VALIDATES THE RANGE, and that is the fix (2026-08-07). It used
 * to check `weeks` against RANGE_OPTIONS — the PICKER's list — and quietly fall
 * back to eight weeks for anything else. /releases offers a longer list of its
 * own (CALENDAR_RANGES, which reaches 52), so choosing "next year" there
 * computed an eight-week window while the page's own header read "over the next
 * year". Silent, and wrong in the direction that looks like TMDB having no
 * films rather than like a bug.
 *
 * Two callers with two legitimate lists means the list cannot live here. Each
 * caller already validates its own (`parseRange`, `parseCalendarRange`), so
 * this computes and only guards against nonsense a parser could not produce —
 * NaN, Infinity, zero or negative — which would otherwise yield an invalid or
 * inside-out window.
 */
export function rangeFor(today: IsoDate, weeks: number): { from: IsoDate; to: IsoDate } {
  return Number.isFinite(weeks) && weeks > 0
    ? { from: today, to: shift(today, Math.floor(weeks) * 7) }
    : defaultRange(today);
}

/** Parse `?weeks=` without trusting it. */
export function parseRange(raw: string | undefined): number {
  const n = Number(raw);
  return RANGE_OPTIONS.includes(n as (typeof RANGE_OPTIONS)[number])
    ? n
    : DEFAULT_RANGE_WEEKS;
}

const DAY = 86_400_000;

function shift(iso: IsoDate, days: number): IsoDate {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY).toISOString().slice(0, 10);
}

/** today → today + 8 weeks, as the discover query's inclusive bounds. */
export function defaultRange(today: IsoDate): { from: IsoDate; to: IsoDate } {
  return { from: today, to: shift(today, DEFAULT_RANGE_WEEKS * 7) };
}

/** A film already on some week of the season, keyed for the "on the slate" badge. */
export type SlateEntry = { tmdbId: number; weekNumber: number };

/** Pure half of ADR-051 re-dating: the wide date inside [from, to], earliest
 *  first if a film somehow has more than one in-window wide release. */
export function pickWideDateInWindow(
  dates: readonly string[],
  from: IsoDate,
  to: IsoDate,
): IsoDate | null {
  return dates.find((d) => d >= from && d <= to) ?? null;
}

/** ADR-061: what KIND of theatrical opening this is. "wide" and "limited" are
 *  facts read from film_catalog; "unknown" means the film is not in the
 *  catalogue yet and the discover query allowed both types, so the honest
 *  answer is that we do not know — never a guess. */
export type ReleaseTypeLabel = "wide" | "limited" | "unknown";

export type UpcomingFilm = {
  film: DiscoverFilm;
  releaseType: ReleaseTypeLabel;
  /** Null only when TMDB gave no release date at all. */
  weekOf: IsoDate | null;
  match: WeekMatch;
  /** Set when this tmdb_id is already on the season's slate. */
  onSlate: SlateEntry | null;
  /** True when a commissioner could add this film right now. */
  addable: boolean;
};

export type UpcomingGroup = {
  /** The Monday. Groups are ordered by it; films inside keep discover's order. */
  weekOf: IsoDate;
  /** The season week this Monday maps to, when one exists. */
  week: WeekLike | null;
  /** Set when picking here would append a new week. */
  wouldCreateWeek: { number: number } | null;
  /** True when this Monday is already behind us. TMDB's discover row carries a
   *  film's FIRST US date, so a re-release surfaces under its original week —
   *  decades old for Cars or Endgame. Past groups sort last and say why,
   *  rather than leading an "upcoming" page (found live, 2026-08-01). */
  past: boolean;
  films: UpcomingFilm[];
};

/**
 * Group the release list by the week each film belongs to.
 *
 * Films with no release date are collected separately rather than silently
 * dropped — a title TMDB has not dated yet is exactly the thing a commissioner
 * wants to know about, and hiding it would make the calendar quietly incomplete.
 */
export function buildUpcoming(
  films: readonly DiscoverFilm[],
  weeks: readonly WeekLike[],
  slate: readonly SlateEntry[],
  today: IsoDate,
  /** tmdb_id -> release type, from the catalogue. Absent means unknown. */
  releaseTypes: ReadonlyMap<number, ReleaseTypeLabel> = new Map(),
  /** False when the discover query was wide-only — then every film IS wide by
   *  construction and needs no catalogue row to prove it. */
  includeLimited = false,
): { groups: UpcomingGroup[]; undated: UpcomingFilm[] } {
  const onSlate = new Map(slate.map((s) => [s.tmdbId, s]));
  const byWeekOf = new Map<IsoDate, UpcomingFilm[]>();
  const undated: UpcomingFilm[] = [];

  for (const film of films) {
    const match = matchReleaseToWeek(film.releaseDate, weeks, today);
    const releaseType: ReleaseTypeLabel = includeLimited
      ? (releaseTypes.get(film.tmdbId) ?? "unknown")
      : "wide";
    const entry: UpcomingFilm = {
      releaseType,
      film,
      weekOf: weekOf(film.releaseDate),
      match,
      onSlate: onSlate.get(film.tmdbId) ?? null,
      // Already-on-slate films are shown, but not offered again — the RPC would
      // skip them anyway, and a checkbox that does nothing is a worse answer
      // than a badge that explains why.
      addable:
        !onSlate.has(film.tmdbId) &&
        (match.kind === "existing" || match.kind === "createable"),
    };
    if (entry.weekOf === null) {
      undated.push(entry);
      continue;
    }
    const bucket = byWeekOf.get(entry.weekOf);
    if (bucket) bucket.push(entry);
    else byWeekOf.set(entry.weekOf, [entry]);
  }

  // Upcoming weeks first in calendar order; already-past weeks (re-releases
  // surfacing under their original date) trail behind them, still visible —
  // never silently dropped, per the undated-films precedent above — but no
  // longer leading the page. See rerelease-date-mapping for the real fix.
  const currentWeek = weekOf(today);
  const isPast = (monday: IsoDate) => currentWeek !== null && monday < currentWeek;
  const groups: UpcomingGroup[] = [...byWeekOf.entries()]
    .sort(([a], [b]) => {
      if (isPast(a) !== isPast(b)) return isPast(a) ? 1 : -1;
      return a.localeCompare(b);
    })
    .map(([mondayOf, entries]) => {
      const existing = entries.find((e) => e.match.kind === "existing");
      const createable = entries.find((e) => e.match.kind === "createable");
      return {
        weekOf: mondayOf,
        week: existing?.match.kind === "existing" ? existing.match.week : null,
        wouldCreateWeek:
          createable?.match.kind === "createable"
            ? { number: createable.match.nextNumber }
            : null,
        past: isPast(mondayOf),
        films: entries,
      };
    });

  return { groups, undated };
}

/** The films a commissioner has actually ticked, resolved back to their groups. */
export function selectionSummary(
  groups: readonly UpcomingGroup[],
  selected: ReadonlySet<number>,
): { count: number; perWeek: { label: string; count: number }[]; createsWeeks: number } {
  const perWeek: { label: string; count: number }[] = [];
  let count = 0;
  let createsWeeks = 0;
  for (const g of groups) {
    const n = g.films.filter((f) => selected.has(f.film.tmdbId)).length;
    if (n === 0) continue;
    count += n;
    if (g.week) perWeek.push({ label: `Week ${g.week.number}`, count: n });
    else if (g.wouldCreateWeek) {
      perWeek.push({ label: `new Week ${g.wouldCreateWeek.number}`, count: n });
      createsWeeks++;
    } else perWeek.push({ label: `week of ${g.weekOf}`, count: n });
  }
  return { count, perWeek, createsWeeks };
}
