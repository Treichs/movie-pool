"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createLeague } from "@/lib/actions/league";

/**
 * THE FOUR STEPS BOARD 4.8 DRAWS, and the wizard is client-side because the
 * whole thing is submitted once at the end: three RPCs run in order, and a
 * step-at-a-time save would leave half-built leagues behind whenever somebody
 * closed the tab on step three.
 *
 * ── ONE STEP IS MISSING A CONTROL THE BOARD DRAWS, DELIBERATELY ───────────
 * "Include limited releases" is not here. The rulebook retired that setting —
 * wide release is the commissioner's per-film judgement when they build the
 * slate, not something the app enforces — and `create_season` has no parameter
 * for it, so the toggle would have been a control that changed nothing.
 * Confirmed with the developer on 2026-08-29.
 *
 * ── AND ONE MORE THE BOARD DRAWS THAT NOTHING CAN SAVE ────────────────────
 * "Results captured — when the weekend gets frozen into points". There is no
 * parameter for it on `create_season`, and the rulebook describes the capture
 * time as fixed rather than per-league. Left out rather than rendered as a
 * control that silently does nothing. In its place the step collects the one
 * timing value the RPC does require: `bids_due_dow`, which it validates to
 * Monday-Thursday and refuses outside that range.
 */
const STEPS = ["Name it", "House rules", "Invite people", "First season"];

/** The next Friday, which is when films open and therefore the earliest
 *  sensible first week. Computed in the browser so it is the commissioner's
 *  own Friday, not the server's. */
function nextFriday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
  return d.toISOString().slice(0, 10);
}

const DAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
];

