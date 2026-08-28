"use client";

import { useEffect, useState } from "react";

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
 * SERVER-RENDERED AS NULL, then filled on mount. A countdown has no correct
 * server value — the HTML would be stale before it reached the browser, and
 * rendering one guarantees a hydration mismatch.
 */
export function DeadlineCountdown({ target }: { target: string }) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const deadline = new Date(target).getTime();
    const tick = () => setLeft(deadline - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  if (left === null) {
    return <span className="type-numeral text-numeral-xl tabular-nums opacity-0">--:--</span>;
  }
  if (left <= 0) {
    return <span className="type-numeral text-numeral-xl tabular-nums">Closed</span>;
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
      className={cn("type-numeral text-numeral-xl tabular-nums", urgent && "text-primary")}
      aria-live="off"
    >
      {text}
    </span>
  );
}
