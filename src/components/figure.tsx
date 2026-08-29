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
 */
export function Figure({
  label,
  value,
  size = "default",
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  size?: "default" | "lg";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col",
        size === "lg" ? "gap-1" : "gap-0.5",
        className,
      )}
    >
      <span className="type-eyebrow text-eyebrow text-muted-foreground">
        {label}
      </span>
      <span className={cn("type-numeral", size === "lg" ? "text-h2" : "text-h3")}>
        {value}
      </span>
    </div>
  );
}
