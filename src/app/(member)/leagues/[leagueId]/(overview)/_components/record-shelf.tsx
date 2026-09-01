import { RecordCard } from "@/components/record-card";
import { TextLink } from "@/components/text-link";
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
export function RecordShelf({
  records,
  leagueId,
}: {
  records: LeagueRecordBook["records"];
  leagueId: string;
}) {
  const marquee = records.filter((r) => r.marquee);
  if (marquee.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2>The record book</h2>
        <TextLink href={`/leagues/${leagueId}/records`} size="micro">
          Every record and every career
        </TextLink>
      </div>
      {/* TWO ACROSS UNTIL THE PAGE IS GENUINELY WIDE. A marquee record sets its
          value at the h1 numeral beside a poster; in four columns of a 72rem
          page that is 245px of card and "$6 → 0.45 pts" breaks across two
          lines. The shelf is the page's headline — it is allowed the width. */}
      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
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
    </section>
  );
}
