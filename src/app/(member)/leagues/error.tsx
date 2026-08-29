"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/** The segment owns its failure. This page is where someone lands when they
 *  have nowhere else to be, so the copy avoids implying they have lost
 *  something — a failed read here says nothing about their leagues. */
export default function LeaguesError({
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
      <h1>Your leagues didn&apos;t load</h1>
      <p className="mt-3 text-muted-foreground">
        Nothing has changed about your leagues or any invitation waiting for
        you — this page could not read them. Try again.
      </p>
      <div className="mt-6">
        <Button variant="ink" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
