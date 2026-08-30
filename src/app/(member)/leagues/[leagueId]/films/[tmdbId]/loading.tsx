import { PageSkeleton, SkeletonLine } from "@/components/page-skeleton";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * THE LEAGUE RECORD WHILE IT READS.
 *
 * ── THE INK SPINE IS DRAWN FOR REAL ───────────────────────────────────────
 * Every score panel has it and it depends on no read, so sketching it in grey
 * would be pretending not to know something certain — the same call the player
 * profile's skeleton makes.
 *
 * ── THREE OWNER ROWS, NOT THE REAL COUNT ─────────────────────────────────
 * The season's tier count is one of the things being read. Three is the
 * rulebook default and a fixed guess, drawn without values for that reason.
 *
 * Full bleed, like the catalog page: the backdrop is the one element that
 * cannot stop short of the window edge.
 */
export default function LeagueFilmLoading() {
  return (
    <PageSkeleton label="this film's record" className="max-w-none gap-0 px-0 pt-0 pb-8">
      <div className="flex flex-col">
        <Skeleton className="h-44 w-full rounded-none sm:h-55" />
        <div className="mx-auto flex w-full max-w-measure-page gap-7 px-8">
          <div className="-mt-21 w-28 shrink-0 sm:w-39">
            <AspectRatio ratio={2 / 3}>
              <Skeleton className="size-full rounded" />
            </AspectRatio>
          </div>
          <div className="flex grow flex-col gap-3 pt-2">
            <SkeletonLine w="w-56" h="h-3" />
            <SkeletonLine w="w-64" h="h-9" />
            <SkeletonLine w="w-28" h="h-4" />
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-measure-page flex-col gap-3 px-8">
        <SkeletonLine w="w-52" h="h-7" />

        <Card
          variant="flat"
          className="flex-row items-center gap-11 border-l-4 border-l-foreground"
        >
          <div className="flex flex-col gap-1">
            <SkeletonLine w="w-16" h="h-2.5" />
            <SkeletonLine w="w-32" h="h-14" />
          </div>
          <div className="flex flex-col gap-1">
            <SkeletonLine w="w-24" h="h-2.5" />
            <SkeletonLine w="w-20" h="h-5" />
          </div>
        </Card>

        <Card variant="flat" className="gap-3 p-0">
          <div className="px-4 pt-4">
            <SkeletonLine w="w-48" h="h-2.5" />
          </div>
          <div className="flex flex-col border-t border-b">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-4 border-b px-4 py-2.5 last:border-b-0"
              >
                <div className="flex items-center gap-2.5">
                  <Skeleton className="size-6 rounded" />
                  <SkeletonLine w="w-32" h="h-3.5" />
                </div>
                <div className="flex gap-7">
                  <SkeletonLine w="w-8" h="h-3.5" />
                  <SkeletonLine w="w-12" h="h-3.5" />
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 pb-4">
            <SkeletonLine w="w-72" h="h-2.5" />
          </div>
        </Card>
      </div>
    </PageSkeleton>
  );
}
