import { PageSkeleton, SkeletonLine } from "@/components/page-skeleton";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * `/account` WHILE THE PROFILE AND THE SESSION ARE READ.
 *
 * NO EMAIL ADDRESS AND NO PROVIDER ROW IS SKETCHED. A grey bar where "also
 * linked to Google" goes is a claim about how this account signs in, made
 * before anything has been read. The rows are drawn at their heights; what they
 * say is left blank.
 *
 * ── IT CITES THE PAGE'S OWN TRACKS, AND THAT IS A RULE ────────────────────
 * The grid below is the same `[13rem_minmax(0,45rem)]` the page uses, because a
 * skeleton on different tracks reflows the whole screen at the moment the data
 * lands — the one moment a page must not move. Edit one, edit both.
 *
 * ── THE EMAIL SECTION IS TWO ROWS, NOT FOUR (CORRECTED 2026-09-02) ────────
 * `NOTIFY_KINDS` was cut from four to two on 2026-08-30 and this file was not
 * followed through, so every load of this page flashed four rows and settled to
 * two. The count is the one thing a skeleton must get right: it is the only
 * claim it makes.
 */
export default function AccountLoading() {
  return (
    <PageSkeleton label="your account">
      <SkeletonLine w="w-40" h="h-3" />
      <div className="flex flex-col gap-2">
        <SkeletonLine w="w-44" h="h-8" />
        <SkeletonLine w="w-72" h="h-4" />
      </div>

      <div className="flex flex-col gap-10 lg:grid lg:grid-cols-[13rem_minmax(0,45rem)] lg:items-start lg:gap-x-12">
        {/* THE RAIL. Identity, three section links, the rule and the button —
            drawn at their heights and empty of their words, like everything
            else here. Hidden below `lg` because the rail itself is. */}
        <div className="hidden lg:flex lg:flex-col lg:gap-5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 shrink-0 rounded-full" />
            <div className="flex grow flex-col gap-1.5">
              <SkeletonLine w="w-24" h="h-4" />
              <SkeletonLine w="w-32" h="h-3" />
            </div>
          </div>
          <div className="flex flex-col gap-3 pl-3">
            <SkeletonLine w="w-16" h="h-3.5" />
            <SkeletonLine w="w-14" h="h-3.5" />
            <SkeletonLine w="w-12" h="h-3.5" />
          </div>
          <div className="border-t pt-5">
            <SkeletonLine w="w-full" h="h-9" className="rounded-4xl" />
          </div>
        </div>

        <div className="flex max-w-180 flex-col gap-10">
          <div className="flex flex-col gap-3.5">
            <SkeletonLine w="w-24" h="h-6" />
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <SkeletonLine w="w-28" h="h-3" />
                <SkeletonLine w="w-full" h="h-9" className="rounded-3xl" />
              </div>
              <div className="flex flex-col gap-2">
                <SkeletonLine w="w-12" h="h-3" />
                <SkeletonLine w="w-full" h="h-20" className="rounded-2xl" />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3.5">
            <SkeletonLine w="w-24" h="h-6" />
            <Card variant="flat" size="sm" className="flex-row items-center justify-between">
              <div className="flex flex-col gap-2">
                <SkeletonLine w="w-52" h="h-4" />
                <SkeletonLine w="w-36" h="h-3" />
              </div>
              <SkeletonLine w="w-32" h="h-9" className="rounded-4xl" />
            </Card>
            <Card variant="flat" size="sm" className="flex-row items-center justify-between">
              <div className="flex flex-col gap-2">
                <SkeletonLine w="w-24" h="h-4" />
                <SkeletonLine w="w-56" h="h-3" />
              </div>
              <SkeletonLine w="w-36" h="h-9" className="rounded-4xl" />
            </Card>
          </div>

          <div className="flex flex-col gap-3.5">
            <SkeletonLine w="w-16" h="h-6" />
            <Card variant="flat" className="gap-0 p-0">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between gap-6 px-4 py-3.5 ${i < 1 ? "border-b" : ""}`}
                >
                  <div className="flex flex-col gap-1.5">
                    <SkeletonLine w="w-40" h="h-3.5" />
                    <SkeletonLine w="w-56" h="h-2.5" />
                  </div>
                  <SkeletonLine w="w-11" h="h-5" className="rounded-full" />
                </div>
              ))}
            </Card>
          </div>
        </div>
      </div>
    </PageSkeleton>
  );
}
