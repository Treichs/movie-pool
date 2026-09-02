import {
  PageSkeleton,
  SkeletonFigure,
  SkeletonLine,
  SkeletonPanel,
} from "@/components/page-skeleton";
import { Card } from "@/components/ui/card";

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
          under its ink rule, then the bankroll and the way in. */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-5">
          <div className="flex flex-col gap-1.5">
            <SkeletonLine w="w-24" h="h-2.5" />
            <SkeletonLine w="w-28" h="h-16" />
          </div>
          <SkeletonFigure />
          <SkeletonFigure />
          <SkeletonFigure />
        </div>
        <div className="flex flex-wrap gap-x-10 gap-y-5 border-t-2 border-foreground pt-4">
          <SkeletonFigure />
          <SkeletonFigure />
          <SkeletonFigure />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5 border-t pt-4">
          <div className="flex flex-wrap items-end gap-x-10 gap-y-5">
            <SkeletonFigure />
            <SkeletonFigure />
            <SkeletonFigure />
          </div>
          <SkeletonLine w="w-36" h="h-9" className="rounded-4xl" />
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-12">
        <Card
          variant="flat"
          className="gap-3 md:col-span-2 xl:col-span-12"
        >
          <SkeletonLine w="w-20" h="h-4" />
          <div className="flex flex-col gap-3 border-t pt-3">
            {Array.from({ length: 5 }, (_, i) => (
              <SkeletonLine key={i} w="w-full" h="h-8" />
            ))}
          </div>
        </Card>

        <div className="flex flex-col md:col-span-2 xl:col-span-8">
          <SkeletonPanel lines={4} />
        </div>
        <div className="flex flex-col md:col-span-1 xl:col-span-4">
          <SkeletonPanel lines={4} size="sm" />
        </div>
        <div className="flex flex-col md:col-span-1 xl:col-span-5">
          <SkeletonPanel lines={5} size="sm" />
        </div>
        <div className="flex flex-col md:col-span-2 xl:col-span-7">
          <SkeletonPanel lines={6} />
        </div>
      </div>
    </PageSkeleton>
  );
}
