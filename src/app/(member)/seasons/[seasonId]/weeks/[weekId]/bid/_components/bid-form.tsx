"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { isOk, ok, type ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

import { placeBids } from "../actions";
import { PosterCard } from "./poster-card";

/** Hoisted so `useActionState` compares against ONE object. The toast below
 *  keys off identity, so building this inline would make the first real result
 *  indistinguishable from the mount. */
const INITIAL: ActionResult = ok(undefined);

export type BidFilm = {
  id: string;
  title: string;
  eligible: boolean;
  posterPath: string | null;
  releaseDate: string | null;
  tomatometer: number | null;
  myBid: number | null;
  /** Set only for catalog films — the key to this film's league record. */
  tmdbId: number | null;
};

/**
 * THE WEEK'S ALLOCATION, AS ONE FORM (ADR-108).
 *
 * ONE SUBMISSION FOR THE WHOLE SLATE, never one per film (ADR-023). The basket
 * lands or none of it does, checked against the budget as a single sum; firing
 * `place_bid` per film can reject mid-basket and leave the player with half the
 * bids they reviewed and a total that silently lied.
 *
 * ZERO AND BLANK ARE THE SAME THING (ADR-109). A $0 bid is legal, never wins,
 * and exists so a player who has spent their bankroll can still take part
 * (rulebook §4) — so the legal set is {0} ∪ [minBid, remaining], NOT
 * `>= minBid`. `norm` collapses null to 0 everywhere for that reason.
 */
