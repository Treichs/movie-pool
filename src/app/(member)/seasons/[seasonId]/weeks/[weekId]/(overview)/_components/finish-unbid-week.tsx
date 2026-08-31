"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { SettingsIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isOk, type ActionResult } from "@/lib/action-result";

import { finishUnbidWeek } from "../actions";

/**
 * THE COMMISSIONER'S ONE PRESS ON A WEEK NOBODY BID IN.
 *
 * ── WHY IT IS A BUTTON AND NOT A FORM ─────────────────────────────────────
 * There is nothing to enter. The capture gate does not apply to a week with no
 * owners (migration 20260831150000), so the only thing standing between this
 * week and its place in history is somebody saying it is over. Asking for an
 * opening box office first would be asking for numbers that change nothing.
 *
 * ── AND WHY IT IS NOT A CONFIRMATION ──────────────────────────────────────
 * Finishing IS irreversible — `finalize_week` refuses a week that is already
 * final. But NN/g's test for a confirmation is consequence, not permanence:
 * this destroys no work, costs nobody money, and moves no standing, because
 * there is nothing here to move. A dialog on it would be the "crying wolf"
 * that makes the payouts confirmation — which publishes money — mean less.
 * The weight matches: ink, stated plainly, no ceremony.
 *
 * It mirrors the bid page's commissioner strip on purpose, so a commissioner
 * meets the same shape wherever the app hands them a lever.
 */
export function FinishUnbidWeek({
  seasonId,
  weekId,
}: {
  seasonId: string;
  weekId: string;
}) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionResult | null>(null);
  const last = useRef<ActionResult | null>(null);

  useEffect(() => {
    if (!state || state === last.current) return;
    last.current = state;
    if (!isOk(state)) toast.error(state.error);
    else if (state.notice) toast.success(state.notice);
  }, [state]);

  return (
    <Card variant="flat" className="flex-row flex-wrap items-center justify-between gap-4 border-primary">
      <div className="flex items-start gap-3">
        <SettingsIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <div className="flex flex-col gap-0.5">
          <span className="type-eyebrow text-eyebrow text-muted-foreground">
            Commissioner
          </span>
          <p className="type-body max-w-measure-default text-ui text-muted-foreground">
            Nobody bid, so there is nothing to capture and nothing to score.
            Finishing puts this week in the books as it stands.
          </p>
        </div>
      </div>
      <Button
        variant="ink"
        disabled={pending}
        onClick={() =>
          start(async () => setState(await finishUnbidWeek(seasonId, weekId)))
        }
      >
        {pending ? "Finishing…" : "Finish this week"}
      </Button>
    </Card>
  );
}
