"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/** The segment owns its failure. This page only reads, and the one thing worth
 *  promising is that a failed render has not touched a bid — because the page
 *  someone was on their way to is the bid slate. */
export default function SeasonError({
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
      <h1>This season didn&apos;t load</h1>
      <p className="mt-3 text-muted-foreground">
        Nothing has changed about your bids, your standing or the week — this
        page could not read them. Try again.
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
