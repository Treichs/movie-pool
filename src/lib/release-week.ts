// Release-week mapping — the pure core of the film-catalog picker.
//
// THE RULE (settled by the developer 2026-07-31): a season week spans
// Monday -> Sunday, and the Monday's date is that week's "week of" label.
// A film releasing Friday 14 Aug 2026 belongs to the week of Monday 10 Aug 2026.
// The week NUMBER comes from where that week sits in its own season's sequence,
// so players simply see "Week 1".
//
// Zero imports, on purpose: this is the one piece of the feature that is pure,
// so it is the one piece that can be exhaustively unit-tested without a
// database, a network, or a React tree. SQL owns the authoritative copy
// (release_week_anchor); this twin exists for the UI's "-> Week 5" preview and
// the spike asserts the two agree over a fixed date vector.
//
// TIMEZONE SAFETY IS THE BUG CLASS HERE. Every function below works on the
// "YYYY-MM-DD" string via Date.UTC/getUTCDay and never touches a local-time
// getter. `new Date("2026-11-27")` parses as UTC midnight but `.getDay()` reads
// it in the runner's zone, so anywhere west of UTC it reports the PREVIOUS day
// and the anchor lands a week early. That failure is silent, environment
// -dependent, and would put films in the wrong week — so it is tested
// explicitly rather than assumed.

/** An ISO calendar date, "YYYY-MM-DD". No time, no zone. */
export type IsoDate = string;

export type WeekLike = {
  id: string;
  number: number;
  /** The week's stored date. May be the Friday the films open (the existing
   *  convention) or the Monday; matching only cares which Mon-Sun week it
   *  falls in, so both work. */
  opening_date: IsoDate;
  status: string;
};

export type WeekMatch =
  | { kind: "existing"; week: WeekLike; weekOf: IsoDate }
  | { kind: "createable"; weekOf: IsoDate; nextNumber: number }
  | {
      kind: "unmappable";
      weekOf: IsoDate | null;
      reason: "no-release-date" | "in-the-past" | "mid-season-gap" | "week-closed";
      /** Set when reason is "week-closed" — the status that blocked it. */
      weekStatus?: string;
    };

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse "YYYY-MM-DD" to a UTC epoch-day count. Returns null if malformed. */
function toUtcDays(iso: IsoDate | null | undefined): number | null {
  if (!iso) return null;
  const m = ISO.exec(iso);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  if (Number.isNaN(ms)) return null;
  // Reject dates that rolled over ("2026-02-31" -> 3 March).
  const back = new Date(ms);
  if (
    back.getUTCFullYear() !== y ||
    back.getUTCMonth() !== mo - 1 ||
    back.getUTCDate() !== d
  ) {
    return null;
  }
  return Math.floor(ms / 86_400_000);
}

function fromUtcDays(days: number): IsoDate {
  const d = new Date(days * 86_400_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/**
 * The Monday of the Mon-Sun week containing `iso` — the week's "week of" label.
 *
 * Idempotent (`weekOf(weekOf(d)) === weekOf(d)`) and total over valid dates.
 * Returns null only for a malformed or absent date, so callers must handle it
 * rather than silently mapping to today.
 */
export function weekOf(iso: IsoDate | null | undefined): IsoDate | null {
  const days = toUtcDays(iso);
  if (days === null) return null;
  // Unix epoch day 0 (1970-01-01) was a THURSDAY. With Monday as 0, Thursday
  // is 3, so `days + 3` makes the modulus count from a Monday: day 0 -> 3
  // (Thu), day 4 (1970-01-05) -> 0 (Mon).
  const dow = (((days + 3) % 7) + 7) % 7; // 0 = Monday … 6 = Sunday
  return fromUtcDays(days - dow);
}

/** True when both dates fall in the same Mon-Sun week. */
export function sameReleaseWeek(
  a: IsoDate | null | undefined,
  b: IsoDate | null | undefined
): boolean {
  const wa = weekOf(a);
  const wb = weekOf(b);
  return wa !== null && wa === wb;
}

/** Weeks that still accept films (rulebook §3: forward only). */
const OPEN_TO_ADDITIONS = new Set(["draft", "open"]);

/**
 * Decide which season week a release date belongs to.
 *
 * Rulebook §3 "Adding films mid-season": films may be added at any point in the
 * season but only FORWARD — to a week whose bidding has not yet closed. Weeks
 * accept films while `draft` or `open`; the latter so a late-announced wide
 * release can still join the weekend it actually opens on.
 *
 * Week creation is APPEND-ONLY. The app relies on an unstated invariant that
 * week numbers ascend with opening_date (getWeeks orders by number and the
 * trend charts assume chronological order), so a gap in the middle of the
 * schedule is refused rather than filled — inserting there would either break
 * that order visibly for players or renumber weeks they already call by name.
 */
export function matchReleaseToWeek(
  releaseDate: IsoDate | null | undefined,
  weeks: readonly WeekLike[],
  today: IsoDate
): WeekMatch {
  const target = weekOf(releaseDate);
  if (target === null) {
    return { kind: "unmappable", weekOf: null, reason: "no-release-date" };
  }

  const currentWeek = weekOf(today);
  if (currentWeek !== null && target < currentWeek) {
    return { kind: "unmappable", weekOf: target, reason: "in-the-past" };
  }

  const hit = weeks.find((w) => weekOf(w.opening_date) === target);
  if (hit) {
    return OPEN_TO_ADDITIONS.has(hit.status)
      ? { kind: "existing", week: hit, weekOf: target }
      : {
          kind: "unmappable",
          weekOf: target,
          reason: "week-closed",
          weekStatus: hit.status,
        };
  }

  // No week for that weekend. Appending past the end of the schedule is
  // offered; a hole inside it is not.
  const anchors = weeks
    .map((w) => weekOf(w.opening_date))
    .filter((a): a is IsoDate => a !== null);
  const latest = anchors.length ? anchors.reduce((a, b) => (a > b ? a : b)) : null;

  if (latest !== null && target < latest) {
    return { kind: "unmappable", weekOf: target, reason: "mid-season-gap" };
  }

  const maxNumber = weeks.reduce((n, w) => Math.max(n, w.number), 0);
  return { kind: "createable", weekOf: target, nextNumber: maxNumber + 1 };
}
