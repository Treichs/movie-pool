"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/** The segment owns its failure. The copy answers the only question that
 *  matters here — whether an account was created — because a failure on this
 *  screen is otherwise indistinguishable from one that half-worked, and a
 *  second attempt would then look like a duplicate registration. */
export default function SignUpError({
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
      <h1 className="type-h1 text-h1">Sign-up didn&apos;t load</h1>
      <p className="mt-3 text-muted-foreground">
        No account was created and no email was sent. Try again.
      </p>
      <div className="mt-6">
        <Button variant="ink" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
