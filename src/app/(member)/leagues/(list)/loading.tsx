import {
  PageSkeleton,
  SkeletonLine,
  SkeletonPanel,
  SkeletonRow,
} from "@/components/page-skeleton";

/**
 * `/leagues` WHILE `getLeaguesHome` READS.
 *
 * IT LIVES IN A `(list)` ROUTE GROUP, AND THAT IS THE WHOLE POINT. A
 * `loading.tsx` wraps its own page AND every child segment below it, so at
 * `leagues/` this skeleton also fired for `/leagues/[leagueId]` — two `<main>`
 * elements at once, the outer one announcing "Loading your leagues" over a
 * league. The group scopes it to this page without touching the URL.
 *
 * THREE ROWS, NOT THE REAL COUNT. Nobody knows it yet, and a list that appears
 * at three and settles at one moves more than a list that appears empty.
 * ADR-094 records the real usage as one main league, occasionally a second.
 */
export default function LeaguesLoading() {
  return (
    <PageSkeleton label="your leagues">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <SkeletonLine w="w-44" h="h-2.5" />
          <SkeletonLine w="w-56" h="h-8" />
        </div>
        <SkeletonLine w="w-32" h="h-9" className="rounded-4xl" />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="flex flex-col gap-3">
          <SkeletonLine w="w-36" h="h-6" />
          <div className="flex flex-col gap-2.5">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        </section>
        <div className="flex flex-col gap-4">
          <SkeletonPanel size="sm" lines={3} />
          <SkeletonPanel size="sm" lines={2} />
        </div>
      </div>
    </PageSkeleton>
  );
}
