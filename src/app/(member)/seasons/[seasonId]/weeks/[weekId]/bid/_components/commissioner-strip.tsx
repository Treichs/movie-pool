"use client";

import { useActionState, useEffect, useRef } from "react";
import { SettingsIcon } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useNow } from "@/hooks/use-now";
import { isOk, ok, type ActionResult } from "@/lib/action-result";
import type { WeekBidBoard } from "@/lib/week-bid";

import { closeWeek } from "../actions";

const INITIAL: ActionResult = ok(undefined);

/**
 * THE COMMISSIONER'S STRIP (ADR-095).
 *
 * A biddable week redirects EVERYONE here — the commissioner plays too — so the
 * open-week powers ride this page rather than forcing a context switch to a
 * parallel one. That is the IA map's standing decision: commissioner powers are
 * a role-gated inline component, not a second URL.
 *
 * Closing from here is always the EARLY close; the automation owns the on-time
 * one, which is what the confirm copy has to say.
 *
 * WEEK SETTINGS ARE NOT HERE YET. The old strip put the week's dates behind a
 * disclosure, using a form typed against `CommishFormState` — the second
 * form-result shape `ActionResult` exists to replace, and one shared by 34
 * commissioner actions that Band 5 has not rebuilt. Porting it would drag that
 * whole surface into a task that rebuilds one player screen. The disclosure
 * comes back with Band 5.
 */
export function CommissionerStrip({ board }: { board: WeekBidBoard }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    closeWeek,
    INITIAL
  );

  // THE DEADLINE CAN PASS WHILE THIS STRIP IS ON SCREEN, and until it was read
  // here the strip went on offering an "early" close and telling the
  // commissioner that "bidding hasn't reached its scheduled close yet" — both
  // false the moment the clock ran out. The bid form beside it has watched the
  // same clock since it shipped; this is the same reading, not a second one.
  const now = useNow(1000);
  const deadline = board.week.bidDeadline;
  const closed =
    deadline !== null && now !== null && now.getTime() >= new Date(deadline).getTime();

  const formRef = useRef<HTMLFormElement>(null);

  const last = useRef<ActionResult>(state);
  useEffect(() => {
    if (state === last.current) return;
    last.current = state;
    if (isOk(state)) {
      if (state.notice) toast.success(state.notice);
    } else {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <section
      aria-label="Commissioner"
      className="flex flex-wrap items-center gap-4 rounded-lg border border-primary bg-card p-5"
    >
      <SettingsIcon className="size-4 shrink-0 text-primary" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="type-eyebrow text-eyebrow text-muted-foreground">Commissioner</span>
        <span className="text-sm text-muted-foreground">
          {closed
            ? "The deadline has passed and the week is closing itself. Nothing left to do here."
            : "Bidding runs until the deadline and the week closes itself — closing now ends it early."}
        </span>
      </div>
      {/* NOTHING TO OFFER ONCE THE CLOCK HAS RUN. An early close is the only
          thing this control ever did, and after the deadline there is no early
          left — the automation owns the on-time close. A button whose only
          possible outcome is a refusal is worse than no button. */}
      {!closed && (
        <form action={formAction} ref={formRef}>
          <input type="hidden" name="season_id" value={board.season.id} />
          <input type="hidden" name="week_id" value={board.week.id} />
          {/* THE FRICTION IS A DIALOG, NOT `confirm()`. This is irreversible and
              it publishes every sealed bid in the league — the one act on this
              page that ends the secrecy the product is built on. The two other
              destructive commissioner flows already take the installed
              alert-dialog; a native confirm here was the last one left, and it
              cannot carry the app's voice, its focus handling, or its type. */}
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="outline" disabled={pending} />}>
              {pending ? "Closing…" : "Close bidding"}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Close bidding early?</AlertDialogTitle>
                <AlertDialogDescription>
                  The deadline has not passed yet. Closing now unseals every bid
                  to every player at once, locks the week, and cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Let it run</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => formRef.current?.requestSubmit()}
                >
                  Close and unseal
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </form>
      )}
    </section>
  );
}
