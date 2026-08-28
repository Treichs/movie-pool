"use client";

import { useActionState, useEffect, useRef } from "react";
import { SettingsIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
          Bidding runs until the deadline and the week closes itself — closing now
          ends it early.
        </span>
      </div>
      <form
        action={formAction}
        onSubmit={(e) => {
          // The ladder of friction lives on the control, not on a separate
          // address: this is irreversible and publishes every sealed bid.
          if (
            !confirm(
              "Bidding hasn't reached its scheduled close yet — closing now ends it early. Bids lock and become visible to every player, and this can't be undone. Close anyway?"
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="season_id" value={board.season.id} />
        <input type="hidden" name="week_id" value={board.week.id} />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Closing…" : "Close bidding"}
        </Button>
      </form>
    </section>
  );
}
