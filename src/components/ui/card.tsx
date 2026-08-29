import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * TWO CARDS, ONE FILE.
 *
 * `default` is the raised object — shadow, ring, no border, and the
 * header/content/footer slots that pad themselves. It is what a poster sits in.
 *
 * `flat` is the app's ordinary panel: a border, the theme radius, card colour,
 * and padding on all four sides. It was hand-written sixteen times before it
 * existed, which is how its padding drifted across `p-4`, `p-5`, `p-6` and
 * `p-8`. It carries SURFACE ONLY and no layout beyond a column — a caller that
 * needs a row says so in `className`, because these panels genuinely differ
 * (a standing strip is a row, an announcements rail is a column) and forcing
 * one direction would just move the override somewhere less obvious.
 *
 * `size="sm"` is the rail: a panel in a narrow column, or a tile in a grid of
 * them. Anything spanning the page uses the default.
 */
function Card({
  className,
  size = "default",
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & {
  size?: "default" | "sm"
  variant?: "default" | "flat"
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-variant={variant}
      className={cn(
        "group/card flex flex-col text-card-foreground",
        // No gap and no type size on `flat`: it is a surface, and its twelve
        // callers already own both. Setting them here would silently restyle
        // every panel in the app.
        variant === "flat"
          ? "rounded border bg-card p-(--card-spacing) [--card-spacing:--spacing(5)] data-[size=sm]:[--card-spacing:--spacing(4)]"
          : "gap-(--card-spacing) overflow-hidden rounded-4xl bg-card py-(--card-spacing) text-sm shadow-md ring-1 ring-foreground/5 [--card-spacing:--spacing(6)] has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(4)] dark:ring-foreground/10 *:[img:first-child]:rounded-t-4xl *:[img:last-child]:rounded-b-4xl",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1.5 rounded-t-4xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("font-heading text-base font-medium", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-4xl px-(--card-spacing) [.border-t]:pt-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
