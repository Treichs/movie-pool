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
}: {
  id: string;
  name?: string;
  autoComplete?: string;
  required?: boolean;
  placeholder?: string;
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
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label={shown ? "Hide password" : "Show password"}
          onClick={() => setShown((v) => !v)}
        >
          {shown ? <EyeOffIcon /> : <EyeIcon />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
