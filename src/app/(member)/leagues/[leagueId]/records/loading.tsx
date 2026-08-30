import { PageSkeleton, SkeletonLine } from "@/components/page-skeleton";
import { Card } from "@/components/ui/card";

/**
 * THE RECORD BOOK WHILE IT IS WORKED OUT.
 *
 * SIX CARDS AT THE BOARD'S COUNT, not the composer's seven: the real number
 * depends on how much this league has played, and a skeleton that promised
 * seven and delivered four would be worse than one that guessed low. Three of
 * them carry the marquee border, which is the shelf's fixed shape.
 *
 * Five career rows, drawn without values for the same reason every other
 * skeleton in this app is: the count is not known yet, and a bar the width of
 * a name is a shape while a bar reading anything is a lie.
 */
export default function RecordsLoading() {
  return (
    <PageSkeleton label="the record book" className="p-6 md:p-8">
      <SkeletonLine w="w-64" h="h-3" />

      <div className="flex flex-col gap-2">
        <SkeletonLine w="w-56" h="h-10" />
        <SkeletonLine w="w-72" h="h-4" />
      </div>

      <div className="flex flex-col gap-3">
        <SkeletonLine w="w-48" h="h-7" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Card
              key={i}
              variant="flat"
              className={`gap-2.5 ${i < 3 ? "border-2 border-foreground" : ""}`}
            >
              <SkeletonLine w="w-28" h="h-2.5" />
              <SkeletonLine w="w-32" h="h-10" />
              <div className="flex items-center gap-2">
                <SkeletonLine w="w-6" h="h-6" className="rounded" />
                <SkeletonLine w="w-28" h="h-4" />
              </div>
              <SkeletonLine w="w-36" h="h-3" />
            </Card>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <SkeletonLine w="w-28" h="h-7" />
        <Card variant="flat" className="gap-0 p-0">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`flex items-center justify-between gap-6 px-4 py-3.5 ${i < 4 ? "border-b" : ""}`}
            >
              <div className="flex items-center gap-2.5">
                <SkeletonLine w="w-6" h="h-6" className="rounded" />
                <SkeletonLine w="w-32" h="h-3.5" />
              </div>
              <div className="flex gap-8">
                <SkeletonLine w="w-10" h="h-3.5" />
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
