"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/** The segment owns its failure. Sign-in is the one screen where "did that
 *  work?" is genuinely unanswerable from the outside, so the copy says plainly
 *  that nothing happened to the account. */
export default function LoginError({
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
      <h1 className="type-h1 text-h1">Sign-in didn&apos;t load</h1>
      <p className="mt-3 text-muted-foreground">
        Nothing changed about your account and you are not signed in. Try again.
      </p>
      <div className="mt-6">
        <Button variant="ink" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
