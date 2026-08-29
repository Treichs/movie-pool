"use client";

import { useState, useTransition } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { acceptInviteById, declineInvite } from "@/lib/actions/league";
import type { MyInvite } from "@/lib/invites";

/**
 * A PENDING INVITATION — the one thing on this page asking the viewer to act,
 * and therefore the only place it spends the accent.
 *
 * ── IT ACCEPTS HERE. IT DOES NOT LINK ONWARD ──────────────────────────────
 * `accept_league_invite` takes the invite id, which the read already returns,
 * so there is nothing for `/invites/[token]` to add for someone who is already
 * signed in and looking at the invitation. Sending them to a token URL they do
 * not have would be a dead end wearing a call to action.
 *
 * ── BOTH BUTTONS DISABLE TOGETHER, AND STAY DISABLED ──────────────────────
 * Accepting and declining are both one-way. A second click on either is at best
 * a wasted round trip and at worst a confusing error about an invitation that
 * no longer exists, so the pair is disabled from the first click and the row
 * waits for the revalidation to remove it.
 *
 * ── DECLINE IS QUIET ON PURPOSE ───────────────────────────────────────────
 * `outline`, not `destructive`. Declining an invitation is not a destructive
 * act — nothing is deleted that the viewer owns — and the palette ruling of
 * 2026-08-28 keeps `--destructive` for actions that end something.
 */
export function InviteCard({ invite }: { invite: MyInvite }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);

  const answer = (run: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const result = await run();
      if (result.ok) setAnswered(true);
      else setError(result.error ?? "That did not work.");
    });

  return (
    <div className="flex flex-col gap-3 rounded border-2 border-primary bg-card p-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <h2 className="type-h3 text-h3">
          {invite.invitedBy} invited you to {invite.leagueName}
        </h2>
        <p className="type-body text-ui text-muted-foreground">
          Accepting adds you to the league. You can leave it later.
        </p>
        {error && (
          <Alert variant="destructive" className="mt-2">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          variant="outline"
          disabled={pending || answered}
          onClick={() => answer(() => declineInvite(invite.id))}
        >
          Decline
        </Button>
        <Button
          variant="ink"
          disabled={pending || answered}
          onClick={() => answer(() => acceptInviteById(invite.id))}
        >
          {pending ? "Just a moment…" : "Accept"}
        </Button>
      </div>
    </div>
  );
}
