"use client";

import { ErrorScreen } from "@/components/error-screen";

/** Nothing on this page writes until a button is pressed, so a failed READ has
 *  changed no setting — which is the one thing to say on a screen where the
 *  controls change how you sign in. */
export default function AccountError({
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
      title="Your account didn't load"
      back={{ href: "/leagues", label: "Back to your leagues" }}
    >
      Nothing about your account has changed — not your name, not your sign-in,
      not your email settings. This page could not read them. Try again.
    </ErrorScreen>
  );
}
