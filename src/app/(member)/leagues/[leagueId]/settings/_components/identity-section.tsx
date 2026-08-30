"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { SubmitButton } from "@/components/submit-button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ok, type ActionResult } from "@/lib/action-result";

import { updateLeagueIdentity } from "../actions";

/**
 * IDENTITY — board 4.11's first section.
 *
 * ── THERE IS NO AVATAR PICKER, AND THERE IS NOTHING TO PICK ────────────
 * The board draws a 76px league mark with a "Change" link under it. A league's
 * mark is now DERIVED — `components/league-mark.tsx` composes it from the
 * league's id and name — so there is no stored choice for a picker to edit.
 * Renaming the league changes its letters, which is this form, and its colour
 * is keyed on the id so it survives the rename.
 *
 * `update_league_identity` still takes `p_avatar_pair` and `p_avatar_glyph`
 * because the RPC's signature is a database contract; both are passed null,
 * which is what every league already stores.
 *
 * ── THE FIELD IS CONTROLLED ────────────────────────────────────────────
 * Same reason as every other form in this app: React resets an uncontrolled
 * field when an action "succeeds", and a returned validation error counts as
 * success — so a rejected rename would blank the box the commissioner has to
 * retype into.
 */

const INITIAL: ActionResult = ok(undefined);

export function IdentitySection({
  leagueId,
  name,
}: {
  leagueId: string;
  name: string;
}) {
  const nameId = useId();
  const [value, setValue] = useState(name);
  const [state, formAction] = useActionState(updateLeagueIdentity, INITIAL);

  const last = useRef<ActionResult>(state);
  useEffect(() => {
    if (state === last.current) return;
    last.current = state;
    if (!state.ok) toast.error(state.error);
    else if (state.notice) toast.success(state.notice);
  }, [state]);

  const problem = !state.ok && state.field === "name" ? state.error : null;
  const unchanged = value.trim() === name;

  return (
    <section className="flex flex-col gap-4">
      <h2>Identity</h2>
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="leagueId" value={leagueId} />
        <Field data-invalid={problem ? true : undefined}>
          <FieldLabel htmlFor={nameId}>League name</FieldLabel>
          <Input
            id={nameId}
            name="name"
            value={value}
            maxLength={60}
            onChange={(e) => setValue(e.target.value)}
          />
          {problem ? (
            <FieldError>{problem}</FieldError>
          ) : (
            <FieldDescription>
              Shown in the nav, on every invitation, and in every email the
              league sends.
            </FieldDescription>
          )}
        </Field>
        <div className="flex">
          <SubmitButton pendingLabel="Saving…" disabled={unchanged}>
            Save name
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}
