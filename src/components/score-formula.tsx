import { cn } from "@/lib/utils";

/**
 * THE WHOLE GAME IN ONE LINE — the scoring rule, set as display type.
 *
 * It moved out of `landing-hero` the first time a second route needed it
 * (`/how-it-works`, board 2.1). Two routes, one definition: the rule is the
 * thing this app is about, and two copies of it are two places to get it wrong.
 *
 * ── THE GLYPHS ARE HIDDEN AND THE WORDS ARE SPOKEN ────────────────────────
 * A screen reader's default punctuation level skips `×` and `=` entirely,
 * which would read the formula as three unconnected nouns. This is the subtle
 * part, and the reason the markup is shared rather than retyped.
 *
 * ── THE ACCENT IS CHOSEN BY THE GROUND, NOT BY THE CALLER'S TASTE ─────────
 * `--primary` (#C52F1B) is 5.04:1 on paper and 3.80:1 on ink; `--nav-primary`
 * (#EB4B37) is 5.59:1 on ink and 3.42:1 on paper. Neither red is legible on
 * both, so the surface picks the token. This is the only prop.
 */
export function ScoreFormula({
  ground = "paper",
  className,
}: {
  ground?: "paper" | "ink";
  className?: string;
}) {
  const accent = ground === "ink" ? "text-nav-primary" : "text-primary";

  return (
    <p
      className={cn(
        "type-numeral flex flex-wrap items-center gap-4.5 text-h2",
        className
      )}
    >
      <span>Opening box office ($M)</span>
      <span aria-hidden className={accent}>
        &times;
      </span>
      <span className="sr-only">multiplied by</span>
      {/* A registered mark, and not ours to have auto-translate mangle. */}
      <span translate="no">Tomatometer</span>
      <span aria-hidden className={accent}>
        =
      </span>
      <span className="sr-only">equals</span>
      <span>Your score</span>
    </p>
  );
}
