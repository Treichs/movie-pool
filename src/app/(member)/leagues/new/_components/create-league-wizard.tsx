"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "lucide-react";

import {
  HouseRulesFields,
  HOUSE_RULE_DEFAULTS,
  type HouseRules,
} from "@/components/house-rules-fields";
import {
  SeasonDatesFields,
  SEASON_DATE_DEFAULTS,
  weeksBetween,
  type SeasonDates,
} from "@/components/season-dates-fields";
import {
  Stepper,
  StepperContent,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperPanel,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from "@/components/reui/stepper";
import { InviteePicker } from "@/components/invitee-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createLeague } from "@/lib/actions/league";

/**
 * STARTING A LEAGUE — four steps, one submit.
 *
 * ── THE RAIL IS `@reui/stepper` NOW, AND THAT IS A BEHAVIOUR FIX ──────────
 * The first version hand-rolled it as a static `<ol>`: the steps were not
 * focusable, not clickable, and offered no way back except the Back button.
 * The vendored stepper brings roving-focus keyboard navigation, click-to-return
 * on a completed step, and `disabled` to stop anyone skipping ahead of a step
 * they have not satisfied.
 *
 * It is the one stepper in the configured registries that fits this stack:
 * every `@shadcnblocks` stepper depends on `radix-ui` — a second primitive
 * family in a codebase that has only `@base-ui/react` — and wants to overwrite
 * `ui/button.tsx`. This one is a single file on Base UI with no overwrites.
 *
 * ── ONE SUBMIT, AT THE END ────────────────────────────────────────────────
 * Saving step by step would leave half-built leagues behind every time somebody
 * closed the tab on step three, and there is no draft-league state to land in.
 * `createLeague` runs three RPCs in an order where each failure leaves
 * something finishable.
 *
 * ── THE TWO MIDDLE STEPS ARE SHARED FIELDSETS ─────────────────────────────
 * `HouseRulesFields` and `SeasonDatesFields` live in `src/components/` because
 * `/leagues/[leagueId]/seasons/new` asks for exactly the same two things. The
 * hints carry rulebook facts; one definition of them is the point.
 */
const STEPS = ["Name it", "House rules", "Invite people", "First season"];

export function CreateLeagueWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const nameId = useId();
  const invitesId = useId();

  const [name, setName] = useState("");
  const [rules, setRules] = useState<HouseRules>(HOUSE_RULE_DEFAULTS);
  const [dates, setDates] = useState<SeasonDates>(SEASON_DATE_DEFAULTS);
  const [invites, setInvites] = useState("");
  // People PICKED by name. Kept apart from the pasted addresses because they
  // travel differently: an account is invited by id so its address is looked
  // up in the database and never reaches this browser.
  const [picked, setPicked] = useState<
    { profileId: string; displayName: string }[]
  >([]);
  const pickerId = useId();

  const emails = invites
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);
  const inviteCount = emails.length + picked.length;

  const named = name.trim().length > 0;
  const weeks = weeksBetween(dates.firstOpeningDate, dates.lastOpeningDate);

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await createLeague({
        name: name.trim(),
        bankroll: Number(rules.bankroll),
        winningTiers: Number(rules.tiers),
        minBid: Number(rules.minBid),
        bidsDueDow: Number(rules.dow),
        bidsDueTime: rules.time,
        bidsDueTz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        firstOpeningDate: dates.firstOpeningDate,
        seasonLength: weeks ?? 1,
        inviteEmails: emails,
        inviteProfileIds: picked.map((p) => p.profileId),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/leagues/${result.data.leagueId}`);
    });

  return (
    <Stepper
      value={step}
      onValueChange={setStep}
      orientation="vertical"
      indicators={{ completed: <CheckIcon className="size-3.5" /> }}
      className="grid grid-cols-1 items-start gap-10 md:grid-cols-[15rem_1fr]"
    >
      <StepperNav className="gap-1">
        {STEPS.map((label, i) => (
          <StepperItem
            key={label}
            step={i + 1}
            // NOTHING PAST THE NAME UNTIL THERE IS A NAME. It is the only value
            // with no default. It IS renameable afterwards — league settings
            // carries `update_league_identity` — and the copy said the opposite
            // in two places until 2026-08-30.
            disabled={i > 0 && !named}
            className="relative items-start not-last:flex-1"
          >
            <StepperTrigger className="items-center gap-2.5 pb-3">
              <StepperIndicator className="rounded-xs bg-card text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=completed]:bg-foreground data-[state=completed]:text-background border">
                {i + 1}
              </StepperIndicator>
              <StepperTitle className="type-ui text-ui">{label}</StepperTitle>
            </StepperTrigger>
            {i < STEPS.length - 1 && (
              <StepperSeparator className="absolute inset-y-0 top-7 left-3 h-[calc(100%-2rem)] w-px bg-border" />
            )}
          </StepperItem>
        ))}
      </StepperNav>

      <StepperPanel className="flex max-w-155 flex-col gap-6">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>That didn&apos;t finish</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <StepperContent value={1}>
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
                What everyone will call it. You can rename it later in league
                settings.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </StepperContent>

        <StepperContent value={2}>
          <FieldGroup>
            <h2>House rules</h2>
            <p className="text-muted-foreground">
              These are the numbers the rulebook marks configurable. The
              defaults are what the original pool has run for thirty-three
              seasons.
            </p>
            <HouseRulesFields
              value={rules}
              onChange={(patch) => setRules((r) => ({ ...r, ...patch }))}
            />
          </FieldGroup>
        </StepperContent>

        <StepperContent value={3}>
          <FieldGroup>
            <h2>Invite people</h2>
            {/* THE PICKER IS FOR PEOPLE WHO ALREADY PLAY; the box below is for
                everyone else. Two controls, but they answer different
                questions — "who do I already know here" and "here is a list of
                addresses" — rather than making the commissioner declare which
                kind of person they are about to invite. */}
            <Field>
              <FieldLabel htmlFor={pickerId}>Already on The Movie Pool</FieldLabel>
              <div className="max-w-80">
                <InviteePicker
                  id={pickerId}
                  placeholder="Search by name"
                  onPick={(invitee) => {
                    if (invitee.kind === "profile") {
                      setPicked((current) =>
                        current.some((p) => p.profileId === invitee.profileId)
                          ? current
                          : [...current, invitee],
                      );
                    } else {
                      // Typed an address into the name box. Send it where
                      // addresses go rather than refusing it.
                      setInvites((current) =>
                        current.trim() === ""
                          ? invitee.email
                          : `${current.trim()}, ${invitee.email}`,
                      );
                    }
                  }}
                />
              </div>
              {picked.length > 0 && (
                <ul className="flex flex-wrap gap-2 pt-1">
                  {picked.map((p) => (
                    <li key={p.profileId}>
                      <span className="flex items-center gap-1.5 rounded-4xl border border-edge bg-input/50 py-1 pr-1.5 pl-3">
                        <span className="type-ui text-micro">{p.displayName}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${p.displayName}`}
                          onClick={() =>
                            setPicked((current) =>
                              current.filter((x) => x.profileId !== p.profileId),
                            )
                          }
                          className="rounded-4xl px-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30"
                        >
                          <span aria-hidden>×</span>
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor={invitesId}>Email addresses</FieldLabel>
              {/* Separated however the commissioner pastes them — commas,
                  spaces, semicolons or newlines. Pasting a column out of a
                  spreadsheet is the common case. */}
              <Textarea
                id={invitesId}
                rows={4}
                value={invites}
                onChange={(e) => setInvites(e.target.value)}
                placeholder="ada@example.com, grace@example.com"
              />
              <FieldDescription>
                {inviteCount === 0
                  ? "Optional — you can invite people later from league settings."
                  : `${inviteCount} invitation${inviteCount === 1 ? "" : "s"}. Each gets its own link.`}
              </FieldDescription>
            </Field>
          </FieldGroup>
        </StepperContent>

        <StepperContent value={4}>
          <FieldGroup>
            <h2>First season</h2>
            <SeasonDatesFields
              value={dates}
              onChange={(patch) => setDates((d) => ({ ...d, ...patch }))}
            />
          </FieldGroup>
        </StepperContent>

        <div className="flex items-center justify-between gap-4 pt-1">
          <Button
            variant="outline"
            disabled={step === 1 || pending}
            onClick={() => setStep(step - 1)}
          >
            Back
          </Button>
          {step < STEPS.length ? (
            <Button
              variant="ink"
              disabled={!named || pending}
              onClick={() => setStep(step + 1)}
            >
              Continue
            </Button>
          ) : (
            <Button variant="ink" disabled={pending || weeks === null} onClick={submit}>
              {pending ? "Starting it…" : "Start the league"}
            </Button>
          )}
        </div>
      </StepperPanel>
    </Stepper>
  );
}
