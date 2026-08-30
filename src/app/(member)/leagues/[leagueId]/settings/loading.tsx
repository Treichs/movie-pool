import { PageSkeleton, SkeletonLine } from "@/components/page-skeleton";
import { Card } from "@/components/ui/card";

/**
 * SETTINGS WHILE IT READS.
 *
 * NO "Commissioners only" BADGE and no role chips. Whether this page renders
 * at all depends on a role it has not read yet — a skeleton that implied
 * authority the reader may not have would be worse than one that waits, which
 * is the same call `/leagues/[leagueId]`'s skeleton makes.
 *
 * Four headings, because four is fixed: identity, house rules, members, and
 * invites. The rows under them are guesses and are drawn without values.
 */
export default function SettingsLoading() {
  return (
    <PageSkeleton label="the league settings" className="p-6 md:p-8">
      <SkeletonLine w="w-64" h="h-3" />

      <div className="flex flex-col gap-2">
        <SkeletonLine w="w-64" h="h-10" />
        <SkeletonLine w="w-96" h="h-4" />
      </div>

      <div className="flex max-w-measure-wide flex-col gap-10">
        <div className="flex flex-col gap-3">
          <SkeletonLine w="w-28" h="h-7" />
          <SkeletonLine w="w-24" h="h-3" />
          <SkeletonLine w="w-full" h="h-9" />
          <SkeletonLine w="w-72" h="h-3" />
        </div>

        <div className="flex flex-col gap-3">
          <SkeletonLine w="w-36" h="h-7" />
          <Card variant="flat" className="gap-0 p-0">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`flex items-center justify-between gap-4 px-4 py-3.5 ${i < 2 ? "border-b" : ""}`}
              >
                <div className="flex flex-col gap-1.5">
                  <SkeletonLine w="w-40" h="h-4" />
                  <SkeletonLine w="w-56" h="h-3" />
                </div>
                <SkeletonLine w="w-30" h="h-8" />
              </div>
            ))}
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <SkeletonLine w="w-44" h="h-7" />
          <Card variant="flat" className="gap-0 p-0">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`flex items-center justify-between gap-4 px-4 py-3 ${i < 3 ? "border-b" : ""}`}
              >
                <div className="flex items-center gap-2.5">
                  <SkeletonLine w="w-8" h="h-8" className="rounded" />
                  <div className="flex flex-col gap-1.5">
                    <SkeletonLine w="w-32" h="h-3.5" />
                    <SkeletonLine w="w-44" h="h-3" />
                  </div>
                </div>
                <SkeletonLine w="w-8" h="h-8" className="rounded" />
              </div>
            ))}
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <SkeletonLine w="w-20" h="h-7" />
          <SkeletonLine w="w-32" h="h-3" />
          <SkeletonLine w="w-80" h="h-9" />
        </div>
      </div>
    </PageSkeleton>
  );
}
