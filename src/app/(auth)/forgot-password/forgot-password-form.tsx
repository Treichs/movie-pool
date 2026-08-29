"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { MailIcon } from "lucide-react";

import { SubmitButton } from "@/components/submit-button";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { requestPasswordReset } from "../actions";
import type { AuthFormState } from "../actions";

const INITIAL: AuthFormState = {};

/** The brand marker on a screen whose only other brand element is the rail. */
function Eyebrow() {
  return (
    <span className="type-eyebrow text-eyebrow text-muted-foreground">
      The Movie Pool
    </span>
  );
}

/**
 * `/forgot-password`, both of its states.
 *
 * ── THE SENT STATE IS A SCREEN, NOT A TOAST (boards 1.3 and 1.3b) ─────────
 * It is drawn as its own board because it is the only place a person is told
 * what to do next, and what to do when nothing arrives. A message that fades
 * would leave someone staring at the form they just submitted, wondering
 * whether to submit it again.
 *
 * ── THE EMAIL FIELD IS CONTROLLED, FOR TWO REASONS ────────────────────────
 * The sent state names the address, and the action does not return it — it
 * returns one fixed sentence, on purpose (see below) — so the component is the
 * only thing that knows it. The second reason is the one `/signup` was built
 * around: React 19 resets an uncontrolled form when its action completes, so an
 * address rejected as malformed would be wiped before it could be corrected.
 *
 * ── THE REPLY NEVER VARIES, AND THAT IS THE FEATURE ───────────────────────
 * `requestPasswordReset` says the same thing whether or not the address has an
 * account, and does not even read Supabase's result. A form that answered
 * differently would be an account-enumeration oracle. So the sent state says
 * "IF an account exists", the resend cannot report success or failure, and the
 * only honest feedback it can give is that it is in flight.
 *
 * ── INK, NOT GREEN ────────────────────────────────────────────────────────
 * The confirmation is a bordered ink panel with a mail glyph. `--success`
 * exists and is not reached for: a state colour is spent deliberately, and
 * "we sent an email" — which may have gone nowhere, since the address may not
 * be on any account — is not a success worth colouring (palette ruling,
 * 2026-08-28).
 */
export function ForgotPasswordForm() {
  const emailId = useId();
  const [email, setEmail] = useState("");
  const [state, formAction] = useActionState<AuthFormState, FormData>(
    requestPasswordReset,
    INITIAL
  );

  if (state.notice) {
    return (
      <FieldGroup>
        <div className="flex flex-col gap-2">
          <Eyebrow />
          <h1 className="type-h1 text-h1">Check your email</h1>
          <p className="text-muted-foreground">
            {/* `<strong>`, not a styled span: the address is the one word on
                this screen a person needs to check, which is emphasis in the
                sense the element means. */}
            If an account exists for{" "}
            <strong className="text-foreground">{email}</strong>, a reset link
            is on its way. It expires in one hour.
          </p>
        </div>

        <Alert role="status">
          <MailIcon />
          <AlertTitle>Sent</AlertTitle>
          <AlertDescription>
            Nothing after a few minutes? Check spam, then try again — the
            address may not be the one on the account.
          </AlertDescription>
        </Alert>

        {/* RE-RUNS THE SAME ACTION with the same address, which is why the
            field is hidden rather than shown again: changing it here would be
            a second request wearing a resend's label. Someone who typed the
            wrong address goes back to sign-in and starts over, which is what
            the description above tells them. */}
        <form action={formAction}>
          <FieldGroup>
            <input type="hidden" name="email" value={email} />
            <Field>
              <SubmitButton variant="outline" pendingLabel="Sending…">
                Send it again
              </SubmitButton>
            </Field>
          </FieldGroup>
        </form>

        <FieldDescription>
          <Link
            href="/login"
            className="text-link underline underline-offset-4"
          >
            Back to sign in
          </Link>
        </FieldDescription>
      </FieldGroup>
    );
  }

  return (
    <FieldGroup>
      <div className="flex flex-col gap-2">
        <Eyebrow />
        <h1 className="type-h1 text-h1">Reset your password</h1>
        <p className="text-muted-foreground">
          Enter the email you signed up with and we will send you a link.
        </p>
      </div>

      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <form action={formAction}>
        <FieldGroup>
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
            <SubmitButton pendingLabel="Sending the link…">
              Send the link
            </SubmitButton>
          </Field>
        </FieldGroup>
      </form>

      <FieldDescription>
        Remembered it?{" "}
        <Link href="/login" className="text-link underline underline-offset-4">
          Back to sign in
        </Link>
      </FieldDescription>
    </FieldGroup>
  );
}
