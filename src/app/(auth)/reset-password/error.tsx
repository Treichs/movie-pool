"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * The segment owns its failure, and this one has a specific job: a reset link
 * is single-use, so the question underneath any failure here is "is my link
 * spent, and is my password now something I do not know?"
 *
 * THE BOUNDARY CANNOT TELL. It sees a render that threw, not what the server
 * did or did not do — so it says what to do instead of guessing. Requesting a
 * new link is safe whether or not the last one was used: the password only
 * changes when the form succeeds, and a fresh link supersedes the old one.
 */
export default function ResetPasswordError({
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
        We cannot tell from here whether your link was used, so treat it as
        spent. Your password has not changed unless you saw it confirmed.
        Requesting a new link is safe either way.
      </p>
      <div className="mt-6 flex gap-3">
        <Button variant="ink" onClick={reset}>
          Try again
        </Button>
        <Button
          variant="outline"
          render={<Link href="/forgot-password" />}
          nativeButton={false}
        >
          Send a new link
        </Button>
      </div>
    </main>
  );
}
