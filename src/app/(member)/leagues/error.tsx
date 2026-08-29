"use client";

import { ErrorScreen } from "@/components/error-screen";

/** This page is where someone lands when they have nowhere else to be, so the copy avoids implying they have lost something. */
export default function LeaguesError({
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
      title="Your leagues didn't load"
    >
      Nothing has changed about your leagues or any invitation waiting for you — this page could not read them. Try again.
    </ErrorScreen>
  );
}
