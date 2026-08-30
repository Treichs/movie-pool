/**
 * A WEEK, START TO FINISH — five beats, which is one more than the landing
 * page's four. The landing sells and stops at "it scores"; this explains, so it
 * separates the deadline from the reveal, which is the beat people ask about.
 *
 * ── THE NUMERALS TAKE `--primary`, NOT THE BOARD'S VERMILION ──────────────
 * Board 2.1 draws them `#EB4B37` on a paper panel, which is 3.42:1 and fails.
 * That red is the INK-side accent; on paper the same accent is `--primary`
 * (#C52F1B, 5.04:1). One accent, two lightnesses, and the ground picks.
 *
 * ── THE $0 BID IS IN BEAT 02 BECAUSE THE RULEBOOK PUTS IT FIRST ───────────
 * §"Bidding" makes it explicit: a $0 bid is legal and never wins, and it exists
 * so a player who has spent their bankroll can still take part in a week. The
 * board says only "$1 minimum", which is true of non-zero bids and silent about
 * the one people are surprised by.
 */
const BEATS = [
  {
    n: "01",
    title: "The slate goes up",
    body: "Your commissioner posts the films opening wide this Friday.",
  },
  {
    n: "02",
    title: "You bid, sealed",
    body: "Whole dollars, $1 minimum, one bid per film, as many films as you like — or $0, which says you looked and passed at any price. Nobody sees anything.",
  },
  {
    n: "03",
    title: "The deadline passes",
    body: "Every bid opens at once. The top distinct amounts take ownership.",
  },
  {
    n: "04",
    title: "The films open",
    body: "You watch the weekend numbers like they are yours. Because they are.",
  },
  {
    n: "05",
    title: "Monday it scores",
    body: "Box office times Tomatometer, and the standings move.",
  },
];

export function WeekBeats() {
  return (
    <section className="flex flex-col gap-6">
      <h2>A week, start to finish</h2>
      {/* Five across on a wide screen, and it degrades by halving rather than
          by squeezing: five 200px columns are unreadable long before the
          viewport is narrow enough to notice. */}
      <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {BEATS.map((beat) => (
          <li
            key={beat.n}
            className="flex flex-col gap-2.5 rounded border bg-card p-5"
          >
            <span
              aria-hidden
              className="type-numeral text-h1 leading-none text-primary"
            >
              {beat.n}
            </span>
            <h3 className="type-h3 text-h3">{beat.title}</h3>
            <p className="type-body text-ui text-muted-foreground">
              {beat.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
