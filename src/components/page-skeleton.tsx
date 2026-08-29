import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * THE PIECES A `loading.tsx` IS BUILT FROM.
 *
 * ── A SKELETON IS A PROMISE ABOUT THE SHAPE, NOT A SPINNER ────────────────
 * Every one of these mirrors a real element on the page it stands in for, at
 * the same size and in the same place, so nothing jumps when the data lands.
 * That is the whole reason to prefer them to a spinner here: these pages are
 * layouts the reader already recognises, and holding the layout still is worth
 * more than announcing that something is happening.
 *
 * ── WHAT IS DELIBERATELY NOT FAKED ────────────────────────────────────────
 * No skeleton stands in for a number, a name or a count. A grey bar the width
 * of "4th of 5" is a shape; a grey bar reading anything is a lie the page then
 * has to correct. Rows are drawn at a FIXED count — three, five — because the
 * real count is not known yet and guessing it makes the settle worse, not
 * better.
 *
 * ── ONE `aria-busy` REGION PER PAGE, AND NOTHING ELSE ANNOUNCED ───────────
 * `PageSkeleton` carries `aria-busy` and a visually hidden "Loading" for the
 * screen reader. The bars beneath it are `aria-hidden`: announcing forty empty
 * boxes is worse than announcing nothing.
 */
export function PageSkeleton({
  label,
  className,
  children,
}: {
  /** What is loading, in the reader's words — "Your leagues", not "data". */
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <main
      aria-busy="true"
      className={cn(
        "mx-auto flex max-w-measure-page flex-col gap-6 px-8 py-8",
        className,
      )}
    >
      <span className="sr-only" role="status">
        Loading {label}
      </span>
      <div aria-hidden className="flex flex-col gap-6">
        {children}
      </div>
    </main>
  );
}

/** A line of text. `w` is a Tailwind width class, because these are meant to be
 *  ragged — a column of identical bars reads as a table, not as prose. */
export function SkeletonLine({
  w = "w-40",
  h = "h-4",
  className,
}: {
  w?: string;
  h?: string;
  className?: string;
}) {
  return <Skeleton className={cn("rounded-xs", h, w, className)} />;
}

/** An eyebrow over a numeral — the `Figure` shape, at `Figure`'s sizes. */
export function SkeletonFigure() {
  return (
    <div className="flex flex-col gap-1.5">
      <SkeletonLine w="w-20" h="h-2.5" />
      <SkeletonLine w="w-14" h="h-5" />
    </div>
  );
}

/** One `Item` row: media, two lines of content, a trailing action. */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 rounded border p-4">
      <Skeleton className="size-11 rounded-lg" />
      <div className="flex grow flex-col gap-2">
        <SkeletonLine w="w-48" h="h-4.5" />
        <SkeletonLine w="w-32" h="h-3" />
      </div>
      <SkeletonLine w="w-16" h="h-3" />
    </div>
  );
}

/** A flat panel with a heading and some lines in it. */
export function SkeletonPanel({
  lines = 3,
  size,
}: {
  lines?: number;
  size?: "sm";
}) {
  return (
    <Card variant="flat" size={size} className="gap-3">
      <SkeletonLine w="w-28" h="h-2.5" />
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonLine key={i} w={i % 2 ? "w-3/5" : "w-4/5"} h="h-3.5" />
      ))}
    </Card>
  );
}
