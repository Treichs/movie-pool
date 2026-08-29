"use client";

import { useEffect, useState } from "react";

/**
 * THE CLIENT'S CLOCK — null on the server, a ticking `Date` after mount.
 *
 * ── WHY NULL FIRST, AND WHY IT IS NOT A BUG ───────────────────────────────
 * Anything derived from "now" has no correct server value: the HTML is stale
 * before it reaches the browser, and rendering a time guarantees a hydration
 * mismatch. So the server renders the null branch and the client fills it in.
 * Every caller therefore has to say what it shows while `now` is null, which is
 * the point — a blank, a placeholder, or nothing at all is a design decision
 * per surface, not something a hook should pick.
 *
 * ── THE MECHANISM IS SHARED; THE POLICY IS NOT ────────────────────────────
 * Four components used to carry their own copy of this effect, and their
 * intervals differ ON PURPOSE — a per-second clock is right on a bid slate and
 * wrong on a list of leagues, where it is motion with no decision attached. So
 * the interval is the caller's, and so is every threshold and every format.
 * What is shared is only the "tick immediately, then on an interval, and clean
 * up" wiring that all four had written out identically.
 */
export function useNow(intervalMs: number): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
