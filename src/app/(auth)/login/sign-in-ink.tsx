/**
 * THE SIGN-IN INK PANE — the content half of the shell's `field` variant at
 * `inkLayout="cell"`: content centred, BOTH edges perforated, which is what the
 * board draws and the reason the `cell` variant exists.
 *
 * It takes no data and awaits nothing — static brand furniture — so a loading
 * state can render the REAL pane rather than a grey half-screen standing in for
 * one, and the ink side then does not change at all on swap-in.
 *
 * ── VERMILION BUDGET ON THIS SURFACE ──────────────────────────────────────
 * Exactly ONE element: the wordmark. `--primary` is a background almost
 * everywhere because it is 3.42:1 as text on paper — but this pane is `--nav`,
 * a permanently-ink surface in both modes, where the same red is 5.57:1 and
 * legal as text. The paper pane beside it spends zero, so the page spends one.
 */
export function SignInInk() {
  return (
    <>
      <div className="flex flex-col items-center gap-5">
        {/* DECORATIVE. The wordmark underneath names the app in full; a screen
            reader announcing "T M P" and then "The Movie Pool" is the same fact
            twice, in the wrong order. */}
        <span aria-hidden className="type-display text-display">
          TMP
        </span>
        <span className="type-eyebrow text-eyebrow text-primary">
          The Movie Pool
        </span>
      </div>

      <div className="flex max-w-measure-tight flex-col items-center gap-1.5 text-center">
        <span className="type-eyebrow text-eyebrow text-nav-muted-foreground">
          The scoring rule, entire
        </span>
        <p className="type-h3 text-h3">
          Opening box office ($M) ×{" "}
          {/* A registered mark, and not ours to have auto-translate mangle. */}
          <span translate="no">Tomatometer</span>
        </p>
      </div>
    </>
  );
}
