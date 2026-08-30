"use client";

import { useActionState, useId, useState } from "react";
import { GoogleMark } from "@/components/google-mark";
import { PasswordInput } from "@/components/password-input";
import { SubmitButton } from "@/components/submit-button";
import { TextLink } from "@/components/text-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { signInWithGoogle, signUp } from "../actions";
import type { AuthFormState } from "../actions";
import { ConfirmationNotice } from "./confirmation-notice";

const INITIAL: AuthFormState = {};

/**
 * THE PAPER HALF OF `/signup`.
 *
 * ── SOURCING ──────────────────────────────────────────────────────────────
 * `@shadcn/signup-05` was read and rejected as a base: it is an email-only form
 * with two providers, so it has no password, no confirm and no name field, and
 * its dry-run wanted to overwrite `button.tsx` (our `ink` variant) and
 * `input.tsx`. What survives from it is the placement it shares with
 * `login-02` — submit in its own `Field`, `FieldSeparator` as the divider, the
 * provider button below it, the footer link in a `FieldDescription`. That is
 * the grammar `/login` already adopted, so this screen copies its sibling
 * rather than a second block.
 *
 * ── FOUR FIELDS, AND THE FOURTH IS NOT OPTIONAL ───────────────────────────
 * BOARD 1.2 DRAWS THREE. `signUp` reads a fourth, `confirm`, and returns
 * "Passwords don't match" when it is absent — so a three-field form can never
 * succeed. The board is the approved layout and cannot draw a server-side
 * rule; the action's guard is deliberate (2026-08-24) and exists because a
 * required password field that nothing validates answers a typo with silence.
 * Confirmed with the developer on 2026-08-28: the field is added, the action is
 * untouched.
 *
 * ── VERMILION BUDGET ON THIS SURFACE: ZERO ────────────────────────────────
 * Submit is `ink`, the provider button is `outline`, links are cobalt. The ink
 * pane beside it spends the page's accent, where `--nav` makes the same red
 * legible.
 *
 * TWO SIBLING FORMS, not one: `signInWithGoogle` is a server action of its own
 * needing its own `next` in its own FormData, and forms cannot nest. Same
 * structure as `/login`, for the same reason.
 */
export function SignUpForm({
  next,
  signInHref,
}: {
  next?: string;
  signInHref: string;
}) {
  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const confirmId = useId();
  // THE TWO IDENTITY FIELDS ARE CONTROLLED, AND THAT IS THE WHOLE REASON.
  // React 19 resets an uncontrolled form when its action completes, and a
  // REJECTED sign-up is a completion — so one mistyped confirmation wiped the
  // name, the email and both passwords, four fields retyped to fix one. Caught
  // by driving it; no gate can see it.
  //
  // Echoing the submitted values back as `defaultValue` also survives the
  // reset, but Base UI logs "a component is changing the default value state of
  // an uncontrolled FieldControl" and tells you to control it instead. It is
  // right: a value that changes is state.
  //
  // THE PASSWORDS STAY UNCONTROLLED and are therefore cleared. Holding them in
  // component state to save one retype is the wrong trade, and a password
  // manager refills them.
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [state, formAction] = useActionState<AuthFormState, FormData>(
    signUp,
    INITIAL
  );

  // THE SUCCESS PATH REPLACES THE FORM. `signUp` returns a notice instead of a
  // session for every new account, and re-showing the fields underneath a
  // banner would read as "that didn't work, try again".
  if (state.notice && state.unconfirmedEmail) {
    return (
      <ConfirmationNotice
        email={state.unconfirmedEmail}
        notice={state.notice}
      />
    );
  }

  return (
    <FieldGroup>
      <div className="flex flex-col gap-2">
        <h1 className="type-h1 text-h1">Join the pool</h1>
        <p className="text-muted-foreground">
          One account, every league you are invited to.
        </p>
      </div>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <form action={formAction}>
        <FieldGroup>
          {next && <input type="hidden" name="next" value={next} />}
          <Field>
            <FieldLabel htmlFor={nameId}>Display name</FieldLabel>
            <Input
              id={nameId}
              name="display_name"
              autoComplete="nickname"
              placeholder="What the standings will call you"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={emailId}>Email</FieldLabel>
            <Input
              id={emailId}
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={passwordId}>Password</FieldLabel>
            {/* `new-password` rather than `current-password`, which is what
                tells a password manager to offer a generated one here instead
                of filling the account it thinks you already have. */}
            <PasswordInput id={passwordId} autoComplete="new-password" />
            {/* The hint states the rule the action actually enforces. */}
            <FieldDescription>At least 8 characters.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={confirmId}>Confirm password</FieldLabel>
            <PasswordInput
              id={confirmId}
              name="confirm"
              autoComplete="new-password"
            />
          </Field>
          <Field>
            <SubmitButton pendingLabel="Creating your account…">
              Create account
            </SubmitButton>
          </Field>
        </FieldGroup>
      </form>

      <FieldSeparator>Or</FieldSeparator>

      {/* ITS OWN FORM — see the structural note above. */}
      <form action={signInWithGoogle}>
        <FieldGroup>
          {next && <input type="hidden" name="next" value={next} />}
          <Field>
            <Button type="submit" variant="outline">
              <GoogleMark className="size-4" />
              Continue with Google
            </Button>
            <FieldDescription>
              {/* THE DESTINATION SURVIVES THE HOP BACK. Bouncing between the
                  two forms must not lose the invitation that sent you here. */}
              Already have an account?{" "}
              <TextLink href={signInHref}>Sign in</TextLink>
            </FieldDescription>
          </Field>
        </FieldGroup>
      </form>
    </FieldGroup>
  );
}
