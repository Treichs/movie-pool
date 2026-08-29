"use client";

import { useEffect, useState } from "react";

/**
 * THE GREETING, and the reason it is a client component is a timezone.
 *
 * "Evening, Dana" and "Wednesday, 19 November" are both facts about the
 * VIEWER's clock, and a server has no access to it — Vercel's runs in UTC, so
 * a server-rendered greeting would tell a player in California it was evening
 * over lunch. The bid page's countdown records the same rule: a time-dependent
 * value has no correct server render, and producing one guarantees a hydration
 * mismatch on top of being wrong.
 *
 * So the NAME renders on the server and the two time-dependent parts fill in on
 * mount. What swaps is one word and one line; what never flickers is the
 * heading being there at all.
 */
function salutation(hour: number): string {
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}

export function Greeting({ name }: { name: string }) {
  const [now, setNow] = useState<Date | null>(null);
  // The same shape the bid page's countdown uses, and for two reasons: the
  // lint rule refuses a bare `setState` as an effect body, and the date does
  // roll over — a tab left open past midnight should not still say Tuesday.
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="type-eyebrow text-eyebrow text-muted-foreground">
        {now
          ? now.toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })
          : " "}
      </span>
      <h1>
        {now ? salutation(now.getHours()) : "Hello"}, {name}
      </h1>
    </div>
  );
}
