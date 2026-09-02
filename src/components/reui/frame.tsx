import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * CSS variable architecture for FramePanel theming:
 *
 * The Frame parent sets --frame-panel-bg and --frame-panel-border-color.
 * FramePanel consumes them directly via bg-(--frame-panel-bg) and
 * border-(--frame-panel-border-color). This means:
 *
 *   - variant="inverse" overrides those vars on Frame → all panels pick it up
 *   - <FramePanel className="bg-blue-50"> adds a direct utility on the element
 *     which wins over bg-(--frame-panel-bg) by Tailwind source order — no
 *     :not() or !important needed
 */
const frameVariants = cva(
  [
    // GROUND IS FULL WASH, NOT HALF. The registry default is `bg-muted/50`,
    // which over this app's paper (#F5F4F3) lands around #F1F0EE — one step off
    // the page, which is no edge at all. `--muted` neat is the wash the rest of
    // the app already uses for a field fill, and it is what makes the frame read
    // as a container rather than as a rectangle someone drew.
    "relative flex flex-col bg-muted gap-(--frame-gap) px-(--frame-px) py-(--frame-py) rounded-(--frame-radius)",
    // 4px, NOT 5.6px. The registry ships `--radius-xl`; this app's panels take
    // the base radius and read as paper, and a frame full of them cannot round
    // harder than what it holds. (The stray `(--radius-xl)]` fragment that led
    // this string in the registry copy is gone with it — see the note below.)
    "[--frame-radius:var(--radius)]",
    "(--radius-none)] (--radius-2xl)] (--radius-lg)] (--radius-none)]",
    "[--frame-gap:--spacing(0.75)] [--frame-px:--spacing(0.75)] [--frame-py:--spacing(0.75)] [--frame-panel-header-gap:0rem] [--frame-panel-footer-gap:--spacing(1)]",
    "[--frame-panel-px-adjust:0px] [--frame-panel-py-adjust:0px] [--frame-panel-header-px-adjust:0px] [--frame-panel-header-py-adjust:0px] [--frame-panel-footer-px-adjust:0px] [--frame-panel-footer-py-adjust:0px]",
    "[--frame-panel-px:calc(var(--frame-panel-px-base)_+_var(--frame-panel-px-adjust))] [--frame-panel-py:calc(var(--frame-panel-py-base)_+_var(--frame-panel-py-adjust))] [--frame-panel-header-px:calc(var(--frame-panel-header-px-base)_+_var(--frame-panel-header-px-adjust))] [--frame-panel-header-py:calc(var(--frame-panel-header-py-base)_+_var(--frame-panel-header-py-adjust))] [--frame-panel-footer-px:calc(var(--frame-panel-footer-px-base)_+_var(--frame-panel-footer-px-adjust))] [--frame-panel-footer-py:calc(var(--frame-panel-footer-py-base)_+_var(--frame-panel-footer-py-adjust))]",
    "(1)] (1)] (1.25)] (1.5)] (1.5)] (0.5)] (1)] (1)]",
    // Default panel token values — overridden per-variant below
    "[--frame-panel-bg:var(--color-card)] [--frame-panel-border-color:var(--color-border)] [--frame-border-color:var(--color-border)]",
    // CONCENTRIC NESTING IS SWITCHED OFF, AND HAS TO BE AT THIS SCALE.
    // The registry computes `frame − padding − 1px` so a panel's corner nests
    // inside the frame's rather than matching it. That trick needs a frame
    // radius larger than its own padding; this app's corner language is 4px and
    // a dashboard frame pads by 12, so the calc goes NEGATIVE and every panel
    // squares off. Concentric radii are a large-corner idea, and there is
    // nothing to nest at 4px — panel and frame both take the base radius, which
    // is what every other panel in the app already does.
    "[--frame-panel-radius:var(--radius)]",
  ],
  {
    variants: {
      variant: {
        default: "border border-[var(--frame-border-color)] bg-clip-padding",
        inverse:
          "[--frame-panel-bg:color-mix(in_oklch,var(--color-muted)_40%,transparent)] border border-[var(--frame-border-color)] bg-background bg-clip-padding",
        // Flattened for the same reason as the base value above: with nesting
        // off there is no border term to drop, so ghost's panels take the base
        // radius like everything else.
        ghost: "[--frame-panel-radius:var(--radius)]",
      },
      // Header/footer vertical rhythm is tighter than the panel body's, and
      // the gap widens as the frame grows: the bars read as chrome rather than
      // as another content block. py ladder is 0.5 / 1.5 / 2 / 2.5 against a
      // body py of 2 / 3.5 / 4 / 5. These vars are style-agnostic - no
      // style-*.css overrides them - so this single ladder drives all shadcn
      // styles. `px` is deliberately left level with the body so header,
      // content and footer stay left-aligned. `xs` holds at 0.5 (2px): it is
      // the practical floor, since anything lower stops reading as padding.
      spacing: {
        xs: "[--frame-panel-px-base:--spacing(2)] [--frame-panel-py-base:--spacing(2)] [--frame-panel-header-px-base:--spacing(2)] [--frame-panel-header-py-base:--spacing(0.5)] [--frame-panel-footer-px-base:--spacing(2)] [--frame-panel-footer-py-base:--spacing(0.5)]",
        sm: "[--frame-panel-px-base:--spacing(3)] [--frame-panel-py-base:--spacing(3.5)] [--frame-panel-header-px-base:--spacing(3)] [--frame-panel-header-py-base:--spacing(1.5)] [--frame-panel-footer-px-base:--spacing(3)] [--frame-panel-footer-py-base:--spacing(1.5)]",
        default:
          "[--frame-panel-px-base:--spacing(4)] [--frame-panel-py-base:--spacing(4)] [--frame-panel-header-px-base:--spacing(4)] [--frame-panel-header-py-base:--spacing(2)] [--frame-panel-footer-px-base:--spacing(4)] [--frame-panel-footer-py-base:--spacing(2)]",
        lg: "[--frame-panel-px-base:--spacing(5)] [--frame-panel-py-base:--spacing(5)] [--frame-panel-header-px-base:--spacing(5)] [--frame-panel-header-py-base:--spacing(2.5)] [--frame-panel-footer-px-base:--spacing(5)] [--frame-panel-footer-py-base:--spacing(2.5)]",
      },
      stacked: {
        true: [
          "gap-0 *:has-[+[data-slot=frame-panel]]:rounded-b-none",
          "*:has-[+[data-slot=frame-panel]]:before:hidden",
          "*:[[data-slot=frame-panel]+[data-slot=frame-panel]]:rounded-t-none",
          "*:[[data-slot=frame-panel]+[data-slot=frame-panel]]:border-t-0",
        ],
        false: [
          "data-[spacing=sm]:*:[[data-slot=frame-panel]+[data-slot=frame-panel]]:mt-0.5",
          "data-[spacing=default]:*:[[data-slot=frame-panel]+[data-slot=frame-panel]]:mt-1",
          "data-[spacing=lg]:*:[[data-slot=frame-panel]+[data-slot=frame-panel]]:mt-2",
        ],
      },
      dense: {
        // Positional rules must stay as parent selectors — cannot be expressed via CSS vars.
        // Padding is 0 and panels are pulled flush to the frame edge (-mx-px), so
        // their corners align with the frame radius rather than nesting inside it.
        true: "p-0 gap-0 border-[var(--frame-border-color)] [--frame-panel-radius:var(--frame-radius)] [&_[data-slot=frame-panel]]:-mx-px [&_[data-slot=frame-panel]]:before:hidden [&_[data-slot=frame-panel]:last-child]:-mb-px [&:not(:has([data-slot=frame-panel-header]))_[data-slot=frame-panel]:is(:first-child)]:-mt-px",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      spacing: "default",
      stacked: false,
      dense: false,
    },
  }
)

function Frame({
  className,
  variant,
  spacing,
  stacked,
  dense,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof frameVariants>) {
  return (
    <div
      className={cn(
        frameVariants({ variant, spacing, stacked, dense }),
        className
      )}
      data-slot="frame"
      data-spacing={spacing}
      {...props}
    />
  )
}

function FramePanel({
  className,
  fit,
  ...props
}: React.ComponentProps<"div"> & { fit?: boolean }) {
  return (
    <div
      className={cn(
        // bg-(--frame-panel-bg) and border-(--frame-panel-border-color) consume the
        // CSS vars set by the Frame parent. Any explicit bg-* or border-* class passed
        // via className overrides these by Tailwind source order - no ! needed.
        // NO SHADOW, AND NO INNER RING. The registry ships `shadow-xs` plus a
        // `before:` pseudo-element carrying a second, inset shadow. Both are
        // removed: the Flat Panel Rule says a surface holding data is flat, and
        // lift is spent only on things that behave like physical objects — a
        // poster, a film cell, an overlay. A frame of softly shadowed tiles is
        // the generic-dashboard look the whole design system exists to avoid.
        // Depth here comes from the border and the wash-to-sheet tonal step,
        // which is the same way every other panel in the app gets it.
        "relative overflow-hidden rounded-(--frame-panel-radius) border border-(--frame-panel-border-color) bg-(--frame-panel-bg) bg-clip-padding",
        // `fit` sizes the panel to its content; otherwise it grows to fill the frame.
        !fit && "grow",
        "dark:bg-clip-border",
        "px-(--frame-panel-px) py-(--frame-panel-py)",
        className
      )}
      data-slot="frame-panel"
      {...props}
    />
  )
}

function FrameHeader({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      className={cn(
        "flex flex-col gap-(--frame-panel-header-gap) px-(--frame-panel-header-px) py-(--frame-panel-header-py)",
        className
      )}
      data-slot="frame-panel-header"
      {...props}
    />
  )
}

function FrameTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("text-sm font-semibold", className)}
      data-slot="frame-panel-title"
      {...props}
    />
  )
}

function FrameDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("text-muted-foreground text-sm", className)}
      data-slot="frame-panel-description"
      {...props}
    />
  )
}

function FrameFooter({ className, ...props }: React.ComponentProps<"footer">) {
  return (
    <footer
      className={cn(
        "flex flex-col gap-(--frame-panel-footer-gap) px-(--frame-panel-footer-px) py-(--frame-panel-footer-py)",
        className
      )}
      data-slot="frame-panel-footer"
      {...props}
    />
  )
}

export {
  Frame,
  FramePanel,
  FrameHeader,
  FrameTitle,
  FrameDescription,
  FrameFooter,
  frameVariants,
}