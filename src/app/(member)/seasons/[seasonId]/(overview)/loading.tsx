import {
  PageSkeleton,
  SkeletonFigure,
  SkeletonLine,
  SkeletonPanel,
} from "@/components/page-skeleton";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { REGISTER } from "./_components/season-hero";

/**
 * `/seasons/[seasonId]` WHILE `getSeasonHome` READS — and this is the page the
 * whole loading pass exists for. It awaits five queries (hub, leaderboard,
 * league, the season list, and the overdue weeks for a commissioner), so it is
 * the longest wait in the app and the one someone arrives at most often.
 *
 * IT LIVES IN AN `(overview)` ROUTE GROUP. A `loading.tsx` wraps its own page
 * AND every child segment below it, so at `[seasonId]/` this skeleton also
 * fired for the bid slate underneath — two `<main>` elements at once, the outer
 * one announcing "Loading this season" over a week. The group scopes it to this
 * page without touching the URL.
 *
 * ── IT DRAWS THE HERO ON PAPER AND THE GRID IN PANELS ─────────────────────
 * The tabs it used to draw are gone. What replaced them is a hero sitting
 * directly on the page under two rules and a grid of unequal panels, and the
 * skeleton mirrors both — including the spans, so the columns do not jump when
 * the data lands. The rules are drawn because they are certain: two registers
 * always exist, whatever numbers end up in them.
 *
 * NO QUEUE STRIP, for the same reason as the league: it belongs to a
 * commissioner and the role has not been read yet.
 */
export default function SeasonLoading() {
  return (
    <PageSkeleton label="this season">
      <SkeletonLine w="w-64" h="h-3" />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <SkeletonLine w="w-56" h="h-8" />
          <SkeletonLine w="w-28" h="h-8" className="rounded-3xl" />
        </div>
        <SkeletonLine w="w-24" h="h-5" className="rounded-3xl" />
      </div>

      {/* The hero: rank, the movement and two figures, then the money register
          under its ink rule, then the bankroll and the way in.

          THE TRACKS ARE IMPORTED, NOT COPIED. `REGISTER` is the hero's own
          column definition, and a skeleton that restates it in its own words is
          a skeleton that will drift out of alignment the first time the hero is
          retuned — which is exactly the jump this file exists to prevent. */}
      <div className="flex flex-col gap-4">
        <div className={REGISTER}>
          <div className="flex flex-col gap-1.5">
            <SkeletonLine w="w-24" h="h-2.5" />
            <SkeletonLine w="w-28" h="h-16" />
          </div>
          <SkeletonFigure />
          <SkeletonFigure />
          <SkeletonFigure />
        </div>
        <div className={cn(REGISTER, "border-t-2 border-foreground pt-4")}>
          <SkeletonFigure />
          <SkeletonFigure />
          <SkeletonFigure />
        </div>
        <div className={cn(REGISTER, "border-t pt-4")}>
          <SkeletonFigure />
          <SkeletonFigure />
          <SkeletonFigure />
          <SkeletonLine
            w="w-36"
            h="h-9"
            className="col-span-2 rounded-4xl lg:col-span-1"
          />
        </div>
      </div>

      {/* The grid, span for span:
            WEEK NN IN BRIEF ......................... 12
            FILMS YOU OWN ...... 7 │ THE SEASON'S PICKS 5
            STANDINGS .......... 7 │ HEAD TO HEAD ..... 5
            WEEKS .................................... 12 */}
      <div className="mt-4 grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-12">
        <div className="flex flex-col md:col-span-2 xl:col-span-12">
          <SkeletonPanel lines={2} />
        </div>

        <div className="flex flex-col md:col-span-1 xl:col-span-7">
          <SkeletonPanel lines={7} />
        </div>
        <div className="flex flex-col md:col-span-1 xl:col-span-5">
          <SkeletonPanel lines={7} size="sm" />
        </div>

        <div className="flex flex-col md:col-span-2 xl:col-span-7">
          <SkeletonPanel lines={7} />
        </div>
        <div className="flex flex-col md:col-span-2 xl:col-span-5">
          <SkeletonPanel lines={7} size="sm" />
        </div>

        <Card variant="flat" className="gap-3 md:col-span-2 xl:col-span-12">
          <SkeletonLine w="w-20" h="h-4" />
          <div className="flex flex-col gap-3 border-t pt-3">
            {Array.from({ length: 8 }, (_, i) => (
              <SkeletonLine key={i} w="w-full" h="h-8" />
            ))}
          </div>
        </Card>
      </div>
    </PageSkeleton>
  );
}
