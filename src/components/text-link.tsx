import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * AN INLINE LINK IN PROSE — the one that sits inside a sentence.
 *
 * Not `<Button variant="link">`: that carries the button box (`h-9`, `px-3`,
 * `inline-flex`), which is right for a link standing where a button would and
 * wrong for one inside a paragraph. Both now paint `--link`, so the two cannot
 * disagree about colour.
 *
 * `size` exists because the surrounding text genuinely differs: inside a
 * `FieldDescription` the link should inherit, and a panel's footer link is
 * deliberately smaller than its body. Nothing else about it varies.
 *
 * `micro` ALSO TAKES `tap-target`, and only `micro` does. Every use of it is a
 * panel's standalone action — "Open", "Edit your profile" — rather than a word
 * inside a sentence, so it gets none of the spacing a line of prose gives its
 * neighbours, and 15px is the smallest thing in the app to aim a thumb at. The
 * other two sizes are inline in text, where WCAG's own inline exception applies
 * and an expanded hit area would overlap the words either side of it.
 */
export function TextLink({
  size = "inherit",
  className,
  ...props
}: React.ComponentProps<typeof Link> & {
  size?: "inherit" | "ui" | "micro";
}) {
  return (
    <Link
      className={cn(
        "text-link underline underline-offset-4",
        size === "ui" && "type-ui text-ui",
        size === "micro" && "type-micro text-micro tap-target",
        className,
      )}
      {...props}
    />
  );
}
