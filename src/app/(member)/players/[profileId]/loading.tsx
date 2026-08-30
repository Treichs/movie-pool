import { PageSkeleton, SkeletonLine } from "@/components/page-skeleton";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A PROFILE WHILE ITS TWO RPCs RUN.
 *
 * THE INK SPINE IS DRAWN FOR REAL. It is the one part of this page that does
 * not depend on a read — every profile card has it — so sketching it in grey
 * would be pretending not to know something certain.
 *
 * SIX STAT CELLS, because six is the fixed number. The season rows are five,
 * which is a guess, and they are drawn without values for that reason.
 */
export default function PlayerLoading() {
  return (
    <PageSkeleton label="this player">
      <SkeletonLine w="w-52" h="h-3" />

      <Card variant="flat" className="flex-row gap-0 overflow-hidden p-0">
        <div aria-hidden className="w-2 shrink-0 bg-foreground" />
        <div className="flex grow items-center gap-6 p-6">
          <Skeleton className="size-24 shrink-0 rounded" />
          <div className="flex flex-col gap-3">
            <SkeletonLine w="w-56" h="h-8" />
            <SkeletonLine w="w-80" h="h-4" />
            <SkeletonLine w="w-64" h="h-3" />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Card
            key={i}
            variant="flat"
            size="sm"
            className="flex-row items-center justify-between gap-3"
          >
            <SkeletonLine w="w-24" h="h-2.5" />
            <SkeletonLine w="w-14" h="h-7" />
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <SkeletonLine w="w-44" h="h-6" />
        <Card variant="flat" className="gap-0 p-0">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`flex items-center justify-between gap-6 px-4 py-3.5 ${i < 4 ? "border-b" : ""}`}
            >
              <SkeletonLine w="w-28" h="h-3.5" />
              <div className="flex gap-8">
                <SkeletonLine w="w-16" h="h-3.5" />
                <SkeletonLine w="w-12" h="h-3.5" />
                <SkeletonLine w="w-10" h="h-3.5" />
              </div>
            </div>
          ))}
        </Card>
      </div>
    </PageSkeleton>
  );
}
