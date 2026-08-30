import {
  PageSkeleton,
  SkeletonLine,
  SkeletonPanel,
  SkeletonRow,
} from "@/components/page-skeleton";
import { Card } from "@/components/ui/card";

/**
 * `/leagues/[leagueId]` WHILE `getLeagueHome` READS.
 *
 * THE SEASON STRIP IS DRAWN AT ITS REAL HEIGHT, because it is the tallest thing
 * above the fold and the one whose arrival would otherwise shove the roster
 * down the page.
 *
 * NO "You commission" BADGE and no queue. Both depend on a role this page has
 * not read yet, and a skeleton that implies authority the reader may not have
 * is worse than one that waits.
 */
export default function LeagueLoading() {
  return (
    <PageSkeleton label="this league">
      <SkeletonLine w="w-52" h="h-3" />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <SkeletonLine w="w-64" h="h-8" />
          <SkeletonLine w="w-48" h="h-3.5" />
        </div>
        <SkeletonLine w="w-36" h="h-9" className="rounded-4xl" />
      </div>

      <Card
        variant="flat"
        className="flex-row flex-wrap items-center justify-between gap-6"
      >
        <div className="flex min-w-0 grow flex-col gap-2">
          <SkeletonLine w="w-40" h="h-5" />
          <SkeletonLine w="w-56" h="h-3.5" />
        </div>
        <SkeletonLine w="w-40" h="h-9" className="rounded-4xl" />
      </Card>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <SkeletonPanel lines={2} />
          <section className="flex flex-col gap-3">
            <SkeletonLine w="w-28" h="h-6" />
            <div className="flex flex-col gap-2.5">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          </section>
        </div>
        <div className="flex flex-col gap-4">
          <SkeletonPanel size="sm" lines={3} />
          <SkeletonPanel size="sm" lines={4} />
        </div>
      </div>
    </PageSkeleton>
  );
}
