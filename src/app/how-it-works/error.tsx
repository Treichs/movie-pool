"use client";

import { ErrorScreen } from "@/components/error-screen";

/** Nothing on this page belongs to anybody, so the second action is the one they were probably heading for anyway. */
export default function HowItWorksError({
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
      back={{ href: "/signup", label: "Create an account" }}
    >
      Nothing was lost — this page only explains the rules. Try again, or go straight to creating an account.
    </ErrorScreen>
  );
}
