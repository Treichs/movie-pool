"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * THE SEGMENT OWNS ITS FAILURE. Sitting beside `page.tsx`, a throw in the
 * composer replaces this page's content and keeps the shell and the nav — it
 * does not blow up to a whole-app error screen.
 *
 * IT NAMES WHAT IS SAFE. On this screen the player's fear is specific and
 * expensive: bids are money and the deadline is running. Saying nothing was
 * submitted is the whole job of this copy.
 */
export default function BidError({
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
    <main className="mx-auto w-full max-w-measure-page p-6 md:p-8">
      <h1>This week didn&apos;t load</h1>
      <p className="type-dek text-dek mt-3 max-w-[52ch] text-muted-foreground">
        Nothing was submitted and no bid changed. Try again — if it keeps
        failing, the week board still shows where the season stands.
      </p>
      <Button variant="ink" className="mt-6" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
