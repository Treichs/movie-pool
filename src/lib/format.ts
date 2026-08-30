// Presentation helpers shared across surfaces. Locale is pinned to en-US so
// server-rendered output is deterministic and can't drift from a client
// re-render on a machine with different regional settings.

// Deadline formatters are cached per timezone. The zone is a REQUIRED input
// and the abbreviation is rendered with the time: a deadline is the game's
// one hard cutoff, and an hour with no zone attached is a different fact in
// every city. Callers render this through DeadlineText (composed), which pins
// UTC for the server pass and flows to the viewer's zone on mount — pinning
// here is what keeps the server and the first client paint identical.
const DEADLINE_FORMATS = new Map<string, Intl.DateTimeFormat>();

function deadlineFormat(timeZone: string): Intl.DateTimeFormat {
  let format = DEADLINE_FORMATS.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
      timeZoneName: "short",
    });
    DEADLINE_FORMATS.set(timeZone, format);
  }
  return format;
}

// A small count in words — "three winning tiers", "four films". Prose reads
// its small numbers as words and its large ones as digits; the boards do the
// same, and ten is where they turn over. Zero is "no", which is the word that
// belongs in the sentences this serves ("no films", "no winning tiers").
const NUMBER_WORDS = [
  "no", "one", "two", "three", "four", "five",
  "six", "seven", "eight", "nine", "ten",
];

export function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

// First letter up. `numberWord` returns lowercase because most of its uses are
// mid-sentence ("three winning tiers"); the two page deks that OPEN on a count
// need it capitalised, and neither should carry its own copy of one line.
export function sentenceCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// "1st", "2nd", "3rd", "11th" … used for ranks.
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function formatDeadline(iso: string, timeZone: string): string {
  return deadlineFormat(timeZone).format(new Date(iso));
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

// A plain calendar date ("Fri, Jun 26") from a date-only column. Parsed as
// UTC-noon rather than `new Date("2026-06-26")`, which a browser west of
// Greenwich renders as the day before.
export function formatDate(dateOnly: string): string {
  return DATE_FORMAT.format(new Date(`${dateOnly}T12:00:00Z`));
}

const DATE_FULL_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

// The same date WITH its year ("Nov 21, 2025"), for a fact about a film rather
// than about this season. `formatDate` drops the year because a week is always
// the one in front of you; a release date is not, and "Nov 21" is a question.
export function formatDateFull(dateOnly: string): string {
  return DATE_FULL_FORMAT.format(new Date(`${dateOnly}T12:00:00Z`));
}

// A month and a year ("January 2024") from a date-only column — for spans long
// enough that the day is noise. Same UTC-noon parse as formatDate, and for the
// same reason: `new Date("2024-01-15")` is midnight UTC, which a browser west
// of Greenwich renders as the previous day — and in January that is the
// previous MONTH, which is the whole output here.
const MONTH_YEAR_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatMonthYear(dateOnly: string): string {
  return MONTH_YEAR_FORMAT.format(new Date(`${dateOnly}T12:00:00Z`));
}

// Rough, friendly countdown for a bid deadline — "in 3 days", "in 5 hours".
// Deliberately coarse for CALM, not because the deadline is soft: since OQ-3's
// resolution (2026-08-02) the deadline is system-enforced and final — the week
// closes itself. Where the moment deserves weight, DeadlineCountdown ticks
// live; this is the low-key form for list rows.
export function timeUntil(iso: string, now: Date): string | null {
  const ms = new Date(iso).getTime() - now.getTime();
  if (ms <= 0) return null;

  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return "in under an hour";
  if (hours < 24) return `in ${hours} hour${hours === 1 ? "" : "s"}`;

  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

/**
 * How long ago, coarsely — "3 days ago" rather than a timestamp.
 *
 * Lifted out of the announcements panel and the activity feed on 2026-08-06,
 * which each carried an identical private copy. Announcements now render in
 * three places (the League Home rail, the index and the detail page), and a
 * card saying "last week" beside a page saying "7 days ago" would read as two
 * different facts about the same thing.
 *
 * Precision beyond a day is noise for something posted weekly at most.
 */
export function relativeDay(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

/**
 * Up to two initials from a display name.
 *
 * Derived inline in three places before this existed — the shell's account
 * menu, the account page's own avatar, and the player profile card — which is
 * exactly one more than the rule allows. `.slice(0, 2)` on the joined letters
 * rather than on the words, so "Jean-Luc" gives "J" and not "JL": the split is
 * on spaces, and a hyphenated first name is one word.
 */
export function initialsFrom(name: string, max = 2): string {
  // Array spread, not `part[0]`: indexing a string returns a UTF-16 code UNIT,
  // so a name led by an emoji yielded half a surrogate pair and drew a broken
  // box. Spreading iterates code POINTS.
  //
  // `max` is 2 for a person and 3 for a league — a group is usually several
  // words and the acronym is how people already say it out loud.
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words
    .slice(0, max)
    .map((part) => [...part][0] ?? "")
    .join("")
    .toUpperCase();
}
