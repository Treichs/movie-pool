"use client";

import { ErrorScreen } from "@/components/error-screen";

/** Nothing is created until the form posts, and saying so stops a second attempt from feeling like a second account. */
export default function SignUpError({
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
      title="Sign-up didn't load"
    >
      No account was created and no email was sent. Try again.
    </ErrorScreen>
  );
}
