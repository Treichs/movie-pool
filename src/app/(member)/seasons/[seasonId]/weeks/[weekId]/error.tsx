"use client";

import { ErrorScreen } from "@/components/error-screen";

/** The week board reads a week that has already happened. Nothing here writes,
 *  so the reassurance worth giving is that the result is not what broke. */
export default function WeekError({
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
      title="This week didn't load"
      back={{ href: "/leagues", label: "Back to your leagues" }}
    >
      The result stands — no bid, owner or score has changed. This page could
      not read them. Try again.
    </ErrorScreen>
  );
}
