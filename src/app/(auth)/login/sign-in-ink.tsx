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
 * Exactly ONE element: the wordmark, and it takes `--nav-primary` rather than
 * `--primary`. They are one accent at two lightnesses: the paper-side red
 * (#C52F1B) is 3.80:1 here and would fail, while the ink-side red (#EB4B37) is
 * 5.59:1 on this ground and fails on paper. The pane is `--nav`, so it takes
 * the ink-side value. The paper pane beside it spends zero, so the page spends
 * one.
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
        <span className="type-eyebrow text-eyebrow text-nav-primary">
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
