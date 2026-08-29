"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/** The segment owns its failure. The copy answers the question this screen
 *  leaves open — whether the email went out — because someone who cannot tell
 *  will either wait for mail that is not coming or ask again and again. */
export default function ForgotPasswordError({
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
      <h1 className="type-h1 text-h1">This page didn&apos;t load</h1>
      <p className="mt-3 text-muted-foreground">
        No reset email was sent and your password is unchanged. Try again.
      </p>
      <div className="mt-6">
        <Button variant="ink" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
