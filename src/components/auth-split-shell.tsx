import { Perforation } from "@/components/perforation";
import { cn } from "@/lib/utils";

/**
 * AUTH SPLIT SHELL — the frame the signed-out screens sit inside.
 *
 * Two variants, and the boundary between them is the load-bearing decision:
 *
 *   `field` — a two-column page. Form on paper, an ink pane beside it carrying
 *             whatever that screen wants to say. `/login` and `/signup`.
 *   `rail`  — a perforated strip and nothing else beside the content.
 *             `/forgot-password` and `/reset-password`.
 *
 * The rail is not "the field, narrower". It carries NO slot at all, and the
 * union type below makes passing `ink` to it a compile error rather than a
 * comment nobody reads.
 *
 * ── IT LIVES IN `src/components/`, NOT A ROUTE'S `_components/` ────────────
 * Rule 1 says a component moves here the first time a SECOND route needs it,
 * never in anticipation. Four routes need this one on the day it is written,
 * so this is not anticipation — it is the move, made once.
 *
 * ── THE PERFORATION RADIUS IS THE ONE CORNER NOT DERIVED FROM `--radius` ───
 * `--radius-perf: 7px`, used as `rounded-perf`. A film perforation is a
 * rounded rectangle, and one that squared itself when the corner language was
 * retuned would be a bug. The geometry is not invented here either — it is the
 * brand mark's own, `26x34` at `rx 7`, which is `w-6.5 h-8.5 rounded-perf`. Do
 * not invent a second perforation rhythm somewhere else — the shape itself now
 * lives in `src/components/perforation.tsx`, which the landing hero also uses.
 *
 * ── THE INK PANE DOES NOT INVERT. IT IS A `--nav` SURFACE ──────────────────
 * `bg-nav text-nav-foreground`, with `bg-nav-foreground/88` perforations. This
 * app owns a permanently-ink surface whose family is declared at the SAME value
 * in `:root` and `.dark`, and this pane is one of them.
 *
 * `bg-foreground` / `text-background` was tried in the old codebase and is
 * wrong in three ways worth recording so nobody re-derives it:
 *   1. It makes the pane INVERT — in dark mode the ink field becomes a paper
 *      field, a photographic negative of a motif that is an asset, not a theme.
 *   2. It breaks the vermilion. `#EB4B37` is 5.57:1 on ink and 3.42:1 on paper,
 *      so a wordmark that is legal on `--nav` becomes a failure on the page
 *      ground.
 *   3. It sits OUTSIDE the contrast gate, which builds pairs as
 *      `<x>-foreground on <x>` — and `foreground` has no `-foreground` sibling,
 *      so nothing would ever measure it. `nav-foreground on nav` (19.12) and
 *      `nav-muted-foreground on nav` (6.33) both ride the sweep.
 *
 * The one real cost is paid rather than dismissed: `#000000` against dark's
 * `--background` (#0B0A09) is almost no separation, and the split must never
 * vanish. A 1px `border-nav-border` carries it — `#33322F` in dark, `#000000`
 * in light where the paper page already separates them.
 *
 * ── COMPOSITION FROM `@shadcn/login-02` ────────────────────────────────────
 * Taken: `min-h-svh`, the `lg:grid-cols-2` split, and — the part a static board
 * cannot draw — the second pane HIDDEN below `lg`, because a two-column auth
 * page must collapse to the form alone on a narrow viewport. Nothing else; its
 * styling was taken none of. Not installed: the block would have offered to
 * overwrite `button.tsx`, which carries our `ink` variant.
 */

/** How many perforations each column carries. */
const PERFORATIONS = { field: 9, rail: 10 } as const;

type CommonProps = {
  /** The content pane — the form, its heading, its links. Both variants take
   *  it, and it is the pane that survives when the ink pane is hidden. */
  children: React.ReactNode;
  className?: string;
};

