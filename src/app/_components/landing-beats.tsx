/**
 * FOUR BEATS — the shape of a week, and the board is emphatic that there are
 * FOUR of them and no worked example. This sells; `/how-it-works` explains.
 * Adding a fifth beat or a number here creates a second place to maintain the
 * rules, and the rulebook is already the source of truth.
 *
 * ── IT IS AN ORDERED LIST BECAUSE THE ORDER IS THE CONTENT ────────────────
 * `<ol>` carries the sequence to a screen reader, which is why the drawn
 * numerals are `aria-hidden`: with both, every beat announces its position
 * twice.
 *
 * ── VERMILION ON PAPER, AND WHY THIS ONE IS LEGAL ─────────────────────────
 * `--primary` is a background token because it measures 3.42:1 on `--background`
 * and fails AA for normal text. These numerals are 44px and 800-weight — WCAG
 * large text, where the bar is 3:1. It clears. The contrast gate agrees: it
 * classifies `primary` as a UI pair by standing ruling, so this warns at worst
 * and is not a failure being suppressed.
 */
const BEATS = [
  {
    numeral: "01",
    title: "Your commissioner posts the week’s films",
    body: "Everything opening wide this Friday.",
  },
  {
    numeral: "02",
    title: "You bid, and nobody sees it",
    body: "Sealed until the deadline. Bid on one film or all of them.",
  },
  {
    numeral: "03",
    title: "The top bids take ownership",
    body: "Several people can own the same film, and each earns its full score.",
  },
  {
    numeral: "04",
    title: "Monday, the weekend scores",
    body: "And you find out whether that $14 was brave or stupid.",
  },
] as const;

export function LandingBeats() {
  return (
    <ol className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
      {BEATS.map((beat) => (
        <li key={beat.numeral} className="flex flex-col gap-2.5">
          <span aria-hidden className="type-numeral text-h1 text-primary">
            {beat.numeral}
          </span>
          <h2 className="type-h3 text-h3 normal-case">{beat.title}</h2>
          <p className="type-body text-ui text-muted-foreground">{beat.body}</p>
        </li>
      ))}
    </ol>
  );
}
