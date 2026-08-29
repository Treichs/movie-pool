"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";

import { GoogleMark } from "@/components/google-mark";
import { PasswordInput } from "@/components/password-input";
import { SubmitButton } from "@/components/submit-button";
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

import { signIn, signInWithGoogle } from "../actions";
import type { AuthFormState } from "../actions";

const INITIAL: AuthFormState = {};

/**
 * THE PAPER HALF OF `/login`.
 *
 * ── COMPOSITION FROM `@shadcn/login-02`, STYLING FROM NOWHERE BUT US ───────
 * Kept from the block: a heading with one line under it above the fields, the
 * `FieldGroup` rhythm with one `Field` per row, "Forgot your password?" pushed
 * right INSIDE the label row by `ml-auto`, the submit in its own `Field` so
 * `Field`'s `*:w-full` sizes it, `FieldSeparator` as the divider, then the
 * provider button and a footer link in a `FieldDescription`.
 *
 * Replaced: all of its look. `text-2xl font-bold` becomes `type-h1 text-h1`,
 * because width is the hierarchy here and every `type-*` pairs with its own
 * size. The block's centred heading and footer become left-aligned, which is
 * the editorial ground the rest of the identity stands on.
 *
 * Three corrections the block needed: the provider is GOOGLE, not GitHub —
 * `signInWithOAuth({ provider: "google" })` is the only provider this app has;
 * `<a href="#">` is not a link, so both are real routes; and the copy follows
 * the app's own vocabulary — "Sign in", which is what every redirect that
 * targets this screen calls it.
 *
 * ── VERMILION BUDGET ON THIS SURFACE: ZERO ────────────────────────────────
 * The submit is `ink` (19.12:1), the provider button is `outline`, and the
 * links are cobalt. The ink pane beside it spends the page's one accent on its
 * wordmark, where `--nav` makes the same red 5.57:1 instead of 3.42:1.
 *
 * ── THE ONE STRUCTURAL CHANGE, AND IT IS FORCED ───────────────────────────
 * THE BLOCK IS ONE `<form>`; THIS IS TWO. login-02 renders the provider button
 * as `type="button"` inside the credential form, assuming a client handler.
 * Ours is a server action of its own that needs its own `next` in its own
 * FormData, and forms cannot nest. So the root is a `FieldGroup` holding two
 * sibling forms. Every other part of the composition survives unchanged.
 */
export function SignInForm({
  next,
  signUpHref,
  urlError,
}: {
  next?: string;
  signUpHref: string;
  urlError?: string;
}) {
  const emailId = useId();
  const passwordId = useId();
  // THE EMAIL FIELD IS CONTROLLED, and the reason is a React 19 behaviour that
  // reads backwards: "when a form Action SUCCEEDS, React will automatically
  // reset the form for uncontrolled components". An action that RETURNS a
  // rejection has succeeded — only a thrown error is a failure — so every wrong
  // password wiped the address as well. Controlling the field is the remedy the
  // React team points at; the alternative is going back to `onSubmit` with
  // `preventDefault` and an explicit transition, which gives up Actions.
  //
  // THE PASSWORD STAYS UNCONTROLLED and therefore clears, which is right: it is
  // the field you want to retype after getting it wrong, and a password manager
  // refills it. `/signup` and `/reset-password` draw the same line.
  const [email, setEmail] = useState("");
  const [state, formAction] = useActionState<AuthFormState, FormData>(
    signIn,
    INITIAL
  );

  // The URL's error is the page's (a dead link, a failed OAuth hop); the
  // action's is this form's. Only one can be true at a time, and the action's
  // wins because it is the more recent thing the person did.
  const error = state.error ?? urlError;

  return (
    <FieldGroup>
      <div className="flex flex-col gap-2">
        <h1 className="type-h1 text-h1">Sign in</h1>
        <p className="text-muted-foreground">
          Your leagues, your bankroll, and this week&apos;s slate.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}
            {/* THE ONE STATE A PERSON CANNOT ESCAPE ALONE. "Check your inbox"
                is a dead end for someone whose mail never arrived, and since
                autoconfirm was turned off this is the only way into an
                account, not a formality. */}
            {state.unconfirmedEmail && (
              <>
                {" "}
                <Link
                  href={`/signup?resend=${encodeURIComponent(state.unconfirmedEmail)}`}
                  className="text-link underline underline-offset-4"
                >
                  Send it again
                </Link>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      <form action={formAction}>
        <FieldGroup>
          {next && <input type="hidden" name="next" value={next} />}
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
            <div className="flex items-center">
              <FieldLabel htmlFor={passwordId}>Password</FieldLabel>
              <Link
                href="/forgot-password"
                className="ml-auto text-sm text-link underline-offset-4 hover:underline"
              >
                Forgot your password?
              </Link>
            </div>
            <PasswordInput id={passwordId} />
          </Field>
          <Field>
            <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
          </Field>
        </FieldGroup>
      </form>

      <FieldSeparator>Or continue with</FieldSeparator>

      {/* ITS OWN FORM — see the structural note above. */}
      <form action={signInWithGoogle}>
        <FieldGroup>
          {next && <input type="hidden" name="next" value={next} />}
          <Field>
            <Button type="submit" variant="outline">
              <GoogleMark className="size-4" />
              Sign in with Google
            </Button>
            <FieldDescription>
              {/* THE DESTINATION SURVIVES THE HOP. Someone who followed an
                  invitation and has no account is the common case for that
                  link, so losing `next` here would break the very flow it
                  exists for. */}
              Don&apos;t have an account?{" "}
              <Link href={signUpHref} className="text-link underline underline-offset-4">
                Create one
              </Link>
            </FieldDescription>
          </Field>
        </FieldGroup>
      </form>
    </FieldGroup>
  );
}