type FieldProps = CommonProps & {
  variant?: "field";
  /** The ink pane's content. A SLOT, not fixed content. Hidden below `lg`, so
   *  nothing essential may live here. */
  ink: React.ReactNode;
  /**
   * How the ink pane is composed — one decision, not two, because the screens
   * pair these consistently and the pairing is the point:
   *   `cell`  — content centred, BOTH edges perforated. A film cell.
   *   `strip` — a left-aligned column, ONE perforated edge. An editorial run
   *             down the film's edge.
   */
  inkLayout?: "cell" | "strip";
};

type RailProps = CommonProps & {
  variant: "rail";
  /** The rail carries no slot. Utility screens get a strip, not a field. */
  ink?: never;
  inkLayout?: never;
};

export type AuthSplitShellProps = FieldProps | RailProps;

/** A column of perforations down one edge. Absolutely positioned so the pane's
 *  own content can be centred without allowing for them. */
function PerforationColumn({ edge }: { edge: "left" | "right" }) {
  return (
    <div
      // DECORATIVE, and not a list. Nine identical shapes announced to a screen
      // reader would be nine pieces of noise ahead of the real content.
      aria-hidden
      data-slot="auth-perforation-column"
      className={cn(
        "absolute inset-y-0 flex flex-col justify-between py-5",
        edge === "left" ? "left-7" : "right-7"
      )}
    >
      {Array.from({ length: PERFORATIONS.field }, (_, i) => (
        <Perforation key={i} />
      ))}
    </div>
  );
}

/** The content pane's measure, shared by both variants. */
function ContentPane({
  children,
  grow,
}: {
  children: React.ReactNode;
  grow?: boolean;
}) {
  return (
    <div
      data-slot="auth-content"
      className={cn(
        "flex flex-col justify-center px-6 py-12 md:px-10 lg:px-28",
        grow && "flex-1"
      )}
    >
      <div className="mx-auto w-full max-w-100">{children}</div>
    </div>
  );
}

export function AuthSplitShell({
  variant = "field",
  ink,
  inkLayout = "cell",
  children,
  className,
}: AuthSplitShellProps) {
  if (variant === "rail") {
    return (
      <div
        data-slot="auth-split-shell"
        data-variant="rail"
        className={cn("flex min-h-svh", className)}
      >
        <div
          // THE ONE RESPONSIVE DECISION A BOARD CANNOT DRAW, and it is the
          // rail's counterpart to login-02 hiding its second pane. 96px off a
          // 375px viewport is 26% of the width spent on chrome. It narrows to
          // 64px below `lg` instead of vanishing: on a utility screen the strip
          // is the only brand element there is, and a 26px perforation inside
          // 64px still reads as a film edge.
          aria-hidden
          data-slot="auth-rail"
          className="flex w-16 shrink-0 flex-col items-center justify-between border-r border-nav-border bg-nav py-6 lg:w-24"
        >
          {Array.from({ length: PERFORATIONS.rail }, (_, i) => (
            <Perforation key={i} />
          ))}
        </div>
        <ContentPane grow>{children}</ContentPane>
      </div>
    );
  }

  return (
    <div
      data-slot="auth-split-shell"
      data-variant="field"
      className={cn("grid min-h-svh lg:grid-cols-2", className)}
    >
      <ContentPane>{children}</ContentPane>
      <div
        data-slot="auth-ink"
        className={cn(
          // `hidden lg:flex` is login-02's decision, kept.
          "relative hidden flex-col justify-center overflow-hidden border-nav-border bg-nav text-nav-foreground lg:flex lg:border-l",
          // `px-16` IS A FLOOR, NOT PADDING. The perforation columns are
          // absolute at 28-54px from each edge, so at exactly `lg` a 512px pane
          // leaves 404px of clear centre — and the content wrapper is
          // `relative`, so anything wider paints OVER a column rather than
          // under it. 64px clears the column by 10px and makes the collision
          // structurally impossible rather than a review item on each screen.
          inkLayout === "cell" ? "items-center px-16" : "pr-22 pl-28"
        )}
      >
        <PerforationColumn edge="left" />
        {inkLayout === "cell" && <PerforationColumn edge="right" />}
        {/* The content sits above the perforation columns, which are absolute
            and would otherwise paint over it at a narrow pane width. */}
        <div className="relative flex flex-col gap-10">{ink}</div>
      </div>
    </div>
  );
}
