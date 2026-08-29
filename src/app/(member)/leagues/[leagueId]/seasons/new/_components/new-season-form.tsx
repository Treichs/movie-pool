"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  HouseRulesFields,
  type HouseRules,
} from "@/components/house-rules-fields";
import {
  SeasonDatesFields,
  SEASON_DATE_DEFAULTS,
  weeksBetween,
  type SeasonDates,
} from "@/components/season-dates-fields";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";

import { createSeason } from "../actions";

/**
 * ONE PAGE, NOT A WIZARD — which is what board 5.2 draws and it is right.
 *
 * `/leagues/new` is four steps because it collects four unrelated things from
 * somebody who has never seen the app. This asks a commissioner who has run a
 * season before for two dates and five numbers they have already chosen once.
 * A stepper here would put a Next button between them and the thing they came
 * to do, and hide half the form behind it.
 *
 * The two fieldsets are the same shared components the wizard uses, so the
 * questions and their hints are identical in both places.
 *
 * ── THE RULES ARE INHERITED, AND SAYING SO IS THE POINT ───────────────────
 * `getNextSeasonDefaults` opens this form on the PREVIOUS season's settings, or
 * the rulebook for a league's first. A commissioner who changes one here has
 * changed it for THIS season only — every season freezes its own copy — and the
 * screen says that rather than leaving it to be discovered.
 */
export function NewSeasonForm({
  leagueId,
  defaults,
}: {
  leagueId: string;
  defaults: HouseRules;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState<HouseRules>(defaults);
  const [dates, setDates] = useState<SeasonDates>(SEASON_DATE_DEFAULTS);

  const weeks = weeksBetween(dates.firstOpeningDate, dates.lastOpeningDate);

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await createSeason({
        leagueId,
        firstOpeningDate: dates.firstOpeningDate,
        seasonLength: weeks ?? 1,
        bankroll: Number(rules.bankroll),
        winningTiers: Number(rules.tiers),
        minBid: Number(rules.minBid),
        bidsDueDow: Number(rules.dow),
        bidsDueTime: rules.time,
        bidsDueTz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/seasons/${result.data.seasonId}`);
    });

  return (
    <div className="flex max-w-155 flex-col gap-8">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>The season was not started</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <FieldGroup>
        <h2>When it runs</h2>
        <SeasonDatesFields
          value={dates}
          onChange={(patch) => setDates((d) => ({ ...d, ...patch }))}
        />
      </FieldGroup>

      <FieldGroup>
        <h2>Rules for this season</h2>
        <p className="text-muted-foreground">
          Inherited from the last season — changing one here changes it for this
          season only.
        </p>
        <HouseRulesFields
          value={rules}
          onChange={(patch) => setRules((r) => ({ ...r, ...patch }))}
        />
      </FieldGroup>

      <div className="flex items-center gap-4">
        <Button
          variant="ink"
          disabled={pending || weeks === null}
          onClick={submit}
        >
          {pending ? "Starting it…" : "Start the season"}
        </Button>
        <span className="type-body text-ui text-muted-foreground">
          {/* ADR-016 — nobody should wonder whether they need to invite people
              again. `create_season` copies the whole league roster in. */}
          Every member of the league joins automatically.
        </span>
      </div>
    </div>
  );
}