function Rail({ current }: { current: number }) {
  return (
    <ol className="flex flex-col gap-4">
      {STEPS.map((label, i) => {
        const state = i === current ? "now" : i < current ? "done" : "todo";
        return (
          <li key={label} className="flex items-center gap-2.5">
            <span
              aria-hidden
              className={`type-numeral flex size-6.5 shrink-0 items-center justify-center rounded-xs border text-micro ${
                state === "now"
                  ? "border-primary bg-primary text-primary-foreground"
                  : state === "done"
                    ? "border-foreground bg-foreground text-background"
                    : "bg-card text-muted-foreground"
              }`}
            >
              {i + 1}
            </span>
            <span
              className={`type-ui text-ui ${
                state === "todo" ? "text-muted-foreground" : ""
              }`}
            >
              {label}
              {state === "now" && <span className="sr-only"> — current step</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** A house rule: a label, a line explaining it, and a number beside them. */
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

export function CreateLeagueWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const nameId = useId();
  const bankrollId = useId();
  const tiersId = useId();
  const minBidId = useId();
  const dowId = useId();
  const timeId = useId();
  const dateId = useId();
  const lengthId = useId();
  const invitesId = useId();

  // DEFAULTS ARE THE RULEBOOK'S, and the copy says so on the step itself: they
  // are what the original pool has run for thirty-three seasons.
  const [name, setName] = useState("");
  const [bankroll, setBankroll] = useState("100");
  const [tiers, setTiers] = useState("3");
  const [minBid, setMinBid] = useState("1");
  const [dow, setDow] = useState("4");
  const [time, setTime] = useState("20:00");
  const [openingDate, setOpeningDate] = useState(nextFriday);
  const [length, setLength] = useState("20");
  const [invites, setInvites] = useState("");

  const emails = invites
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);

  const canContinue = step !== 0 || name.trim().length > 0;

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await createLeague({
        name: name.trim(),
        bankroll: Number(bankroll),
        winningTiers: Number(tiers),
        minBid: Number(minBid),
        bidsDueDow: Number(dow),
        bidsDueTime: time,
        bidsDueTz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        firstOpeningDate: openingDate,
        seasonLength: Number(length),
        inviteEmails: emails,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/leagues/${result.data.leagueId}`);
    });

  return (
    <div className="grid grid-cols-1 items-start gap-10 md:grid-cols-[15rem_1fr]">
      <nav aria-label="Progress">
        <Rail current={step} />
      </nav>

      <div className="flex max-w-155 flex-col gap-6">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>That didn&apos;t finish</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {step === 0 && (
          <FieldGroup>
            <h2>Name it</h2>
            <Field>
              <FieldLabel htmlFor={nameId}>League name</FieldLabel>
              <Input
                id={nameId}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Reel Deal Cinema Club"
                required
              />
              <FieldDescription>
                What everyone will call it. This is the one thing you cannot
                change later.
              </FieldDescription>
            </Field>
          </FieldGroup>
        )}

        {step === 1 && (
          <FieldGroup>
            <h2>House rules</h2>
            <p className="text-muted-foreground">
              These are the numbers the rulebook marks configurable. The
              defaults are what the original pool has run for thirty-three
              seasons.
            </p>

            <Rule
              id={bankrollId}
              label="Season bankroll"
              hint="Per player, for the whole season. Never replenished."
            >
              <Input
                id={bankrollId}
                type="number"
                min={1}
                value={bankroll}
                onChange={(e) => setBankroll(e.target.value)}
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
                value={tiers}
                onChange={(e) => setTiers(e.target.value)}
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
                value={minBid}
                onChange={(e) => setMinBid(e.target.value)}
              />
            </Rule>

            <Rule
              id={dowId}
              label="Bids close on"
              hint="The day of the week bidding shuts, before Friday's openings."
            >
              {/* Base UI hands back `string | null` — null when a select is
                  cleared, which this one cannot be. The fallback keeps the
                  state a plain string rather than widening it for a case the
                  four fixed options never produce. */}
              <Select value={dow} onValueChange={(v) => setDow(v ?? "4")}>
                <SelectTrigger id={dowId} className="w-full">
                  {/* The VALUE is "1".."4" because that is what the RPC takes;
                      the trigger has to be given the label or it renders the
                      number, which is what it did until this was driven. */}
                  <SelectValue>
                    {(value) =>
                      DAYS.find((d) => String(d.value) === value)?.label ?? ""
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {DAYS.map((d) => (
                    <SelectItem key={d.value} value={String(d.value)}>
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
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </Rule>
          </FieldGroup>
        )}

        {step === 2 && (
          <FieldGroup>
            <h2>Invite people</h2>
            <Field>
              <FieldLabel htmlFor={invitesId}>Email addresses</FieldLabel>
              {/* Separated however the commissioner pastes them — commas,
                  spaces, semicolons or newlines. Pasting a column out of a
                  spreadsheet is the common case, which is why this is a
                  `Textarea` and not a single line. */}
              <Textarea
                id={invitesId}
                rows={4}
                value={invites}
                onChange={(e) => setInvites(e.target.value)}
                placeholder="ada@example.com, grace@example.com"
              />
              <FieldDescription>
                {emails.length === 0
                  ? "Optional — you can invite people later from league settings."
                  : `${emails.length} address${emails.length === 1 ? "" : "es"}. Each gets its own link.`}
              </FieldDescription>
            </Field>
          </FieldGroup>
        )}

        {step === 3 && (
          <FieldGroup>
            <h2>First season</h2>
            <Field>
              <FieldLabel htmlFor={dateId}>First films open on</FieldLabel>
              <Input
                id={dateId}
                type="date"
                value={openingDate}
                onChange={(e) => setOpeningDate(e.target.value)}
              />
              <FieldDescription>
                A Friday. Week 01 is the weekend beginning that day.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={lengthId}>Weeks in the season</FieldLabel>
              <Input
                id={lengthId}
                type="number"
                min={1}
                value={length}
                onChange={(e) => setLength(e.target.value)}
              />
              <FieldDescription>
                Roughly how long you expect to play. You can add or close weeks
                as you go.
              </FieldDescription>
            </Field>
          </FieldGroup>
        )}

        <div className="flex items-center justify-between gap-4 pt-1">
          <Button
            variant="outline"
            disabled={step === 0 || pending}
            onClick={() => setStep((s) => s - 1)}
          >
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              variant="ink"
              disabled={!canContinue || pending}
              onClick={() => setStep((s) => s + 1)}
            >
              Continue
            </Button>
          ) : (
            <Button variant="ink" disabled={pending} onClick={submit}>
              {pending ? "Starting it…" : "Start the league"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
