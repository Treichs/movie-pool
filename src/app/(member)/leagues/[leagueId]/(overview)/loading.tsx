import { REGISTER } from "@/components/dashboard";
import {
  PageSkeleton,
  SkeletonFigure,
  SkeletonLine,
  SkeletonPanel,
} from "@/components/page-skeleton";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * `/leagues/[leagueId]` WHILE `getLeagueHome` READS.
 *
 * THE SEASON STRIP IS DRAWN AT ITS REAL HEIGHT, because it is the tallest thing
 * above the fold and the one whose arrival would otherwise shove the roster
 * down the page.
 *
 * NO "You commission" BADGE and no queue. Both depend on a role this page has
 * not read yet, and a skeleton that implies authority the reader may not have
 * is worse than one that waits.
 */
export default function LeagueLoading() {
  return (
    <PageSkeleton label="this league">
      {/* THE SKELETON CITES THE PAGE'S OWN RHYTHM. `PageSkeleton` spaces its
          bands at 24px for every route; this page moved to 40px between bands
          and 16px inside its head, so without this wrapper the whole column
          shifted up as the read landed. */}
      <div className="flex flex-col gap-10">
        <div className="flex flex-col gap-4">
          <SkeletonLine w="w-52" h="h-3" />

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col gap-2">
              <SkeletonLine w="w-64" h="h-8" />
              <SkeletonLine w="w-48" h="h-3.5" />
            </div>
            <SkeletonLine w="w-36" h="h-9" className="rounded-4xl" />
          </div>
        </div>

        <Card
          variant="flat"
          className="flex-row flex-wrap items-center justify-between gap-6"
        >
          <div className="flex min-w-0 grow flex-col gap-2">
            <SkeletonLine w="w-40" h="h-5" />
            <SkeletonLine w="w-56" h="h-3.5" />
          </div>
          <SkeletonLine w="w-40" h="h-9" className="rounded-4xl" />
        </Card>

        {/* The frame, span for span, on the command band's own tracks:
              YOUR CAREER .............................. 12
              MEMBERS ............ 7 │ PAST SEASONS .... 5
              THE RECORD BOOK .......................... 12 */}
        <div className="mt-4 grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-12">
          <Card variant="flat" className="gap-4 md:col-span-2 xl:col-span-12">
            <div className={REGISTER}>
              <div className="flex flex-col gap-1.5">
                <SkeletonLine w="w-24" h="h-2.5" />
                <SkeletonLine w="w-28" h="h-16" />
              </div>
              <SkeletonFigure />
              <SkeletonFigure />
              <SkeletonFigure />
            </div>
            <div className={cn(REGISTER, "border-t-2 border-foreground pt-4")}>
              <SkeletonFigure />
              <SkeletonFigure />
              <SkeletonFigure />
            </div>
          </Card>

          <div className="flex flex-col md:col-span-1 xl:col-span-7">
            <SkeletonPanel lines={6} />
          </div>
          <div className="flex flex-col md:col-span-1 xl:col-span-5">
            <SkeletonPanel lines={6} size="sm" />
          </div>

          <div className="flex flex-col md:col-span-2 xl:col-span-12">
            <SkeletonPanel lines={4} />
          </div>
        </div>
      </div>
    </PageSkeleton>
  );
}
