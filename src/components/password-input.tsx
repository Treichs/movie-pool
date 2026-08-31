"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

/**
 * A masked field with a reveal, built on `ui/input-group` — which is the
 * registry's own answer to "a button inside a field" and the reason this is not
 * a `<div className="relative">` with an absolutely-positioned button over an
 * `Input`. The addon is a real slot, so the button never overlaps the text and
 * the field's focus ring stays one ring.
 *
 * THE TOGGLE IS `type="button"`. Inside a form, a button with no type submits
 * it — so revealing the password would post the form.
 *
 * Its label changes with state and it carries no `aria-pressed`: "Show
 * password" / "Hide password" already names the action the control will take,
 * which is what a screen reader needs. A toggle that announces both a name and
 * a pressed state says the same thing twice, in two directions.
 */
export function PasswordInput({
  id,
  name = "password",
  autoComplete = "current-password",
  required = true,
  placeholder,
  value,
  onChange,
  trailing,
}: {
  id: string;
  name?: string;
  autoComplete?: string;
  required?: boolean;
  placeholder?: string;
  /** Controlled only when BOTH are passed. `/reset-password` needs it: its
   *  strength meter and its match check both read what has been typed. */
  value?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /** An extra glyph in the same inline-end slot, before the reveal toggle —
   *  board 1.4's match check. Decorative: pass `aria-hidden` and say the same
   *  thing in text, because a tick inside a field is not a label. */
  trailing?: React.ReactNode;
}) {
  const [shown, setShown] = useState(false);

  return (
    <InputGroup>
      <InputGroupInput
        id={id}
        name={name}
        type={shown ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
      <InputGroupAddon align="inline-end">
        {trailing}
        <InputGroupButton
          type="button"
          size="icon-xs"
          variant="ghost"
          // `icon-xs` IS 24px BECAUSE THE FIELD IS 36px — the next size up
          // would not fit inside the group. `tap-target` grows the touch area
          // to 44px on a coarse pointer without touching the drawn control, so
          // the field keeps its height and a thumb still lands on the eye.
          className="tap-target"
          aria-label={shown ? "Hide password" : "Show password"}
          onClick={() => setShown((v) => !v)}
        >
          {shown ? <EyeOffIcon /> : <EyeIcon />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
