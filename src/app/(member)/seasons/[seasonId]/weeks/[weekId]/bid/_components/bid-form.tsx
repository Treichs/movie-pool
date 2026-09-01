"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";

import { useNow } from "@/hooks/use-now";

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

/** The draft store never notifies: this component is its only writer, and it
 *  already holds the same values in React state. */
const NEVER_CHANGES = () => () => {};

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
  deadline,
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
  /** The moment this closes. Null when the commissioner set none, in which case
   *  the week runs until they close it by hand and there is nothing to count
   *  to — the form stays open and this guard never fires. */
  deadline: string | null;
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

  // THE TYPED SLATE OUTLIVES THE PAGE.
  //
  // `beforeunload` only fires on a reload or a close, which is the one way a
  // player rarely leaves this screen. What they actually do is tap a poster to
  // look at the film they are about to spend money on — a link covering most of
  // the card, with the bid field sitting inside it — or hit a nav tab. Both are
  // client navigations, both were silent, and both returned an empty slate to
  // someone who had been typing minutes before a deadline.
  //
  // Keyed by week so two weeks cannot inherit each other's draft, and wrapped
  // because Safari's private mode throws on `localStorage` rather than no-oping.
  //
  // `useSyncExternalStore` rather than a mount effect, because localStorage is
  // a store React does not own and this is the primitive that reads one without
  // a hydration mismatch. TWO THINGS ABOUT IT ARE EASY TO GET WRONG, and both
  // cost a slate here before they were understood:
  //
  // The snapshot is READ ONCE AND CACHED. React calls `getSnapshot` on every
  // render and re-renders when the value changes, so reading live storage would
  // make each keystroke — which rewrites the key below — trigger an extra pass.
  // The draft only matters as it was when the page opened.
  //
  // DURING HYDRATION REACT USES `getServerSnapshot`, which is null. A one-shot
  // "have I applied it yet" flag therefore burns on the hydration pass, before
  // the real value ever arrives, and the draft is never applied. Tracking the
  // string that was applied instead means the apply happens on the pass where
  // the value actually shows up.
  const draftKey = `movie-pool:bid-draft:${weekId}`;
  const cachedDraft = useRef<string | null | undefined>(undefined);
  const readDraft = useCallback(() => {
    if (cachedDraft.current === undefined) {
      try {
        cachedDraft.current = window.localStorage.getItem(draftKey);
      } catch {
        cachedDraft.current = null;
      }
    }
    return cachedDraft.current;
  }, [draftKey]);
  const draftRaw = useSyncExternalStore(NEVER_CHANGES, readDraft, () => null);

  const [appliedDraft, setAppliedDraft] = useState<string | null>(null);
  if (draftRaw !== null && appliedDraft === null) {
    setAppliedDraft(draftRaw);
    try {
      const draft = JSON.parse(draftRaw) as Record<string, number | null>;
      setAmounts((current) => {
        const next = { ...current };
        for (const f of films) if (f.id in draft) next[f.id] = draft[f.id];
        return next;
      });
    } catch {
      // A corrupt draft is not worth a broken form; the saved slate stands.
    }
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
    // The saved slate is now the server's, so the draft has nothing left to
    // protect and would otherwise be restored over a later visit.
    if (isOk(state)) {
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
        // Nothing to retire if storage is unavailable.
      }
    }
  }, [state, draftKey]);

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
  // WHETHER A SLATE WAS EVER SAVED IS NOT THE SAME QUESTION AS WHETHER THIS ONE
  // IS DIRTY. A player who has never bid has a clean form, and the control
  // beside it used to answer that with "Saved" — a claim about their money that
  // was not true. `myBid` is null until a row exists, and $0 is a saved bid.
  const hasSavedSlate = biddable.some((f) => f.myBid !== null);

  // EDITED AND SUBMITTABLE ARE TWO QUESTIONS, and they were one variable.
  //
  // `edited` is "these amounts differ from the ones on the server" — what the
  // "Unsaved" flag and the leave-the-page guard are actually about.
  //
  // `submittable` also allows the first save on a slate that has no rows yet.
  // `norm` reads a missing bid and a $0 bid as the same number, so a player who
  // had never bid and typed 0 into every field measured as unchanged, and the
  // button stayed dead on the one move the rules single out: a $0 slate is
  // legal, never wins, and is how someone who has spent their bankroll stays in
  // the week rather than vanishing from it. Submitting writes a row for every
  // eligible film (ADR-109), so where there are no rows there is always
  // something to write.
  const edited = biddable.some((f) => norm(amounts[f.id]) !== norm(f.myBid));
  const submittable = edited || !hasSavedSlate;

  // WRITE ONLY; THE CLEAR BELONGS TO A SAVE. Clearing here whenever the slate
  // matched the server looked tidier and destroyed the draft on arrival: the
  // hydration pass reads no draft, so `edited` is false on the very first
  // effect run, and the key was deleted a moment before it could be restored.
  // A save is a real event, so that is where the draft is retired.
  useEffect(() => {
    if (!edited) return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(amounts));
    } catch {
      // A slate that cannot be cached is still a slate that can be submitted.
    }
  }, [amounts, edited, draftKey]);

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

  // THE DEADLINE PASSING IS A STATE CHANGE THE PLAYER DID NOT INITIATE.
  //
  // The page's own guard is a server-render redirect on `!board.biddable`, so
  // it only fires on the NEXT navigation. A player already sitting here — which
  // is exactly where they are in the last minutes, because that is when people
  // bid — watched the clock reach zero with a live form, and found out it was
  // over only when the RPC refused them.
  //
  // NN/g's remedy for a state that changes underneath a user is to SAY SO and
  // keep their own work visible, not to make the affordance quietly stop
  // working. The amounts stay on screen and stay readable; only the ability to
  // submit ends, which is the thing that actually ended.
  const now = useNow(1000);
  const closed =
    deadline !== null && now !== null && now.getTime() >= new Date(deadline).getTime();

  const blocked = overBudget || anyClientProblem || closed;

  // The browser's own guard. Nothing else here can stop a click on the nav, and
  // a slate of typed amounts is the most expensive state in the app to lose —
  // the deadline may be minutes away.
  useEffect(() => {
    if (!edited) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [edited]);

  // A failure naming a film on this slate is already shown against that film.
  // One naming a film that is NOT here would otherwise be swallowed entirely,
  // so the alert takes anything the grid did not claim.
  const shownAgainstAField =
    !isOk(state) && !!state.field && biddable.some((f) => f.id === state.field);
  const formError =
    verdictApplies && !isOk(state) && !shownAgainstAField ? state.error : null;

  return (
    <form action={formAction}>
      {/* NO TRAILING RESERVE. The bar is the last child of this column, so in
          flow it already sits below the slate and can never cover it. Padding
          here only lengthens the document, and a document longer than the
          viewport is exactly what pins the bar over the inputs it follows. */}
      <div className="flex flex-col gap-6">
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
          {/* NO DESCRIPTION. "Leave one blank to pass on it" is the same fact
              every empty field already carries as "Blank passes", at the moment
              it is needed rather than a screen above it — the reasoning that
              removed the minimum-bid tile from the status card. On a phone this
              paragraph was 40px of restatement directly above the posters. */}
          <FieldLegend variant="label">This week&apos;s slate</FieldLegend>
          <FieldGroup>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-5">
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
            A disabled control and its reason have to be the same object.

            THE OFFSET CLEARS THE BOTTOM NAV, which is 56px and sticky at
            `bottom-0` below `md`. At `bottom-4` the submit button lands
            underneath it and a thumb aiming for Save navigates away instead,
            losing the typed slate. 72px is that 56 plus the same 16px gutter
            the desktop offset uses. */}
        <div className="sticky bottom-18 z-20 flex flex-col gap-2 rounded-lg border bg-card/95 p-3 shadow-lg backdrop-blur md:bottom-4 md:p-4">
          {/* THE SUM AND THE CONTROL SHARE THE FIRST LINE, and the reading of
              them takes the second. Wrapped, this bar stood 146px tall on a
              390px phone — a sixth of the viewport, permanently, over the
              posters it summarises. Splitting the share onto its own full-width
              line lets the money and the button sit on one row at any width. */}
          <div className="flex flex-nowrap items-center justify-between gap-4">
            <p className="min-w-0">
              <span className={cn("type-numeral text-numeral", overBudget && "text-destructive")}>
                ${total}
              </span>
              <span className="type-ui text-ui ml-2 text-muted-foreground">
                of ${remaining} available
              </span>
            </p>

            <div className="flex shrink-0 items-center gap-4">
              {/* THE STATE IS THE LABEL'S NEIGHBOUR, NOT THE LABEL. A button
                  says what pressing it will do; it cannot also be the readout
                  of what has already happened, and when it tried it told a
                  player who had never bid that their bids were "Saved". */}
              {!closed && (
                <span className="type-eyebrow text-eyebrow text-muted-foreground">
                  {edited ? "Unsaved" : hasSavedSlate ? "Saved" : "No bids yet"}
                </span>
              )}
              {/* THE CONTROL IS REPLACED, NOT GREYED OUT. GOV.UK: "disabled
                  buttons have poor contrast and can confuse some users, so
                  avoid them if possible" — and a dead button says nothing about
                  why. Once bidding is over the button's job is over too, so a
                  link to the board takes its place. */}
              {closed ? (
                <Button
                  variant="ink"
                  nativeButton={false}
                  render={<Link href={`/seasons/${seasonId}/weeks/${weekId}`} />}
                >
                  See the week
                </Button>
              ) : (
                /* INK, NOT THE ACCENT. The budget is already spent on the clock
                   and on the films the player has money on. */
                <Button type="submit" variant="ink" disabled={pending || blocked || !submittable}>
                  {pending ? "Saving…" : "Save your bids"}
                </Button>
              )}
            </div>
          </div>

          {/* EXPOSURE AS A SHARE, not only as a sum. "$15 of $56" is the
              arithmetic; "27% committed" is the judgement the player is
              actually making — a bankroll is spent once per season and
              never replenished. Rounded for display, never for maths. */}
          <p className="type-micro text-micro text-muted-foreground">
            {filmsIn === 0
              ? "In on nothing — saving a slate of $0 sits the week out"
              : `In on ${filmsIn} of ${biddable.length} · ${committedPct}% committed · $${Math.max(remaining - total, 0)} would stay free`}
          </p>

          {/* role="alert" so the close is spoken once when it happens, which is
              the same Level AA duty the countdown itself carries. */}
          {closed ? (
            <p role="alert" className="text-sm text-destructive">
              {edited
                ? "Bidding closed before these changes were saved, so they will not count. The bids you saved earlier are the ones that stand."
                : "Bidding is closed. Your saved bids are in and the sheet is sealed."}
            </p>
          ) : (
            blocked && (
              <p role="alert" className="text-sm text-destructive">
                {overBudget
                  ? `That's $${total - remaining} more than you have. Lower a bid to save.`
                  : "Fix the amount marked above to save."}
              </p>
            )
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

  // "YOURS" IS A SAVED POSITION, NOT A KEYSTROKE. The badge and the vermilion
  // edge used to follow the typed value, so they fired on an amount that was
  // unsaved, over budget, or sitting in a field marked invalid. Vermilion means
  // *live and yours* in this system; spending it on "you typed something" left
  // nothing to mark an actual holding with. What the player is proposing is
  // carried by the field's own helper text and by the bar's "Unsaved".
  const isYours = (film.myBid ?? 0) > 0;

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
        selected={isYours}
        disabled={!film.eligible}
        badge={
          !film.eligible ? (
            <Badge variant="secondary">Not eligible</Badge>
          ) : isYours ? (
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
