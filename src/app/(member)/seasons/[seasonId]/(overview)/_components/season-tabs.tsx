import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = ["weeks", "leaderboard", "you"];

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
 * ── UNCONTROLLED, AND THEREFORE NOT A CLIENT COMPONENT ────────────────────
 * This held a `useState` mirroring what `Tabs` already tracks, which made the
 * whole file `"use client"` for a value nothing else read. `defaultValue` says
 * the same thing — seed it, then leave it alone — and lets the primitive own
 * its own state. The panels are server-rendered and handed in either way.
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
  return (
    <Tabs defaultValue={TABS.includes(initial) ? initial : "weeks"}>
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
