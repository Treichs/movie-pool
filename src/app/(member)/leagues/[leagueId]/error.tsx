"use client";

import { ErrorScreen } from "@/components/error-screen";

/** This page only reads. Saying so is the whole job — nothing here writes. */
export default function LeagueError({
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
      title="This league didn't load"
      back={{ href: "/leagues", label: "Back to your leagues" }}
    >
      Nothing has changed about the league, its seasons or your standing — this page could not read them. Try again.
    </ErrorScreen>
  );
}
