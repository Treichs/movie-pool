import {
  PageSkeleton,
  SkeletonFigure,
  SkeletonLine,
  SkeletonRow,
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
 * THE TABS ARE DRAWN, THE PANEL BELOW THEM IS NOT SPLIT. Which tab lands is
 * decided by `?tab=`, which the server knows — but drawing three triggers and
 * then a generic body is honest: the triggers are certain, the contents are
 * not.
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

      <Card
        variant="flat"
        className="flex-row flex-wrap items-end justify-between gap-6"
      >
        <div className="flex flex-wrap items-end gap-8">
          <div className="flex flex-col gap-1.5">
            <SkeletonLine w="w-24" h="h-2.5" />
            <SkeletonLine w="w-20" h="h-9" />
          </div>
          <SkeletonFigure />
          <SkeletonFigure />
          <SkeletonFigure />
        </div>
        <SkeletonLine w="w-36" h="h-9" className="rounded-4xl" />
      </Card>

      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <SkeletonLine w="w-20" h="h-8" className="rounded-3xl" />
          <SkeletonLine w="w-28" h="h-8" className="rounded-3xl" />
          <SkeletonLine w="w-14" h="h-8" className="rounded-3xl" />
        </div>
        <div className="flex flex-col gap-2.5">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </div>
    </PageSkeleton>
  );
}
