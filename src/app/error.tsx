"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * THE ROOT SEGMENT OWNS ITS FAILURE. Same shape as the bid page's boundary —
 * `"use client"`, its own `<main>`, and copy that names what is safe.
 *
 * Here nothing is at risk, and saying so is the whole job: the landing page
 * reads no account, submits nothing and holds no money. It is not a substitute
 * for the app-wide boundary — `global-error.tsx` catches the root LAYOUT; this
 * catches this page and anything else that lands on the root segment.
 */
export default function RootError({
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
      <p className="type-body mt-3 text-muted-foreground">
        Nothing is wrong with your account and nothing was signed in or out.
        Try again.
      </p>
      <div className="mt-6">
        <Button variant="ink" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
