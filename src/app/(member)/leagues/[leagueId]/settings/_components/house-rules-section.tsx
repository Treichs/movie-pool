"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { SubmitButton } from "@/components/submit-button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ok, type ActionResult } from "@/lib/action-result";
import type { HouseRules, HouseRulesRow } from "@/lib/league-settings";

import { updateHouseRules } from "../actions";

/**
 * HOUSE RULES — board 4.11's second section.
 *
 * ── THESE ARE DEFAULTS FOR NEW SEASONS. A RUNNING SEASON KEEPS ITS OWN ──
 * `league_settings` is what `create_season` copies from; a season in progress
 * has its own `season_settings` row and is untouched by anything here. That is
 * the board's own caption and it is load-bearing — a commissioner changing a
 * bankroll mid-season would otherwise reasonably expect it to apply.
 *
 * ── THE OTHER TWELVE SETTINGS RIDE ALONG IN A HIDDEN FIELD ─────────────
 * `update_league_settings` replaces the whole row rather than patching it, so
 * a form that posted only these two would reset the payout structure, the
 * deadline day, the timezone and the rest to the RPC's parameter defaults.
 * They came off the server on this render and go back untouched.
 */

const INITIAL: ActionResult = ok(undefined);

export function HouseRulesSection({
  leagueId,
  rules,
  rulesRow,
}: {
  leagueId: string;
  rules: HouseRules;
  rulesRow: HouseRulesRow;
}) {
  const bankrollId = useId();
  const tiersId = useId();

  const [bankroll, setBankroll] = useState(String(rules.fakeBankroll));
  const [tiers, setTiers] = useState(String(rules.topNDistinct));

  const [state, formAction] = useActionState(updateHouseRules, INITIAL);
  const last = useRef<ActionResult>(state);
  useEffect(() => {
    if (state === last.current) return;
    last.current = state;
    if (!state.ok) toast.error(state.error);
    else if (state.notice) toast.success(state.notice);
  }, [state]);

  const problem = (field: string) =>
    !state.ok && state.field === field ? state.error : null;

  const unchanged =
    bankroll === String(rules.fakeBankroll) && tiers === String(rules.topNDistinct);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2>House rules</h2>
        <span className="type-body text-micro text-muted-foreground">
          Defaults for new seasons — a running season keeps its own
        </span>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="leagueId" value={leagueId} />
        <input type="hidden" name="rest" value={JSON.stringify(rulesRow)} />

        <Card variant="flat" className="gap-0 p-0">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b px-4 py-3.5">
            <label htmlFor={bankrollId} className="flex flex-col gap-0.5">
              <span className="type-ui text-ui font-semibold">
                Season bankroll
              </span>
              <span className="type-body text-micro text-muted-foreground">
                Per player, never replenished
              </span>
            </label>
            <Input
              id={bankrollId}
              name="fakeBankroll"
              inputMode="numeric"
              value={bankroll}
              onChange={(e) => setBankroll(e.target.value)}
              aria-invalid={problem("fakeBankroll") ? true : undefined}
              className="type-numeral w-30 text-center"
            />
          </div>

          {/* No `border-b`: this is the last row now that the limited-releases
              switch is gone, and the rule would draw a hairline across the
              bottom edge of the card. */}
          <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5">
            <label htmlFor={tiersId} className="flex flex-col gap-0.5">
              <span className="type-ui text-ui font-semibold">
                Winning tiers
              </span>
              <span className="type-body text-micro text-muted-foreground">
                Distinct bid amounts that take ownership; ties always honoured
              </span>
            </label>
            <Input
              id={tiersId}
              name="topNDistinct"
              inputMode="numeric"
              value={tiers}
              onChange={(e) => setTiers(e.target.value)}
              aria-invalid={problem("topNDistinct") ? true : undefined}
              className="type-numeral w-30 text-center"
            />
          </div>

          {/* "INCLUDE LIMITED RELEASES" WAS HERE AND CONTROLLED NOTHING.
              ADR-078 replaced the rule with a per-film call the commissioner
              makes at settlement (`films.eligible`), and both the picker and
              the calendar say so in their own comments: "wide AND limited
              both… there is no eligibility filter". The 2026-08-05 settings
              rework listed the column as RETIRED and left it in place for a
              Phase 2 cleanup that was never written, so the switch outlived
              the rule by four weeks.
              It was worse than a no-op: it saved, and re-rendered your choice,
              so it read as working — while misleading in both directions.
              Off (labelled "the standard game") did not exclude limited
              releases; on did not add them.
              The COLUMN stays, carried through untouched by `updateHouseRules`
              exactly as `box_office_days` already is. Dropping it is the real
              Phase 2 and a separate job. */}
        </Card>

        <div className="flex">
          <SubmitButton pendingLabel="Saving…" disabled={unchanged}>
            Save house rules
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}
