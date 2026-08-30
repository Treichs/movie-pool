"use client";

import { ErrorScreen } from "@/components/error-screen";

/** Four steps of typing live only on this page, so the honest thing is to say the retype is coming rather than imply a quick retry. */
export default function NewLeagueError({
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
      title="The wizard didn't load"
      back={{ href: "/leagues", label: "Back to your leagues" }}
      resetLabel="Start again"
    >
      No league was created and nothing was saved — the four steps are only held on this page until you finish them, so starting again means starting from the name. Sorry for the retype.
    </ErrorScreen>
  );
}
