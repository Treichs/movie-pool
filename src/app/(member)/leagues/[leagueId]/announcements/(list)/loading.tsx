import { PageSkeleton, SkeletonLine } from "@/components/page-skeleton";
import { Card } from "@/components/ui/card";

/**
 * THE ANNOUNCEMENTS LIST WHILE IT READS.
 *
 * ── SCOPED BY `(list)`, AND NOT OPTIONALLY ──────────────────────────────
 * `loading.tsx` covers its own segment AND every child, and this segment is
 * about to have two: `[announcementId]` and `new`. Left at the root it would
 * announce "Loading the announcements" over a post and over a compose form.
 * Same fix `/leagues` and `/seasons/[seasonId]` already carry.
 *
 * ── NO "WRITE ONE" BUTTON IS SKETCHED ───────────────────────────────────
 * Whether it appears depends on a role this page has not read yet, and a
 * skeleton that implies authority the reader may not have is worse than one
 * that waits — the same call `/leagues/[leagueId]`'s skeleton makes about its
 * commissioner badge.
 *
 * Three posts is a fixed guess, drawn without values for the usual reason.
 */
export default function AnnouncementsLoading() {
  return (
    <PageSkeleton label="the announcements" className="p-6 md:p-8">
      <SkeletonLine w="w-64" h="h-3" />

      <div className="flex flex-col gap-2">
        <SkeletonLine w="w-64" h="h-10" />
        <SkeletonLine w="w-96" h="h-4" />
      </div>

      <div className="flex max-w-measure-wide flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} variant="flat" className="gap-2.5">
            <SkeletonLine w="w-64" h="h-5" />
            <SkeletonLine w="w-full" h="h-3.5" />
            <SkeletonLine w="w-4/5" h="h-3.5" />
            <div className="flex items-center gap-2 pt-1">
              <SkeletonLine w="w-5" h="h-5" className="rounded" />
              <SkeletonLine w="w-40" h="h-3" />
            </div>
          </Card>
        ))}
      </div>
    </PageSkeleton>
  );
}
