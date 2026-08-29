import { PageSkeleton, SkeletonLine } from "@/components/page-skeleton";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * THE BID SLATE WHILE THE WEEK BOARD READS.
 *
 * ── THE POSTERS ARE THE PAGE, SO THEIR BOXES ARE DRAWN AT 2:3 ─────────────
 * A poster grid that arrives after the page has settled shoves every input
 * down mid-typing. Reserving the aspect ratio is the entire point of a skeleton
 * here — more than on any other screen, because this is the one with a form in
 * it and a deadline attached to the form.
 *
 * FOUR CARDS, which is a typical wide weekend. The real slate varies and the
 * grid reflows either way; four fills the fold without inventing a fifth film.
 *
 * NO CLOCK, and this one matters: the countdown is the page's loudest element
 * and a grey bar where a deadline goes reads, for a second, as a deadline
 * nobody can make out. Its space is held; its face is not drawn.
 */
export default function BidLoading() {
  return (
    <PageSkeleton label="this week" className="w-full p-6 md:p-8">
      <div className="flex flex-col gap-2">
        <SkeletonLine w="w-32" h="h-2.5" />
        <SkeletonLine w="w-72" h="h-9" />
      </div>

      <Card
        variant="flat"
        className="flex-row flex-wrap items-center justify-between gap-6"
      >
        <div className="flex flex-col gap-1.5">
          <SkeletonLine w="w-16" h="h-2.5" />
          <SkeletonLine w="w-44" h="h-4" />
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <SkeletonLine w="w-20" h="h-2.5" />
          <SkeletonLine w="w-24" h="h-6" />
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <SkeletonLine w="w-16" h="h-7" />
          <SkeletonLine w="w-20" h="h-2.5" />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2.5">
            <Skeleton className="aspect-[2/3] w-full rounded-lg" />
            <SkeletonLine w="w-4/5" h="h-4" />
            <SkeletonLine w="w-full" h="h-9" className="rounded-3xl" />
          </div>
        ))}
      </div>
    </PageSkeleton>
  );
}