export function BidForm({
  seasonId,
  weekId,
  leagueId,
  films,
  minBid,
  remaining,
}: {
  seasonId: string;
  weekId: string;
  /** The league this season belongs to. Null only if the embed returned
   *  nothing; it is what gives each card a film page to lead to. */
  leagueId: string | null;
  films: BidFilm[];
  minBid: number;
  /**
   * The season budget left, which already accounts for every film won so far.
   * Pending bids are NOT deducted from it — they cost nothing until won — which
   * is why the SUM of the slate has to fit rather than the change to it. That is
   * the ADR-001 sum-exposure cap the database enforces in `place_bids`.
   */
  remaining: number;
}) {
  const norm = (v: number | null | undefined) => v ?? 0;

  // RESET ON NEW SERVER DATA, WITHOUT REMOUNTING. React's documented
  // adjust-state-during-render pattern: it runs before children render, so it
  // cannot race the revalidation the way an effect can — and unlike keying the
  // component from the page, it does not unmount, which is what once made a
  // toast impossible here.
  const serverKey = films.map((f) => `${f.id}:${f.myBid ?? ""}`).join("|");
  const [seenKey, setSeenKey] = useState(serverKey);
  const [amounts, setAmounts] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(films.map((f) => [f.id, f.myBid]))
  );
  if (seenKey !== serverKey) {
    setSeenKey(serverKey);
    setAmounts(Object.fromEntries(films.map((f) => [f.id, f.myBid])));
  }

  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    placeBids,
    INITIAL
  );

  // THE TOAST FIRES FROM THE ACTION'S RESULT, not from a submit handler. React
  // runs a form action in its own scope and the RSC re-render that
  // `revalidatePath` triggers discards the continuation, so anything awaited
  // after the call never runs. `useActionState` hands the result back as state,
  // which survives that re-render. Compared by IDENTITY so saving the same
  // slate twice still toasts twice, while the mount stays silent.
  const lastResult = useRef<ActionResult>(state);
  useEffect(() => {
    if (state === lastResult.current) return;
    lastResult.current = state;
    if (isOk(state) && state.notice) toast.success(state.notice);
  }, [state]);

  // A REFUSAL IS ABOUT THE SLATE THAT WAS SENT, not the one on screen. Editing
  // any amount is what makes it stale. Keyed on the RESULT OBJECT because
  // `useActionState` returns a fresh one per submission.
  const amountsKey = films.map((f) => `${f.id}:${norm(amounts[f.id])}`).join("|");
  const [seenState, setSeenState] = useState(state);
  const [verdictAmountsKey, setVerdictAmountsKey] = useState(amountsKey);
  if (seenState !== state) {
    setSeenState(state);
    setVerdictAmountsKey(amountsKey);
  }
  const verdictApplies = verdictAmountsKey === amountsKey;

  // Only ELIGIBLE films are submittable. They stay on screen — you should see
  // the whole slate — but they are not part of the sum.
  const biddable = films.filter((f) => f.eligible);
  const total = biddable.reduce((sum, f) => sum + norm(amounts[f.id]), 0);
  const filmsIn = biddable.filter((f) => norm(amounts[f.id]) > 0).length;
  const committedPct = remaining > 0 ? Math.round((total / remaining) * 100) : 0;
  const dirty = biddable.some((f) => norm(amounts[f.id]) !== norm(f.myBid));

  // WHAT THE CLIENT CAN PROVE, THE CLIENT BLOCKS ON; what only the server knows,
  // it SHOWS and lets you retry. Folding the server's verdict in here is
  // unrecoverable: it names a film, the field goes invalid, the button
  // disables — and correcting the amount cannot clear a verdict that only a new
  // submission replaces, so the player could never submit.
  const clientProblem = (id: string): string | null => {
    const v = norm(amounts[id]);
    if (!Number.isInteger(v)) return "Whole dollars only.";
    // Zero is exempt from the minimum. It is not a small bid, it is the absence
    // of one, and refusing it would block a legal move.
    if (v > 0 && v < minBid) return `$0 to pass, or at least $${minBid}.`;
    return null;
  };
  const fieldProblem = (id: string): string | null =>
    clientProblem(id) ??
    (verdictApplies && !isOk(state) && state.field === id ? state.error : null);

  const overBudget = total > remaining;
  const anyClientProblem = biddable.some((f) => clientProblem(f.id) !== null);
  const blocked = overBudget || anyClientProblem;

  // The browser's own guard. Nothing else here can stop a click on the nav, and
  // a slate of typed amounts is the most expensive state in the app to lose —
  // the deadline may be minutes away.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // A failure naming a film on this slate is already shown against that film.
  // One naming a film that is NOT here would otherwise be swallowed entirely,
  // so the alert takes anything the grid did not claim.
  const shownAgainstAField =
    !isOk(state) && !!state.field && biddable.some((f) => f.id === state.field);
  const formError =
    verdictApplies && !isOk(state) && !shownAgainstAField ? state.error : null;

  return (
    <form action={formAction}>
      {/* THE PADDING IS THE STICKY BAR'S FOOTPRINT, not decoration: the bar is
          ~80px and sits at bottom-4, so with no allowance the last row of
          inputs sits underneath it at scroll 0. */}
      <div className="flex flex-col gap-6 pb-24">
        <input type="hidden" name="season_id" value={seasonId} />
        <input type="hidden" name="week_id" value={weekId} />
        {/* EVERY eligible film, $0 where blank (ADR-109). Submitting the whole
            slate is what makes `place_bids`' merge semantics and a replace
            behave identically — there is no film it could leave behind. */}
        <input
          type="hidden"
          name="basket"
          value={JSON.stringify(
            biddable.map((f) => ({ film_id: f.id, amount: norm(amounts[f.id]) }))
          )}
        />

        <FieldSet>
          <FieldLegend variant="label">This week&apos;s slate</FieldLegend>
          <FieldDescription>
            Bid on as many films as you like. Leave one blank to pass on it.
          </FieldDescription>
          <FieldGroup>
            {/* THE SUMMARY BAR IS STICKY AND OVERLAYS THIS GRID, so the grid
                has to reserve room for it. Without this padding a short slate
                on a 900px viewport put the bar straight across the poster row
                and pushed the inputs — the only reason the page exists — under
                it and below the fold. The reserve is the bar's height plus its
                `bottom-4` offset. */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-5 pb-28">
              {films.map((film) => (
                <FilmBidField
                  key={film.id}
                  film={film}
                  leagueId={leagueId}
                  minBid={minBid}
                  value={amounts[film.id] ?? null}
                  problem={fieldProblem(film.id)}
                  onChange={(v) => setAmounts((a) => ({ ...a, [film.id]: v }))}
                />
              ))}
            </div>
          </FieldGroup>
        </FieldSet>

        {/* A REJECTION IS NOT A TOAST. The database's refusals name an amount
            and are the player's cue to change something on this screen, so they
            stay on it until the slate changes — unlike the confirmation, which
            the toast carries because there is nothing left to act on. */}
        {formError && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>Your bids weren&apos;t saved</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        {/* THE MONEY STAYS ON SCREEN, and so does the reason the button is dead.
            A disabled control and its reason have to be the same object. */}
        <div className="sticky bottom-4 z-20 rounded-lg border bg-card/95 p-4 shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p>
                <span
                  className={cn("type-numeral text-numeral", overBudget && "text-destructive")}
                >
                  ${total}
                </span>
                <span className="type-ui text-ui ml-2 text-muted-foreground">
                  of ${remaining} available
                </span>
              </p>
              {/* EXPOSURE AS A SHARE, not only as a sum. "$15 of $56" is the
                  arithmetic; "27% committed" is the judgement the player is
                  actually making — a bankroll is spent once per season and
                  never replenished. Rounded for display, never for maths. */}
              <p className="type-micro text-micro mt-1 text-muted-foreground">
                {filmsIn === 0
                  ? "In on nothing — saving a slate of $0 sits the week out"
                  : `In on ${filmsIn} of ${biddable.length} · ${committedPct}% committed · $${Math.max(remaining - total, 0)} would stay free`}
              </p>
            </div>

            <div className="flex items-center gap-4">
              {dirty && (
                <span className="type-eyebrow text-eyebrow text-muted-foreground">Unsaved</span>
              )}
              {/* INK, NOT THE ACCENT. The budget is already spent on the clock
                  and on the films the player has money on. */}
              <Button type="submit" variant="ink" disabled={pending || blocked || !dirty}>
                {pending ? "Saving…" : dirty ? "Save your bids" : "Saved"}
              </Button>
            </div>
          </div>

          {blocked && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {overBudget
                ? `That's $${total - remaining} more than you have. Lower a bid to save.`
                : "Fix the amount marked above to save."}
            </p>
          )}
        </div>
      </div>
    </form>
  );
}

