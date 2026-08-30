import { Card } from "@/components/ui/card";
import { ordinal } from "@/lib/format";
import type { PlayerProfile } from "@/lib/player-profile";

/**
 * THE SIX CAREER STATS.
 *
 * ── A LADDER, NOT A ROW, AND THE OLD PAGE RECORDS WHY ─────────────────────
 * Six across one row gave each label about ninety pixels and every one of them
 * truncated — "SEASONS W…", "CAREER PO…". Board 2.4 answers that with a
 * three-column grid of two rows, each cell putting the label and the figure
 * side by side so the label gets the width it needs. Do not re-flatten it.
 *
 * ── LABEL LEFT, FIGURE RIGHT — NOT THE STACKED `Figure` ───────────────────
 * This is the third place in the app using the row-shaped label/value pair
 * (the record book and the invitation are the others). It is deliberately not
 * `@/components/figure`, which stacks: these cells are wide and short, and
 * stacking would double their height for no gain. Kept local for now; a fourth
 * caller is the moment to share it.
 */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card
      variant="flat"
      size="sm"
      className="flex-row items-center justify-between gap-3"
    >
      <span className="type-eyebrow text-eyebrow text-muted-foreground">
        {label}
      </span>
      <span className="type-numeral text-h2">{value}</span>
    </Card>
  );
}

export function CareerStats({ profile }: { profile: PlayerProfile }) {
  return (
    <section
      aria-label="Career"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <Stat label="Seasons won" value={String(profile.seasonsWon)} />
      {/* A player mid-first-season has no best finish yet. A dash, not "1st" —
          which is what a null would render as if it were coerced. */}
      <Stat
        label="Best finish"
        value={profile.bestFinish === null ? "—" : ordinal(profile.bestFinish)}
      />
      <Stat
        label="Career points"
        value={profile.totalPoints.toLocaleString("en-US", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })}
      />
      <Stat label="Films owned" value={String(profile.filmsOwned)} />
      <Stat label="Total spent" value={`$${Math.round(profile.totalSpent)}`} />
      <Stat label="Seasons played" value={String(profile.seasonsPlayed)} />
    </section>
  );
}
