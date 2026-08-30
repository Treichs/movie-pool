"use client";

import { ErrorScreen } from "@/components/error-screen";

/** Sign-in is the one screen where "did that work?" is genuinely unanswerable from the outside, so the copy says plainly that nothing happened to the account. */
export default function LoginError({
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
      title="Sign-in didn't load"
    >
      Nothing changed about your account and you are not signed in. Try again.
    </ErrorScreen>
  );
}
