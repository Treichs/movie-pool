"use client";

import { ErrorScreen } from "@/components/error-screen";

/** A form that has written nothing must say so, or the reader assumes a half-made season is sitting somewhere. */
export default function NewSeasonError({
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
      back={{ href: "/leagues", label: "Back to your leagues" }}
    >
      No season was started — nothing is written until you press the button at the end of the form. Your answers are not saved, so starting again means starting from the dates.
    </ErrorScreen>
  );
}
