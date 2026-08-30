import { TextLink } from "@/components/text-link";
import { Card } from "@/components/ui/card";
import type { LeagueAggregates } from "@/lib/league-records";

/**
 * THE LEAGUE'S OWN NUMBERS, and no member appears in any of them (ADR-085).
 *
 * Every figure is nullable on purpose — `league-records.ts` returns null rather
 * than zero when there is nothing to divide by, because "$0" would be a claim
 * about a market that has not opened yet. A row with no answer is left out
 * rather than printed as a nought.
 */
/** Label left, number right — the same shape the invitation page calls `Fact`.
 *  Deliberately NOT the shared `Figure`, which stacks: the two used to share
 *  that name while laying out differently, which is what this rename fixes. */
function Fact({ label, value }: { label: string; value: string | null }) {
  if (value === null) return null;
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-ui text-muted-foreground">{label}</span>
      <span className="type-numeral text-h3">{value}</span>
    </div>
  );
}

const one = (n: number | null) => (n === null ? null : n.toFixed(2));

export function RecordBookPanel({
  aggregates,
  leagueId,
}: {
  aggregates: LeagueAggregates | null;
  leagueId: string;
}) {
  const rows = aggregates
    ? [
        // Whole dollars, because every bid in this game is one.
        { label: "Average winning bid", value: aggregates.avgWinningBid === null ? null : `${aggregates.avgWinningBid.toFixed(2)}` },
        { label: "Average points per film", value: one(aggregates.avgPointsPerFilm) },
        { label: "League points per dollar", value: one(aggregates.pointsPerDollar) },
        { label: "Owners per film", value: one(aggregates.ownersPerFilm) },
      ].filter((r) => r.value !== null)
    : [];

  return (
    <Card variant="flat" size="sm" className="gap-3.5">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="type-eyebrow text-eyebrow text-muted-foreground">
          Record book
        </h2>
        <TextLink href={`/leagues/${leagueId}/records`} size="micro">
          Open
        </TextLink>
      </div>

      {rows.length === 0 ? (
        <p className="text-ui text-muted-foreground">
          Nothing to average yet. These fill in as films are scored.
        </p>
      ) : (
        <>
          {rows.map((r) => (
            <Fact key={r.label} label={r.label} value={r.value} />
          ))}
          <p className="type-micro text-micro text-muted-foreground">
            Drawn from {aggregates!.filmsScored} scored film
            {aggregates!.filmsScored === 1 ? "" : "s"}
          </p>
        </>
      )}
    </Card>
  );
}
