import { InfoIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * WHY YOU LANDED HERE — board 2.3's settled foreign-league path.
 *
 * `/leagues/[leagueId]/films/[tmdbId]` redirects here with `?from=league` when
 * RLS shows the reader nothing of that league's record. **A 404 would be a
 * lie**: the film exists and they may read it; only the league's play is out
 * of reach. So the page they asked for is replaced by the one they may have,
 * and it says so.
 *
 * ── THIS ONE IS AN `Alert`, AND THE CATALOG NOTICE IS NOT ────────────────
 * `Alert` hardcodes `role="alert"`, which announces on arrival. That is wrong
 * for standing explanatory copy and right here: the reader asked for one page
 * and got another, and being told is the point.
 */
export function ForeignLeagueNotice() {
  return (
    <Alert>
      <InfoIcon />
      <AlertDescription className="text-foreground">
        Showing the catalog page. You are not a member of that league, so its
        bids and scores are not visible to you.
      </AlertDescription>
    </Alert>
  );
}
