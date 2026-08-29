"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/** The segment owns its failure. This page only reads, so the honest thing to
 *  say is that nothing about the league changed — and to offer the way back to
 *  the list, which is where someone lands when they have nowhere else to be. */
export default function LeagueError({
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
      <h1>This league didn&apos;t load</h1>
      <p className="mt-3 text-muted-foreground">
        Nothing has changed about the league, its seasons or your standing —
        this page could not read them. Try again.
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
