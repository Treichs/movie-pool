import { PageSkeleton, SkeletonLine } from "@/components/page-skeleton";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A FILM WHILE TWO EXTERNAL APIs ANSWER.
 *
 * This loading state earns its keep more than most: `getFilmPage` may miss the
 * catalogue and fall through to a live TMDB call, so the wait here is somebody
 * else's server and not a query anyone can make faster.
 *
 * The backdrop and poster are drawn as blocks rather than lines because that
 * is the shape the page takes — the reader is waiting for a picture, and a
 * stack of grey rules would not say so.
 *
 * `PageSkeleton` is overridden to full bleed here, which no other page needs:
 * its `max-w`/padding are what every ordinary screen wants, and a backdrop
 * that stops short of the window edge is the one thing this page cannot do.
 */
export default function FilmLoading() {
  return (
    <PageSkeleton
      label="this film"
      className="max-w-none gap-0 px-0 pt-0 pb-8"
    >
      <div className="flex flex-col">
        <Skeleton className="h-56 w-full rounded-none sm:h-75" />
        <div className="mx-auto flex w-full max-w-measure-page gap-7 px-8">
          <div className="-mt-28 w-36 shrink-0 sm:w-50">
            <AspectRatio ratio={2 / 3}>
              <Skeleton className="size-full rounded" />
            </AspectRatio>
          </div>
          <div className="flex grow flex-col gap-3 pt-2">
            <SkeletonLine w="w-40" h="h-3" />
            <SkeletonLine w="w-72" h="h-10" />
            <SkeletonLine w="w-56" h="h-4" />
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-measure-page flex-col gap-6 px-8">
        <div className="flex flex-col gap-2">
          <SkeletonLine w="w-full" h="h-3.5" />
          <SkeletonLine w="w-4/5" h="h-3.5" />
        </div>

        {/* The catalog notice stands on every film, so its box is drawn: it
            sits between the overview and the trailer, and leaving it out is
            what would make the whole page below it jump when the data lands. */}
        <Card variant="flat" className="h-18 border-dashed" />

        <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
          <AspectRatio ratio={16 / 9}>
            <Skeleton className="size-full rounded" />
          </AspectRatio>
          <Card variant="flat" size="sm" className="gap-2.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <SkeletonLine w="w-24" h="h-3" />
                <SkeletonLine w="w-16" h="h-3" />
              </div>
            ))}
          </Card>
        </div>
      </div>
    </PageSkeleton>
  );
}
