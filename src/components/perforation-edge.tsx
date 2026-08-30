import { Perforation } from "@/components/perforation";
import { cn } from "@/lib/utils";

/**
 * ONE PERFORATED EDGE of a full-width ink band — the landing hero's, and now
 * `/how-it-works`'s. It moved out of `landing-hero` the first time a second
 * route needed it.
 *
 * Absolutely positioned so the band's own content can sit on the page measure
 * without allowing for it.
 *
 * HIDDEN BELOW `xl`, and that is the one responsive decision a static board
 * cannot draw. The columns occupy 28–54px from each edge; a band's content is
 * `max-w-measure-page px-8`, so below roughly 1280px the text would reach them
 * and paint over the edge rather than beside it. `auth-split-shell` makes the
 * same call for the same reason — there by hiding the whole ink pane.
 *
 * The COUNT is the caller's, because it is a function of the band's height:
 * the rhythm is spaced, not counted, and a tall hero and a short one want
 * different numbers to keep the spacing even.
 */
export function PerforationEdge({
  edge,
  count,
}: {
  edge: "left" | "right";
  count: number;
}) {
  return (
    <div
      // DECORATIVE, and not a list. Identical shapes announced one by one
      // would be noise ahead of the real content.
      aria-hidden
      className={cn(
        "absolute inset-y-0 hidden flex-col justify-around py-3 xl:flex",
        edge === "left" ? "left-7" : "right-7"
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <Perforation key={i} />
      ))}
    </div>
  );
}
