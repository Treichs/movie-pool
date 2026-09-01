import { cn } from "@/lib/utils";

/**
 * THE TOMATOMETER, SET RATHER THAN ILLUSTRATED.
 *
 * ── WHY THERE IS NO LOGO HERE ─────────────────────────────────────────────
 * Rotten Tomatoes' guidelines require their OWN artwork — the licensed splat,
 * supplied through their partner programme. A redrawn lookalike is the one
 * thing those guidelines exist to forbid, so this component draws nothing. The
 * figure is set in the numeral role like every other number the game produces,
 * and the state is a word.
 *
 * That also settles a colour collision the icon would have created: Rotten
 * Tomatoes is red-for-good and green-for-bad, while this app spends red on
 * *live and yours* and green on *settled*. A splat beside a score would fight
 * every other signal on the page. Weight and a rule carry it instead — fresh
 * takes the control `--edge` and full ink, rotten drops to the panel rule and
 * muted ink, so the two read apart at a glance without a hue.
 *
 * ── 60 IS THEIR NUMBER, NOT OURS ──────────────────────────────────────────
 * Fresh at 60% and above is Rotten Tomatoes' published definition. Certified
 * Fresh is a separate editorial designation we do not receive, so it is not
 * claimed here — two states, both of which the data can actually support.
 *
 * `live` marks a figure polled from OMDb rather than captured by the
 * commissioner on Monday. It is the same number until capture and a different
 * *claim*, which is why the reveal screen needs to say so.
 */
const FRESH_AT = 60;

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
  const fresh = value !== null && value >= FRESH_AT;
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
      <span
        className={cn(
          "type-numeral",
          size === "sm" ? "text-ui" : "text-h3",
        )}
      >
        {value === null ? "—" : `${value}%`}
      </span>
      <span className="type-micro text-micro">
        {live && value !== null ? `${state} · live` : state}
      </span>
    </span>
  );
}
