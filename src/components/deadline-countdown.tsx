"use client";

import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";

/**
 * THE CLOCK. The one place besides an owned film where this app spends its
 * accent.
 *
 * VERMILION IS LEGAL HERE AND NOWHERE SMALLER. `--primary` is 3.42:1, which
 * fails AA as body text and PASSES as large text (>= 3:1). This renders at
 * `--text-numeral-xl` (4.5rem), so the colour and the size are one decision:
 * shrink the figure and the token stops being accessible, which is exactly why
 * the design system reserves it for the hero numeral on a surface.
 *
 * SERVER-RENDERED AS NULL, then filled on mount — see `useNow`, which owns
 * that wiring for the four surfaces that need a clock. This one ticks every
 * second because it is the only place where the seconds themselves matter.
 */
export function DeadlineCountdown({
  target,
  size = "hero",
}: {
  target: string;
  /** `hero` is the bid slate's 4.5rem figure; `inline` is the season strip's,
   *  beside three other numbers. The THRESHOLD does not change with the size —
   *  it moved here on 2026-08-29 when the season page needed a countdown and
   *  nearly got a second one with its own idea of urgent. */
  size?: "hero" | "inline";
}) {
  const scale = size === "hero" ? "text-numeral-xl" : "text-h3";
  const now = useNow(1000);
  const left = now === null ? null : new Date(target).getTime() - now.getTime();

  if (left === null) {
    return <span className={cn("type-numeral tabular-nums opacity-0", scale)}>--:--</span>;
  }
  if (left <= 0) {
    return <span className={cn("type-numeral tabular-nums", scale)}>Closed</span>;
  }

  const totalMin = Math.floor(left / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  const secs = Math.floor((left % 60000) / 1000);

  // THREE HOURS is the final-hour threshold — not one, and not a day. Under it
  // the clock takes the accent, because that is the window in which a player
  // who has not bid still can and needs telling.
  const urgent = left < 3 * 60 * 60 * 1000;

  const text =
    days > 0
      ? `${days}d ${hours}h`
      : hours > 0
        ? `${hours}:${String(mins).padStart(2, "0")}`
        : `${mins}:${String(secs).padStart(2, "0")}`;

  return (
    <span
      className={cn("type-numeral tabular-nums", scale, urgent && "text-primary")}
      aria-live="off"
    >
      {text}
    </span>
  );
}
