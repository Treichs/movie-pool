import { cn } from "@/lib/utils";

/**
 * THE TOMATOMETER MARK — Rotten Tomatoes' OWN artwork, not a lookalike.
 *
 * ── WHY THIS FILE EXISTS AT ALL ────────────────────────────────────────────
 * `tomatometer.tsx` used to draw nothing, on the ground that RT's guidelines
 * require their own licensed artwork and a redrawn tomato is the one thing
 * those guidelines exist to forbid. That ground is answered rather than
 * overruled: the two path sets below are transcribed byte-for-byte out of
 * Rotten Tomatoes' supplied SVGs. Nothing here was drawn, simplified or
 * "cleaned up", and nothing here should be — a tidied curve is the lookalike
 * the rule was about.
 *
 * ── THE COLOUR COLLISION IS ANSWERED BY TOKENS, NOT BY AVOIDANCE ───────────
 * RT is red-for-good and green-for-bad; this app spends red on *live and
 * yours* and green on *settled*. The marks therefore fill from `--tomato-*`,
 * which sit outside the state-token system on purpose (see the note beside
 * them in `globals.css`). The tomato never spends --primary or --success, so
 * it cannot be read as either signal.
 *
 * The splat's #0FC755 measures 2.04:1 on paper and would fail WCAG 1.4.11 as a
 * standalone graphical object. It is shipped as supplied because it is not
 * standalone: the percentage is always set beside it and is the actual
 * meaning, which is also why this is `aria-hidden`. Repainting somebody's
 * brand green to pass a rule it is not subject to was judged the worse trade.
 *
 * ── NO INTRINSIC SIZE ──────────────────────────────────────────────────────
 * The caller sets `size-*`, the way `league-mark` does. One drawing serves the
 * inline chip at 14px and a film masthead at 24px, and the two viewBoxes are
 * near enough square (0.98 and 1.04) that both sit in the same box.
 */

/** Rotten Tomatoes' own viewBoxes. The rotten file ships width/height only —
 *  without this it would not scale. */
const VIEW_BOX = {
  fresh: "0 0 138.75 141.25",
  rotten: "0 0 145 140",
} as const;

export function TomatoMark({
  fresh,
  className,
}: {
  /** At or above the Tomatometer's 60. Below it, the splat. */
  fresh: boolean;
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox={fresh ? VIEW_BOX.fresh : VIEW_BOX.rotten}
      className={cn("shrink-0", className)}
    >
      {fresh ? (
        <>
          <path
            className="fill-tomato-fresh"
            d="m20.154 40.829c-28.149 27.622-13.657 61.011-5.734 71.931 35.254 41.954 92.792 25.339 111.89-5.9071 4.7608-8.2027 22.554-53.467-23.976-78.009z"
          />
          <path
            className="fill-tomato-fresh"
            d="m39.613 39.265 4.7778-8.8607 28.406-5.0384 11.119 9.2082z"
          />
          <path
            className="fill-tomato-leaf"
            d="m39.436 8.5696 8.9682-5.2826 6.7569 15.479c3.7925-6.3226 13.79-16.316 24.939-4.6684-4.7281 1.2636-7.5161 3.8553-7.7397 8.4768 15.145-4.1697 31.343 3.2127 33.539 9.0911-10.951-4.314-27.695 10.377-41.771 2.334 0.009 15.045-12.617 16.636-19.902 17.076 2.077-4.996 5.591-9.994 1.474-14.987-7.618 8.171-13.874 10.668-33.17 4.668 4.876-1.679 14.843-11.39 24.448-11.425-6.775-2.467-12.29-2.087-17.814-1.475 2.917-3.961 12.149-15.197 28.625-8.476z"
          />
        </>
      ) : (
        <path
          className="fill-tomato-rotten"
          d="M47.4 35.342c-13.607-7.935-12.32-25.203 2.097-31.88 26.124-6.531 29.117 13.78 22.652 30.412-6.542 24.11 18.095 23.662 19.925 10.067 3.605-18.412 19.394-26.695 31.67-16.359 12.598 12.135 7.074 36.581-17.827 34.187-16.03-1.545-19.552 19.585.839 21.183 32.228 1.915 42.49 22.167 31.04 35.865-15.993 15.15-37.691-4.439-45.512-19.505-6.8-9.307-17.321.11-13.423 6.502 12.983 19.465 2.923 31.229-10.906 30.62-13.37-.85-20.96-9.06-13.214-29.15 3.897-12.481-8.595-15.386-16.57-5.45-11.707 19.61-28.865 13.68-33.976 4.19-3.243-7.621-2.921-25.846 24.119-23.696 16.688 4.137 11.776-12.561-.63-13.633-9.245-.443-30.501-7.304-22.86-24.54 7.34-11.056 24.958-11.768 33.348 6.293 3.037 4.232 8.361 11.042 18.037 5.033 3.51-5.197 1.21-13.9-8.809-20.135z"
        />
      )}
    </svg>
  );
}
