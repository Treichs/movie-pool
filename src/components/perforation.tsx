/**
 * ONE PERFORATION — the film-edge shape, and the only place its geometry lives.
 *
 * It was private to `auth-split-shell` until the landing hero needed the same
 * edge (Task 1.1). That file's own docblock says "do not invent a second
 * perforation rhythm somewhere else", so the primitive moved out rather than
 * being copied: rule 1 — a component moves to `src/components/` the first time
 * a SECOND route needs it.
 *
 * The geometry is the brand mark's own, `26x34` at `rx 7`, which is
 * `w-6.5 h-8.5 rounded-perf`. `--radius-perf` is the one corner in the app not
 * derived from `--radius`, because a perforation that squared itself when the
 * corner language was retuned would be a bug.
 *
 * DECORATIVE. It carries no `aria-hidden` of its own — the COLUMN that repeats
 * it does, because nine identical shapes announced individually would be nine
 * pieces of noise ahead of the real content.
 */
export function Perforation() {
  return (
    <div
      data-slot="perforation"
      className="h-8.5 w-6.5 rounded-perf bg-nav-foreground/88"
    />
  );
}
