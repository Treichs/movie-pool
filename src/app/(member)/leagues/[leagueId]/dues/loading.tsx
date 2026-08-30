import { PageSkeleton, SkeletonLine } from "@/components/page-skeleton";
import { Card } from "@/components/ui/card";

/**
 * THE DUES LEDGER WHILE IT READS.
 *
 * NO NUMBER IS SKETCHED AT A PLAUSIBLE WIDTH. Every skeleton in this app
 * refuses to stand in for a value, and on a page about money the rule has
 * teeth: a grey bar the width of "−$40" in the row where a real debt is about
 * to appear is the one place a reader might believe it.
 *
 * The ink spine on the balance panel is drawn for real — it is the one thing
 * here that does not depend on a read.
 */
export default function DuesLoading() {
  return (
    <PageSkeleton label="the dues ledger" className="p-6 md:p-8">
      <SkeletonLine w="w-64" h="h-3" />

      <div className="flex flex-col gap-2">
        <SkeletonLine w="w-52" h="h-10" />
        <SkeletonLine w="w-96" h="h-4" />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <SkeletonLine w="w-48" h="h-7" />
            <Card variant="flat" className="gap-0 p-0">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between gap-4 px-3 py-2.5 ${i < 4 ? "border-b" : ""}`}
                >
                  <div className="flex items-center gap-2.5">
                    <SkeletonLine w="w-6.5" h="h-6.5" className="rounded" />
                    <SkeletonLine w="w-32" h="h-3.5" />
                  </div>
                  <SkeletonLine w="w-24" h="h-5" />
                </div>
              ))}
            </Card>
          </div>

          <div className="flex flex-col gap-3">
            <SkeletonLine w="w-56" h="h-7" />
            <Card variant="flat" className="gap-0 p-0">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between gap-4 px-4 py-3.5 ${i < 2 ? "border-b" : ""}`}
                >
                  <SkeletonLine w="w-36" h="h-3.5" />
                  <div className="flex gap-6">
                    <SkeletonLine w="w-16" h="h-3.5" />
                    <SkeletonLine w="w-14" h="h-3.5" />
                  </div>
                </div>
              ))}
            </Card>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Card
            variant="flat"
            className="gap-1.5 border-l-4 border-l-foreground"
          >
            <SkeletonLine w="w-28" h="h-2.5" />
            <SkeletonLine w="w-28" h="h-14" />
            <SkeletonLine w="w-44" h="h-4" />
          </Card>
          <Card variant="flat" size="sm" className="gap-3">
            <SkeletonLine w="w-24" h="h-2.5" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <SkeletonLine w="w-36" h="h-3.5" />
                <SkeletonLine w="w-12" h="h-4" />
              </div>
            ))}
          </Card>
        </div>
      </div>
    </PageSkeleton>
  );
}
