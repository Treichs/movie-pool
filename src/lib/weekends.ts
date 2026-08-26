// The list of weekends a season can open on.
//
// Lifted out of commish/components/season-calendar-form.tsx (2026-08-03) when
// the create-league wizard needed the same list: R2 forbids composed/ importing
// from app routes, and the honest fix is that this was never route-specific —
// it is a pure date calculation with no React in it.
//
// The opening weekend is a DROPDOWN of the weekends ahead, not a free date
// picker (2026-08-02). A date input accepts a Tuesday, a date in the past, or a
// weekend three years out; a list of the next dozen Fridays accepts exactly the
// answers that make sense, and reads like the question being asked.

export type WeekendOption = { value: string; label: string };

/** The ISO-8601 week number of a date. Week 1 is the week containing the first
 *  Thursday of the year, which is why the shift below lands on Thursday before
 *  counting. */
export function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // getUTCDay: Sunday = 0. `|| 7` makes Sunday the 7th day, as ISO does.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** The next `count` Fridays, starting from the first one strictly ahead. */
export function upcomingWeekends(count: number, from = new Date()): WeekendOption[] {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  // 5 = Friday. `|| 7` keeps today out of the list — a season should not open
  // on a weekend that is already under way.
  const delta = (5 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + delta);

  const out: WeekendOption[] = [];
  for (let i = 0; i < count; i++) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
    // The VALUE stays the opening Friday — that is what first_opening_date
    // means and what seed_season_weeks lays the season out from. Only the
    // LABEL changes (2026-08-04): "Friday, August 7" named the opening night,
    // but every other surface in the app names a week by its ISO number and
    // its Monday ("Week 32 · week of Aug 3"), and the season's own
    // one-week-per-calendar-week constraint is expressed in exactly those
    // terms. A dropdown that spoke a different dialect from the pages it
    // creates made the commissioner translate.
    const monday = new Date(d);
    monday.setDate(monday.getDate() - 4);
    out.push({
      value: iso,
      label: `Week ${isoWeekNumber(d)} · ${monday.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      })}`,
    });
    d.setDate(d.getDate() + 7);
  }
  return out;
}
