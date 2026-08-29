"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/** The segment owns its failure. The one thing someone needs to know here is
 *  whether they joined, and a boundary cannot tell — so it says what is
 *  certainly true instead: an invitation is not spent by a page that failed to
 *  render, and the link can simply be opened again. */
export default function InviteError({
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
      <h1>This invitation didn&apos;t load</h1>
      <p className="mt-3 text-muted-foreground">
        You have not joined anything, and the invitation is not used up — a page
        that fails to load cannot spend it. Try again, or open the link from
        your email a second time.
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
          Go to your leagues
        </Button>
      </div>
    </main>
  );
}
