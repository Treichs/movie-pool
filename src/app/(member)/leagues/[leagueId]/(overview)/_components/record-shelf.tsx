import { RecordCard } from "@/components/record-card";
import type { LeagueRecordBook } from "@/lib/league-records";

/**
 * THE MARQUEE RECORDS — the bragging rights, at the top of the league rather
 * than three clicks inside it.
 *
 * ── THE FLAG WAS ALWAYS FOR THIS PAGE ────────────────────────────────────
 * `LeagueRecordBook.records` carries a `marquee` boolean whose own comment
 * reads "Marquee records lead League Home" — and League Home discarded the
 * whole list until 2026-09-01, keeping only the league averages. The read was
 * already being paid for on this page: `getLeagueHome` builds the record book
 * to get the career table.
 *
 * ── THE COMPOSER DECIDES WHICH LEAD, AND HOW MANY ────────────────────────
 * Filtering on the flag rather than slicing a count is the same rule the
 * records page follows: every record self-suppresses when the league has no
 * data for it, so a league on its first weekend genuinely has fewer, and a
 * hard-coded four would render an empty column.
 */
/** THE COLUMN COUNT DIVIDES THE RECORD COUNT, so the shelf never ends on a
 *  half-empty row. Three marquee records across two columns left a 536×225 hole
 *  at the page's headline moment, and the four-across step was unreachable
 *  anyway: the page frame caps at 72rem, so four columns is 276px of card —
 *  narrower than the h1 numeral in it needs. Four records sit two-by-two
 *  instead. The composer decides how many lead and every record self-suppresses,
 *  so the count genuinely varies; this only decides how they sit. */
const COLUMNS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2",
};

export function RecordShelf({
  records,
  leagueId,
}: {
  records: LeagueRecordBook["records"];
  leagueId: string;
}) {
  const marquee = records.filter((r) => r.marquee);
  if (marquee.length === 0) return null;

  // NO HEADING AND NO SECTION OF ITS OWN. This sits in a `DashboardPanel`,
  // which supplies the region, the heading and the link beside it. Keeping its
  // own would be a heading under a heading inside a panel inside a frame.
  return (
    <>
      <div
        className={`grid gap-4 ${COLUMNS[marquee.length] ?? "grid-cols-1 sm:grid-cols-2"}`}
      >
        {marquee.map((r) => (
          <RecordCard
            key={r.label}
            label={r.label}
            entry={r.entry}
            marquee={r.marquee}
            leagueId={leagueId}
          />
        ))}
      </div>
    </>
  );
}
