"use client";

import { useId } from "react";
import { addWeeks, format, nextFriday as fridayAfter, parseISO } from "date-fns";

import { DatePicker } from "@/components/date-picker";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";

/**
 * WHEN A SEASON RUNS — two Fridays, and the week count derived from them.
 *
 * Shared because `/leagues/new` starts a league's first season and
 * `/leagues/[leagueId]/seasons/new` starts every one after it. Both need the
 * same two dates, and both would otherwise carry their own copy of the Friday
 * rule and the arithmetic between them.
 *
 * ── THE COUNT IS DERIVED, NEVER ASKED ─────────────────────────────────────
 * The first draft of this fieldset asked for a length, on the grounds that
 * `create_season` takes `p_default_season_length`. Board 5.2 and the plan both
 * say otherwise, and they are right: a commissioner knows when the season ends,
 * not how many Fridays that is. Asking for the count makes them do the
 * arithmetic and then makes the screen unable to check it. So the two dates are
 * the inputs, the count is shown back, and the caller converts.
 *
 * ── THE DEFAULT FRIDAY IS COMPUTED IN THE BROWSER ─────────────────────────
 * Which Friday is next depends on the commissioner's own date, and a server
 * renders in UTC.
 *
 * ── THE FRIDAY RULE IS ENFORCED BY THE PICKER, NOT ONLY BY THE LABEL ──────
 * `weeksBetween` divides the span by seven days, so a Tuesday paired with a
 * Friday silently rounds down to a week count nobody asked for. The old
 * `<input type="date">` offered every day of the week under a label that said
 * "A Friday". `DatePicker` takes the rule as a matcher and greys the rest out,
 * which is the reason the native input was replaced rather than restyled.
 */
export type SeasonDates = {
  /** yyyy-mm-dd — the Friday week 01's films open on. */
  firstOpeningDate: string;
  /** yyyy-mm-dd — the Friday the last week's films open on. */
  lastOpeningDate: string;
};

const DAY = 86_400_000;

/** Every day but Friday, as a react-day-picker matcher. Sunday is 0. */
const NOT_FRIDAY = { dayOfWeek: [0, 1, 2, 3, 4, 6] };

/**
 * The next Friday. Today counts only if today is not itself a Friday — a
 * season opening in three hours is not what anyone means.
 *
 * ── THIS RETURNED A SATURDAY, AND THE PICKER IS WHAT SHOWED IT ────────────
 * The old body stepped a LOCAL date forward and then read it back with
 * `toISOString()`, which converts to UTC: on any evening west of Greenwich the
 * next Friday came out as the Saturday after it. Nothing said so while the
 * value sat in an `<input type="date">` as "09/05/2026" — the trigger now
 * spells the weekday, and the matcher below greys out the day the default was
 * landing on. `format` writes the local calendar day it was handed.
 */
export function nextFriday(from = new Date()): string {
  return format(fridayAfter(from), "yyyy-MM-dd");
}

/**
 * One week per Friday, inclusive of both ends. Null when the dates cannot make
 * a season — reversed, or either one missing — so the caller can refuse to
 * submit rather than send `create_season` a length it will reject.
 */
export function weeksBetween(first: string, last: string): number | null {
  if (!first || !last) return null;
  const a = Date.parse(`${first}T00:00:00Z`);
  const b = Date.parse(`${last}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.floor((b - a) / (7 * DAY)) + 1;
}

export const SEASON_DATE_DEFAULTS = (): SeasonDates => {
  const first = nextFriday();
  return {
    firstOpeningDate: first,
    // Twenty weeks inclusive, so the last opening weekend is nineteen after
    // the first. `parseISO` reads a date-only string as LOCAL midnight, which
    // is what keeps this on the same weekday as `first`.
    lastOpeningDate: format(addWeeks(parseISO(first), 19), "yyyy-MM-dd"),
  };
};

export function SeasonDatesFields({
  value,
  onChange,
}: {
  value: SeasonDates;
  onChange: (patch: Partial<SeasonDates>) => void;
}) {
  const firstId = useId();
  const lastId = useId();
  const weeks = weeksBetween(value.firstOpeningDate, value.lastOpeningDate);

  return (
    <>
      <Field>
        <FieldLabel htmlFor={firstId}>First opening weekend</FieldLabel>
        <DatePicker
          id={firstId}
          value={value.firstOpeningDate}
          disabledDays={NOT_FRIDAY}
          onChange={(firstOpeningDate) => onChange({ firstOpeningDate })}
        />
        <FieldDescription>
          A Friday. Week 01 is the weekend beginning that day.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor={lastId}>Last opening weekend</FieldLabel>
        <DatePicker
          id={lastId}
          value={value.lastOpeningDate}
          disabledDays={NOT_FRIDAY}
          onChange={(lastOpeningDate) => onChange({ lastOpeningDate })}
        />
        {/* THE DERIVED COUNT IS SHOWN BACK so the dates can be sanity-checked
            before anything is committed — that is the whole reason for asking
            in dates rather than in weeks. Week numbers are two digits, per the
            canvas decision, and the range is spelled out rather than summarised
            so a wrong Friday is visible rather than merely miscounted. */}
        <FieldDescription>
          {weeks === null
            ? "The last weekend has to fall on or after the first."
            : `One week per Friday — ${weeks} week${weeks === 1 ? "" : "s"}, numbered 01 to ${String(weeks).padStart(2, "0")}. You can skip any week nothing opens in.`}
        </FieldDescription>
      </Field>
    </>
  );
}
