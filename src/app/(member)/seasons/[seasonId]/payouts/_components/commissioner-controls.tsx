"use client";

import { useTransition } from "react";
import { CheckCircle2Icon, XCircleIcon } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import type { ActionResult } from "@/lib/action-result";

import { finalizeSettlement, generateDraft, regenerateDraft } from "../actions";

/**
 * THE CONTROLS, AT THE FOOT — board 5.1b.
 *
 * ── THE FRICTION LADDER IS THE POINT, AND IT IS THREE RUNGS ────────────
 * **Generate / Regenerate** is routine: nothing is published, the draft is
 * rebuilt from today's standings, and it may be done as often as the
 * commissioner likes. It is an outline button and confirms only because a
 * draft they were reading is about to be replaced.
 * **Finalize** is once. It publishes to every member and can never be
 * regenerated, so it takes the heavy treatment: ink, a confirm that says what
 * becomes true, and a disabled state that states its own reason.
 *
 * Weight matches consequence. A regenerate that looked as grave as a finalize
 * would teach a commissioner to click through both.
 *
 * ── ONCE FINAL, THERE IS NOTHING TO OFFER ──────────────────────────────
 * `generate_settlement` refuses outright — "this season already has a final
 * settlement" — so a Generate button on a published season is a control that
 * can only fail. Driving it is what caught that: the block kept rendering
 * after Finalize and offered to build a new draft. It now says the season is
 * closed and offers nothing, which is the truth and is also the whole point of
 * the ladder — the last rung has no next step.
 *
 * ── THE BLOCKER IS SHOWN, NOT JUST OBEYED ──────────────────────────────
 * A disabled button owes its reader a reason. `finalize_settlement` refuses a
 * season that is not over, and the sentence beside the button says so — which
 * is the one thing that turns "why can't I press this" into "ah, later".
 */
export function CommissionerControls({
  seasonId,
  leagueId,
  settlementId,
  hasDraft,
  isFinal,
  finalizeBlocker,
}: {
  seasonId: string;
  leagueId: string | null;
  settlementId: string | null;
  hasDraft: boolean;
  isFinal: boolean;
  finalizeBlocker: string | null;
}) {
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) toast.error(result.error);
      else if (result.notice) toast.success(result.notice);
    });

  if (isFinal) {
    return (
      <section className="flex flex-col gap-3">
        <h2>Commissioner</h2>
        <div className="flex items-start gap-3 rounded border-2 border-foreground px-5 py-4">
          <CheckCircle2Icon className="mt-0.5 size-4.5 shrink-0" aria-hidden />
          <p className="type-body max-w-measure-default text-ui">
            These payouts are published and every member can see them. There is
            nothing left to do here — the league&rsquo;s dues page is where
            payments get recorded from now on.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2>Commissioner</h2>
      <div className="flex flex-col gap-5 rounded border-2 border-foreground p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
          <div className="flex max-w-measure-default flex-col gap-1">
            <h3>{hasDraft ? "Regenerate the draft" : "Generate the draft"}</h3>
            <p className="type-body text-ui text-muted-foreground">
              {hasDraft
                ? "Rebuilds these numbers from the standings as they are now. Routine — the existing draft is replaced and nothing is published."
                : "Works out what everyone would win or owe from the standings as they are now. Only you will see it."}
            </p>
          </div>

          {hasDraft ? (
            <AlertDialog>
              <AlertDialogTrigger
                render={<Button variant="outline" disabled={pending} />}
              >
                Regenerate draft
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Regenerate the draft payouts?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Rebuilt from the current standings. The existing draft is
                    replaced, and nothing is published to anyone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep this draft</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => run(() => regenerateDraft(seasonId, leagueId))}
                  >
                    Regenerate
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => run(() => generateDraft(seasonId, leagueId))}
            >
              {pending ? "Generating…" : "Generate draft"}
            </Button>
          )}
        </div>

        <Separator />

        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
          <div className="flex max-w-measure-default flex-col gap-1">
            <h3>Finalize</h3>
            <p className="type-body text-ui text-muted-foreground">
              Publishes these payouts to every member.{" "}
              <span className="font-semibold text-foreground">
                It cannot be regenerated afterwards.
              </span>
            </p>
            {finalizeBlocker && (
              <span className="type-body mt-1 flex items-center gap-1.5 text-micro text-muted-foreground">
                <XCircleIcon className="size-3.5 shrink-0" aria-hidden />
                {finalizeBlocker}
              </span>
            )}
          </div>

          {finalizeBlocker ? (
            // Disabled and SAID. The reason sits beside it above.
            <Button variant="ink" disabled>
              Finalize
            </Button>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger
                render={<Button variant="ink" disabled={pending} />}
              >
                Finalize
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Finalize the payouts?</AlertDialogTitle>
                  <AlertDialogDescription>
                    They become visible to every member and can no longer be
                    regenerated.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Not yet</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() =>
                      run(() =>
                        finalizeSettlement(seasonId, leagueId, settlementId ?? "")
                      )
                    }
                  >
                    Finalize and publish
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </section>
  );
}
