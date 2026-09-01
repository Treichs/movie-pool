"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { RevealFilm } from "@/lib/reveal";

import { RevealFilmRow } from "./reveal-film";

/**
 * THE RE-RANK — the sheet held in both of its orders, and the step between.
 *
 * `reveal.ts` has carried `rankFilmsByScore` since the Monday storyboard was
 * locked, with the beat written into its own comment: "the change of order is
 * itself information", and "pure and non-mutating, so a ceremony can hold both
 * orders at once and step between them". Nothing had ever called it. This is
 * the caller.
 *
 * AS BID is ADR-096's order — spread, then owners, then bidders: what the
 * auction argued about. AS SCORED is what the films actually earned. The gap
 * between the two IS the week's story, and it is a gap you cannot read from
 * either list alone. So the films move, and each one says how far.
 *
 * ── THE CONTROL IS TWO BUTTONS, NOT A TAB LIST ───────────────────────────
 * There is one list here, sorted two ways — not two panels. A tablist would
 * promise a second panel that does not exist, and duplicating the sheet into
 * one would break the animation outright: FLIP measures the SAME nodes moving,
 * and two panels are two sets of nodes. `aria-pressed` on a pair of buttons in
 * a named group is what a sort control actually is.
 *
 * `@shadcn/toggle-group` was the obvious reach and was rejected: it depends on
 * `radix-ui`, and this app is Base UI throughout. A second primitive library
 * for one two-state control is not a trade worth making.
 *
 * The buttons take the DEFAULT control height, not `sm`. 36px is still under
 * the 44px touch guideline — but that is the height DESIGN.md gives every
 * button in the app, and a sort control has no claim to be the one exception.
 * Raising the floor is a system decision, not this component's.
 *
 * ── FLIP, AND WHY THE MEASUREMENT IS IN THE HANDLER ──────────────────────
 * First, Last, Invert, Play. The FIRST measurement has to happen while the old
 * order is still on screen, which is the click handler — by the time a layout
 * effect runs, React has already committed the new order and the old positions
 * are gone. The effect does Last, Invert and Play.
 *
 * REDUCED MOTION NEEDS NOTHING HERE, for the same reason the bars do not: the
 * transition lives on a class in `globals.css`, and the app's global rule
 * collapses transition-duration to 1ms. The films still move — they simply
 * arrive at once, which is the honest way to honour the preference on a
 * reorder whose whole content is the new order.
 */
type Mode = "bid" | "score";

export function RevealSheet({
  films,
  scoredOrder,
  weekTop,
  leagueId,
}: {
  /** The sheet in ADR-096's bid order. */
  films: RevealFilm[];
  /** The same film ids ranked by what they earned, or null when nothing is
   *  scored yet — an unscored week has only one order to be in. */
  scoredOrder: string[] | null;
  weekTop: number;
  leagueId: string | null;
}) {
  const [mode, setMode] = useState<Mode>("bid");
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const before = useRef<Map<string, number> | null>(null);

  const bidIndex = new Map(films.map((f, i) => [f.filmId, i]));

  // THE ORDERS ONLY DIFFER IF THEY DIFFER. A week where the biggest argument
  // also earned the most has no re-rank to show, and a control that visibly
  // does nothing is worse than no control — the same self-suppression every
  // record on the record shelf performs.
  const reordered =
    scoredOrder !== null &&
    scoredOrder.length === films.length &&
    scoredOrder.some((id, i) => films[i]?.filmId !== id);

  const ordered =
    mode === "score" && scoredOrder
      ? scoredOrder
          .map((id) => films.find((f) => f.filmId === id))
          .filter((f): f is RevealFilm => f !== undefined)
      : films;

  const scoreIndex = new Map(ordered.map((f, i) => [f.filmId, i]));

  const capture = useCallback(() => {
    const map = new Map<string, number>();
    nodes.current.forEach((el, id) => map.set(id, el.getBoundingClientRect().top));
    before.current = map;
  }, []);

  useLayoutEffect(() => {
    const prev = before.current;
    if (!prev) return;
    before.current = null;

    const moved: HTMLDivElement[] = [];
    nodes.current.forEach((el, id) => {
      const wasTop = prev.get(id);
      if (wasTop === undefined) return;
      const dy = wasTop - el.getBoundingClientRect().top;
      if (dy === 0) return;
      // INVERT: put it back where it was, with no transition, so the browser
      // has nothing to animate yet.
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;
      moved.push(el);
    });
    if (moved.length === 0) return;

    // PLAY on the next frame: clearing both properties hands the transition
    // back to the class, which is what the reduced-motion rule can reach.
    const id = requestAnimationFrame(() => {
      for (const el of moved) {
        el.style.transition = "";
        el.style.transform = "";
      }
    });
    return () => cancelAnimationFrame(id);
  }, [mode]);

  const switchTo = (next: Mode) => {
    if (next === mode) return;
    capture();
    setMode(next);
  };

  return (
    <>
      {reordered && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div
            role="group"
            aria-label="Sort the reveal"
            className="flex items-center gap-2"
          >
            <Button
              variant={mode === "bid" ? "ink" : "outline"}
              aria-pressed={mode === "bid"}
              onClick={() => switchTo("bid")}
            >
              As bid
            </Button>
            <Button
              variant={mode === "score" ? "ink" : "outline"}
              aria-pressed={mode === "score"}
              onClick={() => switchTo("score")}
            >
              As scored
            </Button>
          </div>
          {/* The order is a visual fact, so it is also stated for anyone who
              cannot see the films move. */}
          <p aria-live="polite" className="type-body text-micro text-muted-foreground">
            {mode === "bid"
              ? "Ordered by the argument each film produced."
              : "Ordered by what each film earned."}
          </p>
        </div>
      )}

      {ordered.map((film, i) => (
        <div
          key={film.filmId}
          ref={(el) => {
            if (el) nodes.current.set(film.filmId, el);
            else nodes.current.delete(film.filmId);
          }}
          className="reveal-flip"
        >
          <RevealFilmRow
            film={film}
            weekTop={weekTop}
            index={i}
            move={
              mode === "score" && reordered
                ? (bidIndex.get(film.filmId) ?? 0) -
                  (scoreIndex.get(film.filmId) ?? 0)
                : null
            }
            leagueId={leagueId}
          />
        </div>
      ))}
    </>
  );
}
