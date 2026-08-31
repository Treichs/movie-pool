"use client";

import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { InviteePicker, type Invitee } from "@/components/invitee-picker";
import { ok, type ActionResult } from "@/lib/action-result";
import { relativeDay } from "@/lib/format";
import type { PendingInvite } from "@/lib/invites";

import { createInvite, revokeInvite } from "../actions";

/**
 * INVITES — board 4.11's fourth section.
 *
 * ── THE LINK IS COPIED IN THE BROWSER, NOT RENDERED AS AN ANCHOR ───────
 * An invitation token in a live `<a href>` is a link somebody can middle-click
 * from a shared screen. `getLeagueInvites` returns the token because the
 * commissioner genuinely needs to send it; this puts it on the clipboard on a
 * deliberate press and shows only the last few characters otherwise.
 *
 * ── EVERY INVITATION IS TARGETED ───────────────────────────────────────
 * `create_league_invite` takes an address, and `accept_league_invite` refuses
 * a targeted invitation whose address does not match the caller's. There is no
 * open join link in this product, so there is nothing here to create one with.
 */

const INITIAL: ActionResult = ok(undefined);

function InviteRow({
  leagueId,
  invite,
}: {
  leagueId: string;
  invite: PendingInvite;
}) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const link = `${typeof window === "undefined" ? "" : window.location.origin}/invites/${invite.token}`;

  return (
    <li className="flex flex-wrap items-center justify-between gap-4 border-b px-4 py-3 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="type-ui truncate text-ui font-semibold">
          {invite.email ?? "Anyone with the link"}
        </span>
        <span className="type-body text-micro text-muted-foreground">
          {/* The last six characters only — enough to tell two invitations
              apart, not enough to be useful over someone's shoulder. */}
          …{invite.token.slice(-6)} · expires {relativeDay(invite.expiresAt)}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
              toast.success("Invitation link copied.");
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // A denied clipboard is not an error worth a red toast — the
              // commissioner can still send the invitation by email.
              toast.error("Your browser would not let the page copy that.");
            }
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await revokeInvite(leagueId, invite.id);
              if (!result.ok) toast.error(result.error);
              else if (result.notice) toast.success(result.notice);
            })
          }
        >
          {pending ? "Revoking…" : "Revoke"}
        </Button>
      </div>
    </li>
  );
}

/** The made choice, standing in for the field until it is sent or cleared.
 *  A picked ACCOUNT shows its name; a typed address shows the address, because
 *  that one the commissioner wrote themselves. */
function ChosenInvitee({
  invitee,
  onClear,
}: {
  invitee: Invitee;
  onClear: () => void;
}) {
  return (
    <span className="flex h-9 max-w-80 min-w-0 items-center gap-2 rounded-4xl border border-edge bg-input/50 px-3">
      <span className="type-ui truncate text-ui">
        {invitee.kind === "profile" ? invitee.displayName : invitee.email}
      </span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove ${invitee.kind === "profile" ? invitee.displayName : invitee.email}`}
        className="shrink-0 rounded-4xl px-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        <span aria-hidden>×</span>
      </button>
    </span>
  );
}

export function InvitesSection({
  leagueId,
  invites,
}: {
  leagueId: string;
  invites: PendingInvite[];
}) {
  const pickerId = useId();
  // What the commissioner has chosen: a real account, or an address they
  // typed. Held rather than submitted straight away so the field can show the
  // choice and let them change their mind before pressing Invite.
  const [chosen, setChosen] = useState<Invitee | null>(null);
  const [state, formAction] = useActionState(createInvite, INITIAL);

  // CLEARING THE FIELD IS AN ADJUSTMENT DURING RENDER, NOT AN EFFECT.
  // React's own rule — and this repo's linter — refuse `setState` inside an
  // effect body, and the documented alternative is exactly this: compare the
  // new server result to the last one seen and adjust before children render.
  // The TOAST stays in the effect below, because a toast IS a side effect.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.ok && state.notice) setChosen(null);
  }

  const last = useRef<ActionResult>(state);
  useEffect(() => {
    if (state === last.current) return;
    last.current = state;
    if (!state.ok) toast.error(state.error);
    else if (state.notice) toast.success(state.notice);
  }, [state]);

  const problem = !state.ok && state.field === "email" ? state.error : null;

  return (
    <section className="flex flex-col gap-4">
      <h2>Invites</h2>

      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="leagueId" value={leagueId} />
        {/* One of the two is submitted, never both. A picked account travels as
            an id so its address is resolved in the database — the browser is
            never told what it is. */}
        <input
          type="hidden"
          name="profileId"
          value={chosen?.kind === "profile" ? chosen.profileId : ""}
        />
        <input
          type="hidden"
          name="email"
          value={chosen?.kind === "email" ? chosen.email : ""}
        />

        <Field data-invalid={problem ? true : undefined}>
          <FieldLabel htmlFor={pickerId}>Invite someone</FieldLabel>
          <div className="flex flex-wrap items-center gap-2">
            {chosen ? (
              <ChosenInvitee invitee={chosen} onClear={() => setChosen(null)} />
            ) : (
              <div className="w-full max-w-80">
                <InviteePicker
                  id={pickerId}
                  leagueId={leagueId}
                  onPick={setChosen}
                />
              </div>
            )}
            <SubmitButton pendingLabel="Sending…" disabled={chosen === null}>
              Invite
            </SubmitButton>
          </div>
          <FieldDescription>
            Search anyone already on The Movie Pool, or type the email address
            of someone who is not.
          </FieldDescription>
          {problem && <FieldError>{problem}</FieldError>}
        </Field>
      </form>

      {invites.length > 0 && (
        <Card variant="flat" className="gap-0 p-0">
          <ul className="flex flex-col">
            {invites.map((invite) => (
              <InviteRow key={invite.id} leagueId={leagueId} invite={invite} />
            ))}
          </ul>
        </Card>
      )}

      <span className="type-body text-micro text-muted-foreground">
        {invites.length === 0
          ? "Nothing outstanding. An invitation is tied to the address it was sent to."
          : "An invitation is tied to the address it was sent to — the link only works for them."}
      </span>
    </section>
  );
}
