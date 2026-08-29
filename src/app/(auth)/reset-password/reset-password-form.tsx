"use client";

import { useActionState, useId, useState } from "react";
import { CheckIcon } from "lucide-react";

import { PasswordInput } from "@/components/password-input";
import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";

import { completePasswordReset } from "../actions";
import type { AuthFormState } from "../actions";

const INITIAL: AuthFormState = {};

/**
 * FOUR INK STEPS AND A WORD — never a red-amber-green ramp (board 1.4).
 *
 * There is no amber in this palette, so a traffic light cannot be built from it
 * honestly, and the red that does exist is the brand's — which would make a
 * weak password look like a feature. The steps are ink; the empty ones are
 * `--border`.
 *
 * THE RULE IS DELIBERATELY SMALL, AND STATED RATHER THAN TUNED. Eight
 * characters is the only thing the server enforces, so anything below that is
 * named for what it is instead of being scored. Above it the meter is advice:
 * length past twelve, and how many of the four character families appear.
 * A meter that pretends to more precision than that is theatre.
 */
const CLASSES = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/];

function strength(password: string): { steps: number; label: string } {
  if (!password) return { steps: 0, label: "" };
  if (password.length < 8) return { steps: 1, label: "Too short" };
  const families = CLASSES.filter((re) => re.test(password)).length;
  if (password.length >= 12 && families >= 3) return { steps: 4, label: "Strong" };
  if (password.length >= 12 || families >= 3) return { steps: 3, label: "Good" };
  return { steps: 2, label: "Weak" };
}

function StrengthMeter({ password }: { password: string }) {
  const { steps, label } = strength(password);
  return (
    <div className="flex items-center gap-2">
      {/* DECORATIVE. The word beside them carries the same fact in text, and
          four unlabelled bars announced one by one would be noise. */}
      <div aria-hidden className="flex grow items-center gap-2">
        {[1, 2, 3, 4].map((step) => (
          <div
            key={step}
            className={`h-1.5 grow rounded-xs ${
              step <= steps ? "bg-foreground" : "bg-border"
            }`}
          />
        ))}
      </div>
      {/* `aria-live` rather than a plain span: the word changes as you type,
          and it is the only feedback a non-sighted user gets from the meter. */}
      <span
        aria-live="polite"
        className="type-micro text-micro w-14 text-right text-muted-foreground"
      >
        {label}
      </span>
    </div>
  );
}

/**
 * `/reset-password` — step two, after the recovery link has established a
 * session. The page above it has already decided this form should render at
 * all; a spent or wrong-browser link never reaches here.
 *
 * BOTH FIELDS ARE CONTROLLED, and for this screen that is not the React 19
 * form-reset workaround it was on `/signup` — the meter and the match check
 * both have to read what has been typed. The reset protection comes free.
 *
 * The action does the real validation (eight characters, and the two must
 * match) and it is the same pair `signUp` runs, in the same order, with the
 * same wording. Nothing is duplicated here to look responsive.
 */
export function ResetPasswordForm() {
  const passwordId = useId();
  const confirmId = useId();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, formAction] = useActionState<AuthFormState, FormData>(
    completePasswordReset,
    INITIAL
  );

  const matches = password.length > 0 && password === confirm;

  return (
    <form action={formAction}>
      <FieldGroup>
        {state.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}

        <Field>
          <FieldLabel htmlFor={passwordId}>New password</FieldLabel>
          <PasswordInput
            id={passwordId}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <StrengthMeter password={password} />
        </Field>

        <Field>
          <FieldLabel htmlFor={confirmId}>Confirm password</FieldLabel>
          <PasswordInput
            id={confirmId}
            name="confirm"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            trailing={
              matches ? (
                <CheckIcon aria-hidden className="size-4 text-foreground" />
              ) : null
            }
          />
          {/* THE TICK IS THE BOARD'S; THIS IS THE SAME FACT IN TEXT. A glyph
              inside a field is not a label, and "the passwords now match" is
              exactly the kind of thing a screen reader user is otherwise left
              to infer from silence. */}
          {matches && (
            <FieldDescription role="status" className="sr-only">
              Passwords match.
            </FieldDescription>
          )}
        </Field>

        <Field>
          <SubmitButton pendingLabel="Setting your password…">
            Set password and sign in
          </SubmitButton>
        </Field>
      </FieldGroup>
    </form>
  );
}
