/**
 * ONE FILM, WORKED THROUGH — the arithmetic done once, in real numbers,
 * including the tie. Showing it beats stating it: "more owners than tiers" is
 * the rule people get wrong, and six owners from three tiers is unarguable.
 *
 * ── THE NUMBERS ARE THE RULEBOOK'S OWN, NOT THE BOARD'S ───────────────────
 * Board 2.1 works through *Wicked: For Good* at $68.2M and 72%. Those figures
 * are invented, and attaching invented box office to a real film on a public
 * page states something untrue about a real release. The rulebook already
 * carries a worked example built for this purpose — "Backrooms", bids of $11,
 * $8, $6, $6, $6, $6, opening $81.4M at an 89% Tomatometer — so this page uses
 * it. It cannot contradict the rulebook, because it IS the rulebook, and its
 * tie is more emphatic than the board's: six owners, three tiers.
 *
 * 81.4 × 0.89 = 72.446, which the rulebook rounds to 72.45.
 */
const BIDS = [
  { amount: "$11", won: true },
  { amount: "$8", won: true },
  { amount: "$6", won: true },
  { amount: "$6", won: true },
  { amount: "$6", won: true },
  { amount: "$6", won: true },
  { amount: "$4", won: false },
  { amount: "$2", won: false },
  { amount: "$1", won: false },
];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="type-eyebrow text-eyebrow text-muted-foreground">
        {label}
      </span>
      <span className="type-numeral text-h2">{value}</span>
    </div>
  );
}

export function WorkedExample() {
  return (
    <section className="flex flex-col gap-5">
      <h2>One film, worked through</h2>

      <div className="flex flex-col gap-5 rounded border bg-card p-6">
        <div className="flex flex-col gap-0.5">
          <h3 className="type-h3 text-h3">Backrooms</h3>
          <p className="type-ui text-ui text-muted-foreground">
            Opened wide, on a three-tier season — the default
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="type-eyebrow text-eyebrow text-muted-foreground">
            Nine sealed bids came in
          </span>
          {/* NOT A LIST, and the amounts are not links or controls — it is one
              sentence of data set as chips. The line below says what the
              highlighting means, so the styling is never the only carrier. */}
          <div className="flex flex-wrap items-end gap-1.5">
            {BIDS.map((bid, i) => (
              <span
                key={i}
                className={`type-numeral rounded-xs px-2.5 py-1 text-ui ${
                  bid.won
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {bid.amount}
              </span>
            ))}
          </div>
          <p className="type-body text-ui text-muted-foreground">
            The three highest distinct amounts are $11, $8 and $6 — so{" "}
            <strong className="text-foreground">six</strong> people own it. The
            four at $6 all tie into the third tier.
          </p>
        </div>

        <hr className="border-border" />

        <div className="flex flex-wrap items-end gap-5">
          <Stat label="Opening ($M)" value="81.40" />
          <span aria-hidden className="type-numeral pb-1 text-h3 text-muted-foreground">
            &times;
          </span>
          <span className="sr-only">multiplied by</span>
          <Stat label="Tomatometer 89%" value="0.89" />
          <span aria-hidden className="type-numeral pb-1 text-h3 text-muted-foreground">
            =
          </span>
          <span className="sr-only">equals</span>
          <div className="flex flex-col gap-1">
            <span className="type-eyebrow text-eyebrow text-muted-foreground">
              Each owner scores
            </span>
            <span className="type-numeral text-h1">72.45</span>
          </div>
        </div>

        <p className="type-body text-ui text-muted-foreground">
          All six of them. The $11 bidder and the $6 bidders earn the same
          72.45 — the $6 bidders just got it cheaper, which is what
          points-per-dollar measures.
        </p>
      </div>
    </section>
  );
}
