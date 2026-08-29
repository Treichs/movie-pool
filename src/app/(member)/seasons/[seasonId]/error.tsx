"use client";

import { ErrorScreen } from "@/components/error-screen";

/** This page only reads, and the one thing worth promising is that a failed render has not touched a bid — because the page someone was on their way to is the bid slate. */
export default function SeasonError({
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
      title="This season didn't load"
      back={{ href: "/leagues", label: "Back to your leagues" }}
    >
      Nothing has changed about your bids, your standing or the week — this page could not read them. Try again.
    </ErrorScreen>
  );
}
