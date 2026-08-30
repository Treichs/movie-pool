"use client";

import { ErrorScreen } from "@/components/error-screen";

/** An invitation is single-use, so the first thing to settle is that a failed render did not spend it. */
export default function InviteError({
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
      title="This invitation didn't load"
      back={{ href: "/leagues", label: "Go to your leagues" }}
    >
      You have not joined anything, and the invitation is not used up — a page that fails to load cannot spend it. Try again, or open the link from your email a second time.
    </ErrorScreen>
  );
}
