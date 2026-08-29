"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * THE FRAME EVERY SEGMENT'S `error.tsx` RENDERS.
 *
 * Next.js requires an `error.tsx` per route segment — that part is not a
 * choice. What was a choice was writing the same forty lines thirteen times,
 * and they had already begun to disagree: one copy styled its heading, one
 * styled its paragraph, eleven did neither.
 *
 * ── THE COPY IS THE PART THAT SHOULD DIFFER, AND IT STAYS WITH THE SEGMENT ──
 * "You are not signed in" is worth saying on sign-in and nowhere else. Sharing
 * the frame is what protects that: nobody has to re-derive the layout to change
 * a sentence.
 *
 * `console.error` lives here rather than in each boundary because it is the one
 * thing every copy did identically and the one thing easiest to forget.
 */
export function ErrorScreen({
  error,
  reset,
  title,
  children,
  back,
  resetLabel = "Try again",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title: string;
  /** What is safe. Every screen promises something different, and a boundary
   *  that promises nothing is worse than no boundary. */
  children: React.ReactNode;
  back?: { href: string; label: string };
  /** Only the create-league wizard overrides this: retrying there means
   *  retyping four steps, and "try again" undersells that. */
  resetLabel?: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-svh max-w-measure-default flex-col justify-center px-6 py-12">
      <h1>{title}</h1>
      <p className="mt-3 text-muted-foreground">{children}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="ink" onClick={reset}>
          {resetLabel}
        </Button>
        {back && (
          <Button
            variant="outline"
            render={<Link href={back.href} />}
            nativeButton={false}
          >
            {back.label}
          </Button>
        )}
      </div>
    </main>
  );
}
