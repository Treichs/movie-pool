"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/** The segment owns its failure. The question underneath any failure here is
 *  whether a season was started, because a league may only have one under way —
 *  so the copy answers it. Nothing is written until the button is pressed. */
export default function NewSeasonError({
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
      <h1>This page didn&apos;t load</h1>
      <p className="mt-3 text-muted-foreground">
        No season was started — nothing is written until you press the button at
        the end of the form. Your answers are not saved, so starting again means
        starting from the dates.
      </p>
      <div className="mt-6 flex gap-3">
        <Button variant="ink" onClick={reset}>
          Try again
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
