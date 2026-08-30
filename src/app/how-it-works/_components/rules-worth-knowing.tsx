/**
 * THE RULES THAT SURPRISE PEOPLE, and the anchor the app links to.
 *
 * `id="faq"` is load-bearing: `/leagues` links here as `/how-it-works#faq`, so
 * this section carries it even though the board does not draw an id. If this
 * section is ever renamed or split, the anchor moves with it or that link
 * silently scrolls nowhere.
 *
 * ── TWO CORRECTIONS TO THE BOARD, BOTH FROM THE RULEBOOK ──────────────────
 * The plan's own instruction is that where the board and the rulebook
 * disagree, the rulebook wins.
 *
 * 1. THE TIER COUNT IS A DEFAULT, NOT A RULE. The board says "the top three
 *    distinct amounts" twice, flat. It is `season_settings.top_n_distinct`,
 *    3 by default, fixed per season and [Configurable]. This page is public and
 *    has no season in scope, so it may name three only as the default — which
 *    is how both mentions are now worded.
 *
 * 2. THERE IS NO LIMITED-RELEASE SETTING. The board says "Some leagues opt
 *    limited releases in." The rulebook is explicit that there is "no
 *    eligibility setting" — wide release is the commissioner's per-film
 *    judgement when they build the slate, and the screen-count threshold that
 *    once existed was retired. What survives is the refund path, which is what
 *    this rule now describes.
 */
const RULES = [
  {
    title: "$100 for the whole season. Never topped up.",
    body: "Twenty-odd weekends, one bankroll. Spending big in October is a real choice.",
    muted: false,
  },
  {
    title: "Several people can own the same film.",
    body: (
      <>
        Ownership goes to everyone who bid one of the top distinct amounts —
        three of them by default — and each owner earns the film&apos;s{" "}
        <strong className="text-foreground">full</strong> score. Nothing is
        split.
      </>
    ),
    muted: false,
  },
  {
    title: "Ties are honoured, so a film can have more owners than tiers.",
    body: (
      <>
        Three <em>distinct amounts</em>, not three people. Two players at $6
        both win that tier.
      </>
    ),
    muted: false,
  },
  {
    title: "You pay your own bid, not the next one down.",
    body: "Bid $11, pay $11 — even if the tier below you was $6.",
    muted: false,
  },
  {
    title: "Wide releases only, and that is a judgement call.",
    body: "Your commissioner decides film by film whether something opened wide. A film later judged not to have is removed, scores for nobody, and every bid on it is refunded in full.",
    muted: true,
  },
];

export function RulesWorthKnowing() {
  return (
    <section id="faq" className="flex flex-col gap-5">
      <h2>The rules worth knowing</h2>
      <dl className="flex flex-col gap-5">
        {RULES.map((rule) => (
          <div
            key={rule.title}
            // The last rule is bordered in `--edge` rather than ink: it is the
            // exception rather than the game, and the board de-emphasises it
            // the same way.
            className={`flex flex-col gap-1.5 border-l-4 pl-4 ${
              rule.muted ? "border-edge" : "border-foreground"
            }`}
          >
            <dt className="type-h3 text-h3">{rule.title}</dt>
            <dd className="type-body text-ui text-muted-foreground">
              {rule.body}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
