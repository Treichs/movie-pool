"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/** The segment owns its failure. Nothing here is stateful, so the honest thing
 *  to say is that nothing was lost — and to offer the one destination this page
 *  exists to lead to, rather than only a retry. */
export default function HowItWorksError({
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
        Nothing was lost — this page only explains the rules. Try again, or go
        straight to creating an account.
      </p>
      <div className="mt-6 flex gap-3">
        <Button variant="ink" onClick={reset}>
          Try again
        </Button>
        <Button
          variant="outline"
          render={<Link href="/signup" />}
          nativeButton={false}
        >
          Create an account
        </Button>
      </div>
    </main>
  );
}
