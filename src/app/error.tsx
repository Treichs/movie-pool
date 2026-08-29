"use client";

import { ErrorScreen } from "@/components/error-screen";

/** The root segment owns its failure, and here nothing is at risk: the landing page reads no account, submits nothing and holds no money. Not a substitute for `global-error.tsx`, which catches the root LAYOUT. */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorScreen
      error={error}
      reset={reset}
      title="This page didn't load"
    >
      Nothing is wrong with your account and nothing was signed in or out. Try again.
    </ErrorScreen>
  );
}
