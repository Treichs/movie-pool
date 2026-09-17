import { Figure } from "@/components/figure";
import type { LeagueAggregates } from "@/lib/league-records";

/**
 * THE LEAGUE'S OWN NUMBERS, and no member appears in any of them (ADR-085).
 *
 * Every figure is nullable on purpose — `league-records.ts` returns null rather
 * than zero when there is nothing to divide by, because "$0" would be a claim
 * about a market that has not opened yet. A figure with no answer is left out
 * rather than printed as a nought.
 *
 * ── A STRIP UNDER THE RECORDS, NOT A PANEL OF ITS OWN ────────────────────
 * Until 2026-09-17 this was "The going rate", a panel beside the members list
 * with its own link to the record book — a second door to the page the record
 * shelf already opens, and the shortest panel on the page, which left a hole
 * beside a roster twice its height. Averages are what the record book is
 * measured against, so they run as its footer: four figures on the same
 * stacked label-and-numeral the career band uses.
 */
export function GoingRate({
  aggregates,
}: {
  aggregates: LeagueAggregates | null;
}) {
  if (!aggregates) return null;

  const one = (n: number | null) => (n === null ? null : n.toFixed(2));
  const figures = [
    { label: "Average winning bid", value: one(aggregates.avgWinningBid) },
    { label: "Average points per film", value: one(aggregates.avgPointsPerFilm) },
    { label: "League points per dollar", value: one(aggregates.pointsPerDollar) },
    { label: "Owners per film", value: one(aggregates.ownersPerFilm) },
  ].filter((f): f is { label: string; value: string } => f.value !== null);

  if (figures.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 border-t px-(--frame-panel-px) py-4">
      <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
        {figures.map((f) => (
          <Figure key={f.label} label={f.label} value={f.value} />
        ))}
      </div>
      <span className="type-micro text-micro text-muted-foreground">
        The going rate · drawn from {aggregates.filmsScored} scored film
        {aggregates.filmsScored === 1 ? "" : "s"}
      </span>
    </div>
  );
}
