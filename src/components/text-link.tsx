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
        size === "micro" && "type-micro text-micro",
        className,
      )}
      {...props}
    />
  );
}
