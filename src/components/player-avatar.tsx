import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { avatarFill } from "@/lib/avatar";
import { initialsFrom } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A PERSON — a circle, always.
 *
 * ── SHAPE CARRIES THE MEANING ──────────────────────────────────────────
 * Primer states the rule outright: "Circle avatars represent individual people.
 * Square avatars represent non-human entities, such as bots, teams, or
 * organizations." Nord's design system says the same thing in the same words.
 * So a circle is a person and `league-mark.tsx` is everything else, and the two
 * are told apart before a single letter is read.
 *
 * That is a CHANGE: eleven of the thirteen call sites this replaces drew
 * `rounded` squares for people, which is the shape the convention reserves for
 * groups. They all draw circles now.
 *
 * ── "YOU" IS A RING, NOT AN INVERSION ──────────────────────────────────
 * Seven call sites used to mark the viewer's own row by filling their avatar
 * with ink. That cannot survive a derived colour — it would make you the one
 * player who never sees their own. A ring says the same thing and keeps the
 * colour, which matters because the colour is the part of this that is yours.
 *
 * ── SIZE IS A CLASS AND THE TYPE FOLLOWS IT ────────────────────────────
 * The call sites want eight sizes between 22px and 96px, so a size enum would
 * be a lie with an escape hatch: `size-*` through `className` is what the
 * primitive already takes. The initials then size themselves off the circle in
 * container units rather than each caller picking a font size by eye — 42cqw
 * lands on ~10px in a 24px circle, which is where `--text-micro` already sat,
 * and scales cleanly to the 96px profile card. `@container` is established here
 * (`ui/card.tsx`, `ui/field.tsx`), not introduced by this file.
 */
export function PlayerAvatar({
  id,
  name,
  isMe = false,
  className,
}: {
  /** The profile id. The colour derives from this and never from the name —
   *  see the header of `lib/avatar.ts` for why. */
  id: string;
  name: string;
  isMe?: boolean;
  className?: string;
}) {
  return (
    <Avatar
      className={cn(
        // after:border-transparent kills the primitive's grey hairline ring,
        // which reads as grime over a saturated fill.
        "@container shrink-0 after:border-transparent",
        isMe && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
        className
      )}
    >
      {/* Inline because the series index is computed and Tailwind cannot build
          `bg-series-${n}` from a runtime number — the same way `bump-chart.tsx`
          reads these tokens. `text-foreground` needs no per-colour decision:
          the series are pale on paper and deep on ink, so the app's own ink
          clears 6:1 on every one of them in both modes. */}
      <AvatarFallback
        className="type-ui size-full font-semibold text-[42cqw] leading-none text-foreground"
        style={{ backgroundColor: avatarFill(id) }}
      >
        {initialsFrom(name)}
      </AvatarFallback>
    </Avatar>
  );
}
