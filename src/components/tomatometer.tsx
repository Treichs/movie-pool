import { TomatoMark } from "@/components/tomato-mark";
import { cn } from "@/lib/utils";

/**
 * THE TOMATOMETER — the mark carries the state, the numeral carries the size.
 *
 * ── THE MARK IS ROTTEN TOMATOES' OWN, WHICH IS WHY IT IS HERE ─────────────
 * This component drew nothing until 2026-09-02, because RT's guidelines
 * require their own artwork and a redrawn lookalike is what those guidelines
 * exist to forbid. It now draws `tomato-mark`, which is transcribed from RT's
 * supplied SVGs rather than approximated — that answers the objection instead
 * of working around it. The colour collision the old header also named is
 * answered by `--tomato-*`, tokens deliberately outside the state system, so
 * the tomato never spends the app's red or green. Both notes live in full in
 * `tomato-mark.tsx` and beside the tokens in `globals.css`.
 *
 * ── A MARK WHEN THERE IS A SCORE, A WORD WHEN THERE IS NOT ────────────────
 * The mark replaces the words `Fresh` and `Rotten`, which is the whole reason
 * to draw one — six characters beside every score in a rail were the loudest
 * thing in the row. Assistive technology still hears them: they move to the
 * `sr-only` span, so the chip reads "Tomatometer: 87%, Fresh".
 *
 * An unrated film has no mark to draw, so it keeps its words. That is the rule
 * in one line, and it is why the null case is not a bare em dash in a box.
 *
 * ── 60 IS THEIR NUMBER, NOT OURS ──────────────────────────────────────────
 * Fresh at 60% and above is Rotten Tomatoes' published definition. Certified
 * Fresh is a separate editorial designation we do not receive, so it is not
 * claimed here — two states, both of which the data can actually support.
 *
 * `live` marks a figure polled from OMDb rather than captured by the
 * commissioner on Monday. It is the same number until capture and a different
 * *claim*, which is why the reveal screen needs to say so. No mark encodes it,
 * so it stays a visible word.
 */
const FRESH_AT = 60;

/** Exported because the film pages draw the mark beside a `Figure` rather than
 *  through this chip, and a second literal 60 is how a threshold stops being
 *  one. */
export function isFresh(value: number | null) {
  return value !== null && value >= FRESH_AT;
}

export function Tomatometer({
  value,
  live = false,
  size = "default",
  className,
}: {
  value: number | null;
  /** Polled, not yet captured — see the header. */
  live?: boolean;
  size?: "default" | "sm";
  className?: string;
}) {
  const fresh = isFresh(value);
  const state = value === null ? "Not yet rated" : fresh ? "Fresh" : "Rotten";

  return (
    <span
      className={cn(
        "inline-flex w-fit items-baseline gap-1.5 rounded-sm border px-1.5 py-0.5",
        value === null
          ? "border-border text-muted-foreground"
          : fresh
            ? "border-edge text-foreground"
            : "border-border text-muted-foreground",
        className,
      )}
    >
      {/* The trademark is spelled out for assistive technology and withheld
          from the page: six characters of "Tomatometer" beside every score in a
          rail would be the loudest word on the screen. `translate="no"` for the
          same reason it is on every other mention of the mark in the app. */}
      <span className="sr-only" translate="no">
        Tomatometer:{" "}
      </span>
      {value !== null && (
        // `self-center` against the row's baseline: a glyph sits ON the
        // baseline, a 1em square hangs from it, and the two do not agree.
        <TomatoMark
          fresh={fresh}
          className={cn("self-center", size === "sm" ? "size-3.5" : "size-4.5")}
        />
      )}
      <span
        className={cn(
          "type-numeral",
          size === "sm" ? "text-ui" : "text-h3",
        )}
      >
        {value === null ? "—" : `${value}%`}
      </span>
      {value === null ? (
        <span className="type-micro text-micro">{state}</span>
      ) : (
        <>
          {/* The comma is not decoration: without it the chip's text content
              runs together as "87%Fresh", which is how at least one screen
              reader says it. */}
          <span className="sr-only">{`, ${state}`}</span>
          {live && <span className="type-micro text-micro">live</span>}
        </>
      )}
    </span>
  );
}
