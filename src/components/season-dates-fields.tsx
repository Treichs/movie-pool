"use client";

import { useId } from "react";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

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
 */
export type SeasonDates = {
  /** yyyy-mm-dd — the Friday week 01's films open on. */
  firstOpeningDate: string;
  /** yyyy-mm-dd — the Friday the last week's films open on. */
  lastOpeningDate: string;
};

const DAY = 86_400_000;

/** The next Friday. Today counts only if today is not itself a Friday — a
 *  season opening in three hours is not what anyone means. */
export function nextFriday(from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
  return d.toISOString().slice(0, 10);
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
  const last = new Date(Date.parse(`${first}T00:00:00Z`) + 19 * 7 * DAY);
  return {
    firstOpeningDate: first,
    lastOpeningDate: last.toISOString().slice(0, 10),
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
        <Input
          id={firstId}
          type="date"
          value={value.firstOpeningDate}
          onChange={(e) => onChange({ firstOpeningDate: e.target.value })}
        />
        <FieldDescription>
          A Friday. Week 01 is the weekend beginning that day.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor={lastId}>Last opening weekend</FieldLabel>
        <Input
          id={lastId}
          type="date"
          value={value.lastOpeningDate}
          onChange={(e) => onChange({ lastOpeningDate: e.target.value })}
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
