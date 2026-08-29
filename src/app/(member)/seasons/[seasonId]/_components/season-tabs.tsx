"use client";

import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * THE THREE TABS — Weeks, Leaderboard, You. **Weeks leads**, because it is the
 * only one with a deadline in it.
 *
 * ── THE URL SEEDS THE TAB; SWITCHING DOES NOT WRITE TO IT ─────────────────
 * `?tab=leaderboard` must land on Leaderboard: the Monday-scores email links it
 * (`api/cron/notify/route.ts`). Switching afterwards writes nothing back — a
 * tab is a view of one page, not a place, and pushing history entries for it
 * would turn the browser's Back button into a tab cycler.
 *
 * The panels are all rendered on the server and handed in; this component owns
 * only which one is visible.
 */
export function SeasonTabs({
  initial,
  weeks,
  leaderboard,
  you,
}: {
  initial: string;
  weeks: React.ReactNode;
  leaderboard: React.ReactNode;
  you: React.ReactNode;
}) {
  const [tab, setTab] = useState(
    ["weeks", "leaderboard", "you"].includes(initial) ? initial : "weeks"
  );

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v ?? "weeks")}>
      <TabsList>
        <TabsTrigger value="weeks">Weeks</TabsTrigger>
        <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
        <TabsTrigger value="you">You</TabsTrigger>
      </TabsList>
      <TabsContent value="weeks">{weeks}</TabsContent>
      <TabsContent value="leaderboard">{leaderboard}</TabsContent>
      <TabsContent value="you">{you}</TabsContent>
    </Tabs>
  );
}
