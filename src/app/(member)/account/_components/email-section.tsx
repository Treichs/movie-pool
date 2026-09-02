"use client";

import { useActionState, useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { ActionResult } from "@/lib/action-result";
import {
  NOTIFY_COPY,
  NOTIFY_KINDS,
  type EmailPreferences,
} from "@/lib/account";

import { updateEmailPreferences } from "../actions";

/**
 * EMAIL — the four automatic emails, and whether you want each one.
 *
 * ── THESE FOUR ARE THE CRON'S FOUR, NOT A LIST SOMEBODY WROTE ─────────────
 * `NotifyKind` in `src/lib/notifications.ts` is one definition serving three
 * jobs: the `email_log` kind, the `profiles.notify_*` column suffix, and the
 * discriminator the four sweeps switch on. Rendering from it is what stops this
 * screen offering a fifth toggle nothing sends, or missing one that does.
 *
 * ── THE ORDER IS THE WEEK'S ORDER ─────────────────────────────────────────
 * Slate up, deadline near, reveal, scores. Reading down the list is reading the
 * shape of a week; alphabetical would be four unrelated sentences.
 *
 * ── THE SWITCHES POST AS CHECKBOXES ───────────────────────────────────────
 * Base UI's `Switch` renders a real input, so each carries `name` and the form
 * posts `"on"` for the ones that are on and nothing at all for the ones that
 * are not. The action reads an absent key as `false`, which is the only reading
 * that lets anything be turned off.
 */
export function EmailSection({
  preferences,
}: {
  preferences: EmailPreferences;
}) {
  const [prefs, setPrefs] = useState(preferences);
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    updateEmailPreferences,
    null,
  );

  const dirty = NOTIFY_KINDS.some((k) => prefs[k] !== preferences[k]);

  return (
    <section aria-labelledby="email-heading" className="flex flex-col gap-3.5">
      <h2 id="email-heading">Email</h2>

      <form action={formAction} className="flex flex-col gap-4">
        {state && !state.ok && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        {state?.ok && state.notice && (
          <Alert role="status">
            <AlertDescription>{state.notice}</AlertDescription>
          </Alert>
        )}

        <Card variant="flat" className="gap-0 p-0">
          {NOTIFY_KINDS.map((kind, i) => (
            <label
              key={kind}
              className={`flex items-center justify-between gap-6 px-4 py-3.5 ${
                i < NOTIFY_KINDS.length - 1 ? "border-b" : ""
              }`}
            >
              <span className="flex flex-col gap-0.5">
                <span className="type-ui text-ui">
                  {NOTIFY_COPY[kind].title}
                </span>
                <span className="type-body text-micro text-muted-foreground">
                  {NOTIFY_COPY[kind].detail}
                </span>
              </span>
              <Switch
                name={kind}
                checked={prefs[kind]}
                onCheckedChange={(next) =>
                  setPrefs((p) => ({ ...p, [kind]: next }))
                }
              />
            </label>
          ))}
        </Card>

        <div className="flex">
          <SubmitButton pendingLabel="Saving…" disabled={!dirty}>
            Save email settings
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}
