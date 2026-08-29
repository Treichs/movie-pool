import Link from "next/link";

import type { LeagueAggregates } from "@/lib/league-records";

/**
 * THE LEAGUE'S OWN NUMBERS, and no member appears in any of them (ADR-085).
 *
 * Every figure is nullable on purpose — `league-records.ts` returns null rather
 * than zero when there is nothing to divide by, because "$0" would be a claim
 * about a market that has not opened yet. A row with no answer is left out
 * rather than printed as a nought.
 */
function Figure({ label, value }: { label: string; value: string | null }) {
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
    <div className="flex flex-col gap-3.5 rounded border bg-card p-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="type-eyebrow text-eyebrow text-muted-foreground">
          Record book
        </h2>
        <Link
          href={`/leagues/${leagueId}/records`}
          className="type-micro text-micro text-link underline underline-offset-4"
        >
          Open
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-ui text-muted-foreground">
          Nothing to average yet. These fill in as films are scored.
        </p>
      ) : (
        <>
          {rows.map((r) => (
            <Figure key={r.label} label={r.label} value={r.value} />
          ))}
          <p className="type-micro text-micro text-muted-foreground">
            Drawn from {aggregates!.filmsScored} scored film
            {aggregates!.filmsScored === 1 ? "" : "s"}
          </p>
        </>
      )}
    </div>
  );
}
