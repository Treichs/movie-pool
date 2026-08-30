/**
 * THE SIGN-UP INK PANE — the content half of the shell's `field` variant at
 * `inkLayout="strip"`: a left-aligned column down ONE perforated edge, which is
 * what board 1.2 draws and the reason the `strip` layout exists beside `cell`.
 *
 * ── WHY THIS PANE CARRIES THE GAME AND `/login`'s CARRIES THE FORMULA ─────
 * `/login` is for someone who already knows what this is; its pane spends two
 * lines on the scoring rule as a reminder. This is the ONE screen a person who
 * has never played reads before committing an email address, so it is the one
 * place the game is explained rather than referenced. It is onboarding, not
 * decoration — which is why it is three beats and not a tagline.
 *
 * ── VERMILION BUDGET ON THIS SURFACE ──────────────────────────────────────
 * The wordmark and the three numerals, all `--nav-primary`, all on `--nav`.
 * The paper pane beside it spends zero. `--primary` would be 3.80:1 here and
 * `--nav-primary` is 3.42:1 on paper: the two reds are one accent at two
 * lightnesses, and neither is legible on the other's ground.
 *
 * ── THE NUMBERS ARE THE RULEBOOK'S DEFAULTS, NOT INVENTED ─────────────────
 * $100 is `season_settings`' default bankroll, marked [Configurable] there;
 * this page has no league to read a real one from, so the default is the only
 * honest thing to print, and it is the number the landing page already prints.
 * Beat 02 deliberately does NOT name a tier count: "top distinct amounts" is
 * true at any `top_n_distinct`, while "the top three" is false in a league that
 * changed it.
 */
const BEATS: { n: string; title: string; body: React.ReactNode }[] = [
  {
    n: "01",
    title: "You get $100 for the season",
    body: "Never replenished. Spend it across twenty-odd weekends however you like.",
  },
  {
    n: "02",
    title: "Bid blind on the week’s films",
    body: "Nobody sees anybody’s bid until the deadline passes. Top distinct amounts own the film — ties and all.",
  },
  {
    n: "03",
    title: "Monday morning, it scores",
    body: (
      <>
        Opening box office in millions, times the{" "}
        {/* A registered mark, and not ours to have auto-translate mangle. */}
        <span translate="no">Tomatometer</span>. Every owner earns the full
        score.
      </>
    ),
  },
];

export function SignUpInk() {
  return (
    <>
      <span className="type-display text-h2 text-nav-primary">
        The Movie Pool
      </span>

      {/* NOT AN `<ol>`, though it is numbered. Nothing here is a step to
          perform — the order is the game's, not the reader's — and a list would
          have a screen reader announce "1 of 3" over a numeral it is already
          reading. The numerals are display type carrying the pane's accent. */}
      <div className="flex flex-col gap-8">
        {BEATS.map((beat) => (
          <div key={beat.n} className="flex items-start gap-5">
            <span aria-hidden className="type-numeral text-h1 text-nav-primary">
              {beat.n}
            </span>
            <div className="flex flex-col gap-1">
              <span className="type-h3 text-h3">{beat.title}</span>
              <p className="type-dek text-ui text-nav-muted-foreground">
                {beat.body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
