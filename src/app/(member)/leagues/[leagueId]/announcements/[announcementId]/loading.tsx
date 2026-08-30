import { PageSkeleton, SkeletonLine } from "@/components/page-skeleton";
import { Separator } from "@/components/ui/separator";

/**
 * ONE ANNOUNCEMENT WHILE IT READS.
 *
 * The two hairlines are drawn for real: every post has them, and they are what
 * gives this page its shape before a single word of it has arrived. Six body
 * lines is a fixed guess — the real length is the whole unknown here, and a
 * skeleton that grew to match would be the settle it exists to prevent.
 *
 * NO DELETE BUTTON is sketched. Whether it appears depends on a role this page
 * has not read yet, and a skeleton implying authority the reader may not have
 * is worse than one that waits.
 */
export default function AnnouncementLoading() {
  return (
    <PageSkeleton label="this announcement" className="p-6 md:p-8">
      <SkeletonLine w="w-80" h="h-3" />

      <div className="flex max-w-measure-wide flex-col gap-6">
        <div className="flex flex-col gap-3">
          <SkeletonLine w="w-96" h="h-10" />
          <div className="flex items-center gap-2.5">
            <SkeletonLine w="w-7.5" h="h-7.5" className="rounded" />
            <div className="flex flex-col gap-1.5">
              <SkeletonLine w="w-32" h="h-4" />
              <SkeletonLine w="w-48" h="h-3" />
            </div>
          </div>
        </div>

        <Separator />

        <div className="flex max-w-measure-default flex-col gap-2.5">
          {["w-full", "w-full", "w-4/5", "w-full", "w-full", "w-2/3"].map(
            (w, i) => (
              <SkeletonLine key={i} w={w} h="h-4" />
            )
          )}
        </div>

        <Separator />

        <SkeletonLine w="w-40" h="h-4" />
      </div>
    </PageSkeleton>
  );
}