function FilmBidField({
  film,
  leagueId,
  minBid,
  value,
  problem,
  onChange,
}: {
  film: BidFilm;
  leagueId: string | null;
  minBid: number;
  value: number | null;
  problem: string | null;
  onChange: (v: number | null) => void;
}) {
  const inputId = useId();
  const messageId = `${inputId}-message`;
  const isIn = (value ?? 0) > 0;
  const invalid = film.eligible && problem !== null;

  return (
    <Field data-invalid={invalid || undefined} className="h-full">
      <PosterCard
        title={film.title}
        posterPath={film.posterPath}
        // THE CARD LEADS SOMEWHERE NOW. `/leagues/[leagueId]/films/[tmdbId]`
        // landed with build order 15; until then this was deliberately unset,
        // because a card that lifts on hover and leads to a 404 is worse than
        // one that does not lift. A manually-added film has no tmdb id and so
        // still has no destination.
        href={
          leagueId && film.tmdbId
            ? `/leagues/${leagueId}/films/${film.tmdbId}`
            : undefined
        }
        meta={film.releaseDate ? formatReleaseDate(film.releaseDate) : null}
        tomatometer={film.tomatometer}
        selected={isIn}
        disabled={!film.eligible}
        badge={
          !film.eligible ? (
            <Badge variant="secondary">Not eligible</Badge>
          ) : isIn ? (
            <Badge>Yours</Badge>
          ) : undefined
        }
        action={
          <>
            <label htmlFor={inputId} className="sr-only">
              Your bid on {film.title}
            </label>
            <InputGroup>
              {/* A PREFIX, NOT Intl CURRENCY FORMATTING. Formatting rounds the
                  VALUE to the format, not just the display — typing 2.5 once put
                  amount 3 in the basket, a bid the player never typed, on the one
                  field where $2 and $3 decide who owns the film. */}
              <InputGroupAddon>$</InputGroupAddon>
              <InputGroupInput
                id={inputId}
                inputMode="numeric"
                value={value ?? ""}
                // No "$" here — the addon draws it, so "$0 or $1+" would render
                // as "$ $0 or $1+".
                placeholder={`0 / ${minBid}+`}
                disabled={!film.eligible}
                aria-invalid={invalid || undefined}
                aria-describedby={messageId}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  onChange(raw === "" ? null : Number(raw));
                }}
              />
            </InputGroup>
            {invalid ? (
              <FieldError id={messageId} className="mt-1.5">
                {problem}
              </FieldError>
            ) : (
              <FieldDescription id={messageId} className="mt-1.5 text-xs">
          {/* THREE STATES, NOT TWO, because a SAVED $0 is not a blank field
              (ADR-109). Submitting writes a row for every eligible film, so
              passing on one leaves it reading "$0" for ever after — and "Blank
              passes" under a visible zero is instructions for a decision the
              player has already made. */}
                {!film.eligible
                  ? "Not eligible for bidding"
                  : isIn
                    ? "In on this one"
                    : value === null
                      ? "Blank passes"
                      : "Passing on this one"}
              </FieldDescription>
            )}
          </>
        }
      />
    </Field>
  );
}

/** Deliberately UTC: `release_date` is a plain date, and rendering it in the
 *  viewer's zone shifts it a day west of Greenwich. */
function formatReleaseDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
