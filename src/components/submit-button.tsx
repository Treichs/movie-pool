"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

/**
 * A submit that reads its own in-flight state from the form it sits in.
 *
 * `useFormStatus` rather than a `pending` prop, deliberately: a prop can
 * disagree with the form, and the one time it does is the time it matters. It
 * MUST be a child of the `<form>` it reports on — the hook reads the nearest
 * form above it, so a sibling gets `pending: false` for ever.
 */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "ink",
}: {
  children: React.ReactNode;
  pendingLabel: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
