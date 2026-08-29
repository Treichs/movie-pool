"use client";

import { ErrorScreen } from "@/components/error-screen";

/** A failed render here has sent no email, which is the one thing someone waiting on an inbox needs to know. */
export default function ForgotPasswordError({
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
    >
      No reset email was sent and your password is unchanged. Try again.
    </ErrorScreen>
  );
}
