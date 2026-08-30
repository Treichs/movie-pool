import { avatarFill } from "@/lib/avatar";
import { initialsFrom } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A LEAGUE — a film cell, never a circle.
 *
 * ── THE SHAPE IS THE SEPARATOR, AND IT IS THE BRAND'S ──────────────────
 * Primer: "Circle avatars represent individual people. Square avatars represent
 * non-human entities, such as bots, teams, or organizations." `player-avatar`
 * is the circle. This is the square — but drawn as the thing this app is
 * actually about, so the rule is satisfied with the brand's own geometry rather
 * than a generic rounded rectangle.
 *
 * ── THE PERFORATION RHYTHM IS 26:34:7, THE SAME RATIO AS THE STRIP ─────
 * `components/perforation.tsx` owns the shape for full-height columns and warns
 * against inventing a second rhythm. This does not: it restates that file's
 * ratio in viewBox units because a fixed `w-6.5 h-8.5` div cannot scale into a
 * 26px mark. The numbers below derive from 26 × 34 at rx 7 and nothing else —
 * if the strip's geometry ever changes, both files change together.
 *
 * THREE HOLES, from driving it: four turn to mush by 28px and two read as a
 * bracket rather than a strip. Below ~24px the holes stop being countable and
 * become texture, which still does the job — the mark reads as FILM rather than
 * as a rounded square even when you cannot count them.
 *
 * They are drawn in `currentColor` at 26%, not in paper. The fill is a
 * `--series-*` token — pale on paper, deep on ink — so a white hole would
 * vanish in light mode and a dark one would vanish in dark. A tint of the
 * mark's own ink reads as a notch on either ground and needs no second rule.
 *
 * ── THE INITIALS CANNOT REACH THE PERFORATIONS ─────────────────────────
 * Not by arithmetic — structurally. The letters live in their own box inset by
 * the gutter width on both sides, with `overflow-hidden`, so the worst a
 * pathological name can do is clip itself at the frame edge. It can never paint
 * over a hole.
 *
 * ── UP TO THREE LETTERS ────────────────────────────────────────────────
 * One per word, which is Discord's convention for a server with no icon and the
 * way people say a league's name aloud: "The Movie Pool" is TMP. A person gets
 * two. The different letter count is a second separator that survives even
 * where the shape is only texture.
 *
 * ── DECORATIVE ─────────────────────────────────────────────────────────
 * `aria-hidden`, because every call site sets the league's NAME beside it and
 * "T M P, The Movie Pool" is one fact announced twice. A caller that shows this
 * mark alone must label it itself.
 */

// One perforation, in units of a 100 × 100 mark. `PERF_H` sets the rhythm; the
// other two follow from the strip's 26 : 34 : 7.
const PERF_H = 14;
const PERF_W = (PERF_H * 26) / 34;
const PERF_R = (PERF_W * 7) / 26;
/** The perforated strip down each edge — also the inset the letters obey. */
const GUTTER = 17;
const PERFS = 3;

const GAP = (100 - PERFS * PERF_H) / (PERFS + 1);
const HOLE_X = [
  (GUTTER - PERF_W) / 2,
  100 - GUTTER + (GUTTER - PERF_W) / 2,
];

/** Container-relative type, so one component serves 22px to 96px. Three letters
 *  take the smallest step because they share the same 66-unit frame. */
const TYPE_STEP = ["34cqw", "44cqw", "36cqw", "26cqw"] as const;

export function LeagueMark({
  id,
  name,
  className,
}: {
  /** The league id. Colour derives from this, not the name — a rename must not
   *  recolour a league its members already recognise. */
  id: string;
  name: string;
  className?: string;
}) {
  const initials = initialsFrom(name, 3);

  return (
    <span
      aria-hidden
      data-slot="league-mark"
      className={cn(
        "@container relative inline-flex shrink-0 overflow-hidden rounded text-foreground",
        className
      )}
      style={{ backgroundColor: avatarFill(id) }}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
      >
        {Array.from({ length: PERFS }, (_, i) => {
          const y = GAP + i * (PERF_H + GAP);
          return HOLE_X.map((x) => (
            <rect
              key={`${i}-${x}`}
              x={x}
              y={y}
              width={PERF_W}
              height={PERF_H}
              rx={PERF_R}
              fill="currentColor"
              fillOpacity={0.26}
            />
          ));
        })}
      </svg>

      {/* The frame between the strips. `overflow-hidden` above plus this inset
          is what makes the no-overlap guarantee structural. */}
      <span
        className="type-ui relative flex w-full items-center justify-center overflow-hidden font-bold leading-none tracking-tight"
        style={{
          paddingInline: `${GUTTER}%`,
          fontSize: TYPE_STEP[Math.min(initials.length, 3)],
        }}
      >
        {initials}
      </span>
    </span>
  );
}
