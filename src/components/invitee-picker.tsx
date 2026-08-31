"use client";

import { useRef, useState, useTransition } from "react";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  searchInvitableAction,
  type InvitableProfile,
} from "@/app/(member)/actions";

/**
 * INVITING SOMEONE — one field that takes a name OR an email.
 *
 * ── WHY ONE FIELD AND NOT TWO MODES ───────────────────────────────────────
 * The obvious design is a toggle: "invite by email" beside "find a player".
 * It is the wrong one, because it makes the commissioner classify the person
 * BEFORE they have typed anything, and the honest answer is usually "I do not
 * know whether they have an account." That is the app's question to answer.
 *
 * So the field takes either. Type a name and suggestions appear; type an
 * address and it is sent as typed, whether or not an account matches. Inviting
 * a stranger stays first-class — it is still the common case.
 *
 * ── IT NEVER SHOWS AN EMAIL IT DID NOT RECEIVE FROM THE COMMISSIONER ──────
 * `search_invitable_profiles` searches EVERY profile, including people the
 * viewer shares nothing with. It is safe because names match on substring and
 * emails only in full — you can find Chris by typing "chr", you cannot walk the
 * user table by typing "@gmail". Rendering an address next to a name would undo
 * exactly that, so a picked person is shown BY NAME and the invite is created
 * from their `profileId`, with the database looking the address up. Two people
 * with one name are told apart by their leagues, never by an email.
 *
 * ── `filter={null}` IS LOAD-BEARING ───────────────────────────────────────
 * Base UI filters `items` itself by default, which would take rows the database
 * already matched — including an exact-email match, whose display name contains
 * nothing the commissioner typed — and hide them. The server ran the search.
 *
 * ── ALREADY-MEMBERS ARE SHOWN, DISABLED, NOT FILTERED OUT ─────────────────
 * The RPC returns `alreadyMember` and this is what it is for. Hide those rows
 * and the commissioner types "Chris", sees nothing, and concludes Chris has no
 * account — when Chris is in the league already. Showing them greyed answers
 * the question actually being asked.
 */
export type Invitee =
  | { kind: "profile"; profileId: string; displayName: string }
  | { kind: "email"; email: string };

export function InviteePicker({
  id,
  leagueId,
  placeholder = "Name or email",
  disabled = false,
  onPick,
}: {
  id: string;
  /** Omitted in the new-league wizard — no league exists yet. */
  leagueId?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Fired for a picked account AND for typed free text, so the caller never
   *  has to ask which mode the commissioner was in. */
  onPick: (invitee: Invitee) => void;
}) {
  const [text, setText] = useState("");
  const [items, setItems] = useState<InvitableProfile[]>([]);
  const [pending, startTransition] = useTransition();
  const latest = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced AND order-checked. Two in-flight searches can return out of
  // order, and the older one landing last leaves the list showing results for
  // a prefix of what is on screen — the same guard the shell's palette carries.
  function onInput(next: string) {
    setText(next);
    if (timer.current) clearTimeout(timer.current);
    if (next.trim().length < 3) {
      setItems([]);
      return;
    }
    const ticket = ++latest.current;
    timer.current = setTimeout(() => {
      startTransition(async () => {
        const rows = await searchInvitableAction(next, leagueId);
        if (ticket === latest.current) setItems(rows);
      });
    }, 180);
  }

  function reset() {
    setText("");
    setItems([]);
    latest.current++;
  }

  /** Enter on free text — the escape hatch that keeps a stranger invitable. */
  function submitTyped() {
    const email = text.trim();
    if (email === "") return;
    onPick({ kind: "email", email });
    reset();
  }

  const short = text.trim().length > 0 && text.trim().length < 3;

  return (
    <Combobox
      items={items}
      filter={null}
      inputValue={text}
      onInputValueChange={onInput}
      onValueChange={(value) => {
        const picked = value as InvitableProfile | null;
        if (!picked || picked.alreadyMember) return;
        onPick({
          kind: "profile",
          profileId: picked.profileId,
          displayName: picked.displayName,
        });
        reset();
      }}
      itemToStringLabel={(item: InvitableProfile) => item.displayName}
    >
      <ComboboxInput
        id={id}
        disabled={disabled}
        placeholder={placeholder}
        showTrigger={false}
        onKeyDown={(e) => {
          // Enter takes the highlighted suggestion when there is one; Base UI
          // handles that. With none it must still send what was typed, or an
          // address with no matching account becomes un-invitable from here.
          if (e.key === "Enter" && !e.defaultPrevented) {
            e.preventDefault();
            submitTyped();
          }
        }}
      />
      <ComboboxContent>
        <ComboboxEmpty>
          {short
            ? "Keep typing — three characters or more."
            : pending
              ? "Searching…"
              : "Nobody with an account matches. Enter a full email to invite them anyway."}
        </ComboboxEmpty>
        <ComboboxList>
          {(item: InvitableProfile) => (
            <ComboboxItem
              key={item.profileId}
              value={item}
              disabled={item.alreadyMember}
            >
              <span className="truncate">{item.displayName}</span>
              {item.alreadyMember && (
                <span className="ml-auto pl-4 type-micro text-micro text-muted-foreground">
                  already in this league
                </span>
              )}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
