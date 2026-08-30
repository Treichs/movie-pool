"use client";

import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { format, isValid, parseISO } from "date-fns";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * THE ONE DATE PICKER. Every date a person chooses in this app comes through
 * here — `<input type="date">` is not used anywhere.
 *
 * ── WHY NOT THE NATIVE INPUT ──────────────────────────────────────────────
 * It renders as a different control in every browser, cannot be told that only
 * Fridays are choosable, and gives no way to say why a day is unavailable. The
 * season fieldset needs all three.
 *
 * ── STRING IN, STRING OUT — AND THAT IS THE BUG THIS AVOIDS ───────────────
 * The value is `yyyy-mm-dd`, the shape the form fields and the RPCs already
 * use, so no caller has to hold a `Date`. Inside, `parseISO` reads that as
 * LOCAL midnight and `format` writes local components back, so the day the
 * calendar highlights is the day that was stored. `new Date("2026-01-02")` is
 * midnight UTC and would show 1 January to anyone west of Greenwich — the same
 * trap `src/lib/format.ts` sidesteps with a UTC-noon parse. Two different
 * fixes because they are two different jobs: that one renders a date the
 * server chose, this one round-trips a date the user is choosing.
 *
 * ── date-fns DOES THE PARSING, NOT `Intl` ────────────────────────────────
 * `Intl` formats; it does not parse, and it has no local-date-only mode. The
 * trigger carries the YEAR, which `formatDate` deliberately omits — a season
 * runs about twenty weeks and routinely crosses New Year, so "Fri, Jan 2" on a
 * control the user is committing to is a question, not an answer.
 */
export function DatePicker({
  id,
  value,
  onChange,
  disabledDays,
  placeholder = "Pick a date",
  className,
}: {
  id?: string;
  /** `yyyy-mm-dd`, or "" for nothing chosen yet. */
  value: string;
  onChange: (value: string) => void;
  /** Days that cannot be chosen — a react-day-picker matcher. The RULE lives
   *  with the caller that owns it, so this control stays a plain date field. */
  disabledDays?: React.ComponentProps<typeof Calendar>["disabled"];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const parsed = value ? parseISO(value) : null;
  const selected = parsed && isValid(parsed) ? parsed : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            variant="outline"
            // Matched to the Select trigger, which is this app's field-shaped
            // button: --edge at 3:1 draws a control boundary, --border only
            // draws panels, and the outline variant ships with the latter.
            className={cn(
              "h-9 w-full justify-between rounded-3xl border-edge bg-input/50 px-3 font-normal",
              !selected && "text-muted-foreground",
              className
            )}
          />
        }
      >
        {selected ? format(selected, "EEE, MMM d, yyyy") : placeholder}
        <CalendarIcon className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          // Opens on the month already chosen, so a date five months out is
          // there rather than five presses of the arrow away.
          defaultMonth={selected}
          disabled={disabledDays}
          onSelect={(date) => {
            if (!date) return;
            onChange(format(date, "yyyy-MM-dd"));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
