"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { acceptInviteByToken } from "@/lib/actions/league";

/**
 * THE ONE ACTION ON THE PAGE.
 *
 * ── IT NAVIGATES ON SUCCESS, AND THAT IS THE WHOLE POINT OF THE SCREEN ────
 * Someone who followed an emailed link came to join a league, not to read a
 * confirmation. The RPC returns the league id, so the button takes them
 * straight into it. `/leagues` does the opposite — it stays put, because there
 * the invitation was one item among several and the list is still the answer.
 *
 * ── NO DECLINE HERE, THOUGH `/leagues` HAS ONE ────────────────────────────
 * `decline_league_invite` takes an invitation's id, and a link carries only a
 * token. More importantly, an open link is shared with a group: declining one
 * would either do nothing or take it away from everybody. Someone who does not
 * want to join closes the tab, which costs them nothing and is what they would
 * do anyway.
 *
 * Disabled from the first click and left that way: joining is one-way, and a
 * second press is at best a wasted round trip.
 */
export function InviteDecision({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  return (
    <div className="flex flex-col gap-2.5">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button
        variant="ink"
        className="h-12 w-full"
        disabled={pending || joined}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptInviteByToken(token);
            if (result.ok) {
              setJoined(true);
              router.push(`/leagues/${result.data.leagueId}`);
            } else {
              setError(result.error);
            }
          })
        }
      >
        {pending || joined ? "Joining…" : "Join the league"}
      </Button>
      <p className="type-micro text-center text-micro text-muted-foreground">
        You can leave at any time before a season starts.
      </p>
    </div>
  );
}
