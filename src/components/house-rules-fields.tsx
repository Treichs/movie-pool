"use client";

import { useId } from "react";

import { FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * THE HOUSE RULES — the values the rulebook marks [Configurable], asked the
 * same way in both places they are asked.
 *
 * It moved to `src/components/` the first time a second route needed it:
 * `/leagues/new` collects them for a league's first season, and
 * `/leagues/[leagueId]/seasons/new` collects them again for every season after
 * that. Rule 1's condition exactly — and this is the fieldset where drift would
 * hurt most, because the hints carry rulebook facts. "Ties are always honoured,
 * so a film can have more owners than tiers" is the rule people get wrong; two
 * copies of that sentence is two chances to explain it differently.
 *
 * ── WHAT IS NOT HERE, AND WILL NOT BE ─────────────────────────────────────
 * "Include limited releases". Both boards draw a toggle for it. The rulebook
 * retired the setting — wide release is the commissioner's per-film judgement
 * when they build the slate, not a rule the app enforces — and `create_season`
 * has no parameter for it, so the control could never have changed anything.
 * Settled with the developer on 2026-08-29.
 *
 * "Results captured". No parameter exists, and the rulebook describes the
 * capture time as fixed rather than per-league. `bids_due_dow` is the timing
 * value the RPC does take, and it is here.
 */
export type HouseRules = {
  bankroll: string;
  tiers: string;
  minBid: string;
  /** 1 = Monday … 4 = Thursday. `create_season` refuses anything else. */
  dow: string;
  /** "HH:MM" in the commissioner's own zone, which travels with it. */
  time: string;
};

export const HOUSE_RULE_DEFAULTS: HouseRules = {
  bankroll: "100",
  tiers: "3",
  minBid: "1",
  dow: "4",
  time: "20:00",
};

const DAYS = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
];

/** A house rule: a label, a line explaining it, and the control beside them. */
function Rule({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex max-w-100 flex-col gap-1">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription>{hint}</FieldDescription>
      </div>
      <div className="w-36 shrink-0">{children}</div>
    </div>
  );
}

export function HouseRulesFields({
  value,
  onChange,
}: {
  value: HouseRules;
  onChange: (patch: Partial<HouseRules>) => void;
}) {
  const bankrollId = useId();
  const tiersId = useId();
  const minBidId = useId();
  const dowId = useId();
  const timeId = useId();

  return (
    <>
      <Rule
        id={bankrollId}
        label="Season bankroll"
        hint="Per player, for the whole season. Never replenished."
      >
        <Input
          id={bankrollId}
          type="number"
          min={1}
          value={value.bankroll}
          onChange={(e) => onChange({ bankroll: e.target.value })}
        />
      </Rule>

      <Rule
        id={tiersId}
        label="Winning tiers"
        hint="How many distinct bid amounts take ownership. Ties are always honoured, so a film can have more owners than tiers."
      >
        <Input
          id={tiersId}
          type="number"
          min={1}
          value={value.tiers}
          onChange={(e) => onChange({ tiers: e.target.value })}
        />
      </Rule>

      <Rule
        id={minBidId}
        label="Minimum bid"
        hint="The smallest non-zero bid. A $0 bid is always legal and never wins."
      >
        <Input
          id={minBidId}
          type="number"
          min={1}
          value={value.minBid}
          onChange={(e) => onChange({ minBid: e.target.value })}
        />
      </Rule>

      <Rule
        id={dowId}
        label="Bids close on"
        hint="The day of the week bidding shuts, before Friday's openings."
      >
        <Select
          value={value.dow}
          onValueChange={(v) => onChange({ dow: v ?? "4" })}
        >
          <SelectTrigger id={dowId} className="w-full">
            {/* The VALUE is "1".."4" because that is what the RPC takes; the
                trigger has to be given the label or it renders the number. */}
            <SelectValue>
              {(v) => DAYS.find((d) => d.value === v)?.label ?? ""}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {DAYS.map((d) => (
              <SelectItem key={d.value} value={d.value}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Rule>

      <Rule
        id={timeId}
        label="Bids close at"
        hint="Your own time zone travels with it, so everyone sees the same moment."
      >
        <Input
          id={timeId}
          type="time"
          value={value.time}
          onChange={(e) => onChange({ time: e.target.value })}
        />
      </Rule>
    </>
  );
}
