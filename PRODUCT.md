# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Players** — friends in a private league who know each other and know the game. Their
job is a weekly one: look at the films opening this weekend, decide which are worth
owning, and get sealed bids in before the deadline. They do this on a phone as often as
a laptop, frequently in the last hour before bids close.

**Commissioners** — a league has at least one and may have several. A commissioner is a
player with extra duties, not a separate class of user: they build each week's slate,
record final box office and Tomatometer, and manage dues and payouts. They run the week
from a desktop. They see no more of a sealed bid than any other player.

Phone and desktop are both first-class, for different screens: bidding is a phone job,
running a week is a desktop job.

## Product Purpose

The Movie Pool replaces a season-long Excel workbook that one commissioner maintained by
hand, with all the failure that implies — bids mailed in, a commissioner who could read
every amount before placing their own, standings recalculated manually, and no history
anyone else could see.

Players spend a fixed fake bankroll bidding for ownership of films opening each weekend.
Owned films score `opening box office ($M) × (Tomatometer / 100)`. Most cumulative points
at the end of the season wins.

Success is a season that runs itself: the week opens, closes at its deadline, reveals
every bid at once, and the next week opens — without anyone chasing anyone.

## Positioning

**Blind sealed bidding that is actually blind.** While a week is open, nobody sees any
bid amount, who bid, or even how many bids a film has drawn — including the commissioner,
who also plays. Everything unseals together at the deadline. This is enforced by the
database (row-level security), not by convention, and it is the thing the email-and-
spreadsheet version could never honestly offer.

Two further commitments follow from it: **money and standings are derived, never stored**,
so no number on any screen can drift from the bids that produced it; and **the deadline is
final** — there is no late bid, nothing held or queued.

## Operating Context

The season is the unit of play: a league runs one season at a time, back to back, each
3–4 months. Within a season the rhythm is weekly and self-driving — the commissioner sets
one timing rule (the day and time bids are due) and everything else follows. A week closes
itself at its deadline, reveals all amounts, and immediately opens the next.

The commissioner's own loop runs alongside it: build the slate from films opening that
weekend (their judgement, informed by the TMDB catalogue, not enforced by a setting), then
after the weekend record box office and Tomatometer at a fixed capture time — Monday
morning — so a moving Tomatometer cannot be gamed. Recording results never holds up the
next week's bidding.

Outside the week: dues and payouts are tracked per season, announcements carry league
news, and scheduled mail warns players 24 hours before a deadline and tells them when a
week settles.

## Capabilities and Constraints

**Terminology that must not drift.** Slate (the week's eligible films) · sealed bid ·
winning tiers (the top N distinct dollar amounts, default 3, set per season) · bankroll
($100 by default, never replenished) · Tomatometer · settled (a week whose bids are
revealed and results recorded).

**Rules the interface has to make true, not merely describe:**
- A $0 bid is legal and never wins — it is how a player who has spent their bankroll
  stays in a week rather than disappearing from it.
- A player's *total* bids in one week may never exceed their remaining budget, so they can
  always afford everything they might win.
- Ties are honored, so a film can have more owners than there are winning tiers.
- Every owner receives the full score; ownership is never a divided stake.
- A film removed from the roster scores for no one and refunds every bid in full.

**Technical constraints.** Next.js App Router on React Server Components; Supabase
Postgres with RLS as the enforcement layer; every write goes through a `SECURITY DEFINER`
SQL RPC. The route set is settled at 26 pages plus 4 route handlers, documented in
[Docs/ia-screen-map.md](Docs/ia-screen-map.md), and addresses follow a fixed shape:
plural collections, singular items, never more than two levels deep, every truncation
landing on a real page.

**The rulebook is the source of truth**
([Docs/movie_pool_official_rules.md](Docs/movie_pool_official_rules.md)). If a rule
question is not answered there, it is surfaced, never invented.

**Open product decision.** The product is built for one league now, but nothing may
hard-code that: a second league must work on day one, and a public signup path is a later
step rather than a discarded one. Whether the landing page eventually does real
acquisition work is undecided.

## Brand Commitments

The name is **The Movie Pool**. Nothing else in the identity has been declared binding.

## Evidence on Hand

Real historical seasons are imported — Seasons 31, 32 and 33 (14, 19 and 18 weeks) with
their actual bids, scores and standings. Records, history and standings screens can show
truth rather than placeholder numbers, and should.

Films, posters and release dates come from the TMDB catalogue; every film in the system is
a real film. Tomatometer suggestions are polled from OMDb.

`npm run seed:dev` maintains persistent dev fixtures for local work; those are development
data, not evidence, and nothing shown to a real player should originate there.

No testimonials, customers, press, pricing or user counts exist. None may be fabricated.

## Product Principles

1. **Secrecy is the product.** Any screen, hover, count or loading state that leaks who
   bid, how much, or how many bids exist while a week is open is a defect, not a polish
   item.
2. **The week runs itself.** The interface should make the current state of the week
   obvious without anyone asking a commissioner. Where the rules automate something,
   nothing in the UI may imply a human still has to do it.
3. **Derived numbers, shown as derived.** Standings, budgets and scores are computed from
   bids. Where a number could surprise someone, the screen should be able to show the
   arithmetic behind it.
4. **The commissioner is a permission, not a place.** Commissioner actions appear in
   context on the screen they belong to, gated by role — never in a separate admin area.
5. **Bidding is a phone job; running a week is a desktop job.** Each screen is designed
   for the device it is actually used on, not for one canvas with the other tolerated.

## Accessibility & Inclusion

WCAG AA is enforced, not aspired to: `npm run a11y:contrast` sweeps the theme in both
light and dark modes and fails the build on a violation. Control boundaries meet the 3:1
requirement of WCAG 1.4.11 through a dedicated `--edge` token, separate from the
decorative panel `--border`.
