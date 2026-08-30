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
 */
export default function AccountLoading() {
  return (
    <PageSkeleton label="your account">
      <SkeletonLine w="w-40" h="h-3" />
      <div className="flex flex-col gap-2">
        <SkeletonLine w="w-44" h="h-8" />
        <SkeletonLine w="w-72" h="h-4" />
      </div>

      <div className="flex max-w-180 flex-col gap-10">
        <div className="flex flex-col gap-3.5">
          <SkeletonLine w="w-24" h="h-6" />
          <div className="flex gap-5">
            <Skeleton className="size-20 shrink-0 rounded-full" />
            <div className="flex grow flex-col gap-5">
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
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`flex items-center justify-between gap-6 px-4 py-3.5 ${i < 3 ? "border-b" : ""}`}
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
    </PageSkeleton>
  );
}
