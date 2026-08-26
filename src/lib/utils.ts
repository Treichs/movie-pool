import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * THE FONT-SIZE SCALE, NAMED FOR tailwind-merge.
 *
 * `twMerge` ships a HARDCODED list of font-size values — `xs`, `sm`, `base`,
 * `lg`, `xl`, `2xl`, … — and never reads a stylesheet. Anything else after
 * `text-` falls through to its **text-COLOUR** group, so on the stock config
 * every one of our role tokens is classified as a colour and collides with the
 * real colour beside it. One of the two is then deleted, silently, in the
 * direction nobody expects: the SIZE loses, because the colour is written last.
 *
 *     twMerge("text-h1", "text-muted-foreground")  ->  "text-muted-foreground"
 *     twMerge("text-sm", "text-muted-foreground")  ->  "text-sm text-…"  <- control
 *
 * The control is what proves the cause: the stock scale is never affected, so
 * nothing in `ui/**` — written against `text-sm`/`text-xs` — misbehaves, and
 * the fault is invisible everywhere except our own type roles.
 *
 * This list is a literal because `cn` runs in the BROWSER and cannot read
 * `globals.css`. It must stay in step with the `--text-*` names in that file's
 * second `@theme` block, in the same order, so the two read alike. Adding a
 * twelfth token there without adding it here re-breaks this silently.
 */
export const TEXT_SIZE_TOKENS = [
  "display",
  "h1",
  "h2",
  "h3",
  "eyebrow",
  "dek",
  "ui",
  "button",
  "micro",
  "numeral-xl",
  "numeral",
] as const;

/**
 * `extend`, never `override` — the stock t-shirt scale still has to merge, and
 * `override` would replace the whole `text` theme scale rather than add to it.
 * `ConfigExtension.extend.theme` takes theme SCALES, and `text` is the one the
 * `font-size` class group reads through `fromTheme("text")`. Configuring
 * `classGroups["font-size"]` instead would work and is the wrong lever — it
 * would replace the group's own validators (arbitrary values, `text-[13px]`)
 * along with the scale.
 */
const twMerge = extendTailwindMerge({
  extend: { theme: { text: [...TEXT_SIZE_TOKENS] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
