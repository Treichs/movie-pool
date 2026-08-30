import { PageSkeleton, SkeletonLine } from "@/components/page-skeleton";
import { Card } from "@/components/ui/card";

/**
 * PAYOUTS WHILE THEY READ.
 *
 * THE ACCENT SPINE IS DRAWN FOR REAL, because the reader's own result opens
 * this page whatever it says, and that panel's identity does not depend on a
 * read. Nothing inside it is filled: this is a page of money, and a grey bar
 * the width of "$40" in the box where a real amount is about to appear is the
 * one place a skeleton could be believed.
 *
 * NO COMMISSIONER BLOCK is sketched. Whether it appears depends on a role this
 * page has not read yet.
 */
export default function PayoutsLoading() {
  return (
    <PageSkeleton label="the payouts" className="p-6 md:p-8">
      <SkeletonLine w="w-80" h="h-3" />

      <div className="flex flex-col gap-2">
        <SkeletonLine w="w-72" h="h-10" />
        <SkeletonLine w="w-96" h="h-4" />
      </div>

      <Card
        variant="flat"
        className="flex-row flex-wrap items-center gap-11 border-l-4 border-l-primary p-7"
      >
        <div className="flex flex-col gap-1.5">
          <SkeletonLine w="w-24" h="h-2.5" />
          <SkeletonLine w="w-24" h="h-14" />
        </div>
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <SkeletonLine w="w-16" h="h-2.5" />
            <SkeletonLine w="w-24" h="h-8" />
          </div>
        ))}
      </Card>

      <div className="flex flex-col gap-3">
        <SkeletonLine w="w-24" h="h-7" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card
              key={i}
              variant="flat"
              className={`gap-2.5 ${i < 2 ? "border-2 border-foreground" : ""}`}
            >
              <SkeletonLine w="w-28" h="h-2.5" />
              <div className="flex items-center gap-2.5">
                <SkeletonLine w="w-7" h="h-7" className="rounded" />
                <SkeletonLine w="w-32" h="h-5" />
              </div>
              <SkeletonLine w="w-24" h="h-8" />
              <SkeletonLine w="w-36" h="h-3" />
            </Card>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <SkeletonLine w="w-32" h="h-7" />
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
                <SkeletonLine w="w-20" h="h-3.5" />
                <SkeletonLine w="w-40" h="h-3" />
                <SkeletonLine w="w-12" h="h-3.5" />
              </div>
            </div>
          ))}
        </Card>
      </div>
    </PageSkeleton>
  );
}
