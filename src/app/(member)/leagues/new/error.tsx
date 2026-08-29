"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * The segment owns its failure, and the plan asked this one to say WHICH
 * STEP'S DATA SURVIVED. The honest answer is none of it, and saying so is
 * better than implying otherwise: the wizard keeps its four steps in component
 * state and writes nothing until the last button, so a boundary that replaces
 * the component has taken the answers with it.
 *
 * That is also why it says no league was created. The three RPCs run together
 * at the end, so a failure before that point cannot have made one — and
 * somebody who is not told that will go looking for a half-made league on
 * `/leagues` before trying again.
 */
export default function NewLeagueError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-svh max-w-measure-default flex-col justify-center px-6 py-12">
      <h1>The wizard didn&apos;t load</h1>
      <p className="mt-3 text-muted-foreground">
        No league was created and nothing was saved — the four steps are only
        held on this page until you finish them, so starting again means
        starting from the name. Sorry for the retype.
      </p>
      <div className="mt-6 flex gap-3">
        <Button variant="ink" onClick={reset}>
          Start again
        </Button>
        <Button
          variant="outline"
          render={<Link href="/leagues" />}
          nativeButton={false}
        >
          Back to your leagues
        </Button>
      </div>
    </main>
  );
}
