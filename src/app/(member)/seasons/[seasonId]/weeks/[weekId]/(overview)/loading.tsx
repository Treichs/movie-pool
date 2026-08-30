import { PageSkeleton, SkeletonLine } from "@/components/page-skeleton";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * THE WEEK BOARD WHILE IT READS.
 *
 * ── SCOPED BY A ROUTE GROUP, WHICH IS NOT OPTIONAL HERE ─────────────────
 * `loading.tsx` covers its own segment AND every child, and this segment's
 * child is `/bid`. Left at the segment root, this skeleton would announce
 * "Loading this week" over the bidding form. `(overview)` is the same fix
 * `/leagues` and `/seasons/[seasonId]` already carry.
 *
 * ── THE INK SPINE IS DRAWN FOR REAL ─────────────────────────────────────
 * Every settled week has one and it depends on no read. Three film rows is a
 * fixed guess, drawn without values for that reason.
 */
export default function WeekLoading() {
  return (
    <PageSkeleton label="this week" className="p-6 md:p-8">
      <div className="flex flex-col gap-2">
        <SkeletonLine w="w-72" h="h-3" />
        <SkeletonLine w="w-44" h="h-10" />
        <SkeletonLine w="w-96" h="h-4" />
      </div>

      <Card
        variant="flat"
        className="flex-row flex-wrap items-center gap-10 border-l-4 border-l-foreground"
      >
        <div className="flex flex-col gap-1">
          <SkeletonLine w="w-20" h="h-2.5" />
          <SkeletonLine w="w-36" h="h-14" />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-1">
            <SkeletonLine w="w-24" h="h-2.5" />
            <SkeletonLine w="w-16" h="h-7" />
          </div>
        ))}
      </Card>

      <div className="flex flex-col gap-3">
        <SkeletonLine w="w-32" h="h-7" />
        {[0, 1, 2].map((i) => (
          <Card key={i} variant="flat" className="flex-row gap-5 p-0">
            <div className="w-24 shrink-0 sm:w-27">
              <AspectRatio ratio={2 / 3}>
                <Skeleton className="size-full rounded-none" />
              </AspectRatio>
            </div>
            <div className="flex grow flex-col justify-between py-4 pe-4">
              <div className="flex items-start justify-between gap-6">
                <SkeletonLine w="w-48" h="h-5" />
                <div className="flex gap-7">
                  <SkeletonLine w="w-16" h="h-4" />
                  <SkeletonLine w="w-16" h="h-4" />
                  <SkeletonLine w="w-14" h="h-5" />
                </div>
              </div>
              <div className="flex gap-2">
                <SkeletonLine w="w-24" h="h-5" />
                <SkeletonLine w="w-24" h="h-5" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </PageSkeleton>
  );
}
