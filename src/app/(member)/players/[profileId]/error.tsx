"use client";

import { ErrorScreen } from "@/components/error-screen";

/** A profile is entirely read. Nothing here writes, so the only promise worth
 *  making is that nobody's record changed — which is the fear on a page full
 *  of somebody's career numbers. */
export default function PlayerError({
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
      title="This player didn't load"
      back={{ href: "/leagues", label: "Back to your leagues" }}
    >
      No record has changed — not their seasons, their points or their titles.
      This page could not read them. Try again.
    </ErrorScreen>
  );
}
