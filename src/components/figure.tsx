import { cn } from "@/lib/utils";

/**
 * A LABEL AND ITS NUMBER, stacked — the app's most repeated unit.
 *
 * It was written out three times under three names (`Figure`, `Stat`, `Delta`)
 * across three routes, which is how the gaps drifted apart. The numeral is
 * always `type-numeral`, so a row of them lines up on its digits.
 *
 * ── STACKED ONLY, DELIBERATELY ────────────────────────────────────────────
 * There is a second shape in the app — label left, number right — but it has
 * two callers that disagree about their element (`<div>` vs `<dt>`/`<dd>`) and
 * their padding. A `layout` prop would exist to serve one of them. They stay
 * local, and both are now called `Fact`, so the two shapes no longer share a
 * name.
 *
 * `size="lg"` is the reading figure on `/how-it-works`, where the number IS the
 * explanation. Everything else is the default.
 *
 * `size="hero"` is `--text-numeral-xl`, the one number a screen is ABOUT: the
 * bid deadline's countdown, and a film's score on board 2.3. The name is
 * `deadline-countdown.tsx`'s, which reached the same token first and called it
 * that; two names for one size is how a scale stops being one.
 */
const NUMERAL_SIZE = {
  default: "text-h3",
  lg: "text-h2",
  hero: "text-numeral-xl",
} as const;

export function Figure({
  label,
  value,
  size = "default",
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  size?: "default" | "lg" | "hero";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col",
        size === "default" ? "gap-0.5" : "gap-1",
        className,
      )}
    >
      <span className="type-eyebrow text-eyebrow text-muted-foreground">
        {label}
      </span>
      <span className={cn("type-numeral", NUMERAL_SIZE[size])}>{value}</span>
    </div>
  );
}
