---
status: canon
mode: reference
owns: How the game is played and scored
supersedes: none
---

# The Movie Pool — Official Rules
 
*Canonical rulebook. This document is the single source of truth for how the game is played and scored. The application must adhere to and enforce every rule described here. Values marked **[Configurable]** are set by the commissioner in the application's rules engine rather than hard-coded.*
 
---
 
## 1. Overview
 
The Movie Pool is a season-long competition in which players use a fixed budget of fake money to bid for ownership of films opening on the upcoming weekend. Owned films earn points based on their opening-weekend box office and their Rotten Tomatoes score. The player with the most total points at the end of the season wins.
 
- **Players:** any number. The game does not depend on a particular roster size — how many people play is a fact about a league, not a rule of the game.
- **Commissioner:** runs the pool — sets the slate, resolves bids, and records results. A league has **at least one** commissioner and may have **several**. **The commissioner also plays** — they bid and score like any other player, and see no more of a sealed bid than anyone else.
- **Season length:** variable, and chosen by the commissioner **when the season is created**. It is fixed for that season once set. Generally 3–4 months. **[Configurable]**
- **One season at a time.** A league runs a single season at once; the next begins after the current one ends. Seasons therefore run **back to back**, not once a year — Seasons 31, 32 and 33 ran September–December, December–April and April–August, each starting the week after the last one finished.
- **Currency:** Fake dollars. No real money changes hands for gameplay.

> **Rule change — 2026-08-12. What §1 said about the pool, versus the game.**
>
> **What it was:** "Players: 10 (the current roster)"; "One person runs the pool"; and "Season length: variable, generally 3–4 months (historically ~18 weeks, late April through August)".
>
> **What it is now:** the roster size is a league fact rather than a rule; a league may have more than one commissioner; season length is variable and set per season at creation; and a league runs one season at a time, back to back.
>
> **Why:** each of the three was a description of *this* pool at a moment in time, written as though it were a rule of the game. The historical parenthetical was wrong twice over — the ingested workbooks show seasons of **14, 19 and 18 weeks**, and the pool runs continuously rather than annually, so "late April through August" describes one season out of three. Multiple commissioners were decided separately and enforced by the app from 2026-08-08 — never self-granted, and never allowed to reach zero — but the rulebook had nowhere saying so, and §1 still said "one person". This line is now the only statement of it in the rulebook, which is where it belongs.
---
 
## 2. The Budget
 
- Every player begins the season with a bankroll of **$100**. **[Configurable]**
- The budget is for the **entire season** and is **never replenished or reset**.
- Money is spent only by winning films (see Bidding). A player's spent dollars plus remaining dollars always equal their starting bankroll.
- A player may never bid more money than they currently have remaining. When bidding on multiple films in one week, this cap applies to the **sum** of those bids (see §4).
---
 
## 3. Film Eligibility (The Slate)
 
Each week the commissioner publishes the **slate**: the films opening that weekend that are eligible to be bid on.
 
- **Release type:** A film belongs on the slate if it is opening in **wide release** that weekend. This is the commissioner's judgement, not a setting: they build the slate week by week, and the release dates and types the film catalogue carries are there to inform that judgement, not to enforce it.
- **Reclassified films:** A film placed on the slate and later judged not to have been a real wide opening — a title billed as a wide release that in fact opened limited, say:
  - The film is **removed from the roster** (it scores for no one).
  - Every player who won it has their **bid fully refunded** to their budget.
- Box office and Tomatometer are not evaluated for a removed film.

> **Rule change — 2026-08-03. Eligibility moved from screen count to release type.**
>
> **What it was:** eligibility was a **screen-count threshold** — only films opening on **1,000 or more screens** were eligible, the number was configurable per league, and a film whose count was unconfirmed could be bid on and was refunded later if it came in under the line. The commissioner recorded a screen count on every film.
>
> **What it became:** eligibility is the film's **release type** — wide by default, with an optional per-league toggle to include limited releases as well. Screen counts are recorded nowhere: not on a film, not in league settings. *(The toggle was itself removed two days later — see the next note.)*
>
> **Why:** no data source available to the app reports screen counts. TMDB does not carry the figure, so every count was hand-entered by the commissioner from an outside source, for a threshold the app then enforced against that same hand-entered number. Release type, by contrast, *is* supplied — TMDB distinguishes theatrical-wide from theatrical-limited, and the film catalogue already stores both dates. The new rule enforces the same intent (a real theatrical opening, not a platform release) against a value the app can actually verify.
>
> **What carries over unchanged:** the refund path. A film that turns out not to belong on the slate is still removed and still refunds every bid in full — only the test for "belongs" has changed.

> **Rule change — 2026-08-05. Eligibility stopped being a setting at all.**
>
> **What it was:** the rule above, with a **per-league toggle** to include limited releases alongside wide ones.
>
> **What it is now:** there is **no eligibility setting**. Wide release remains the standard, but it is applied as the commissioner's per-film judgement when they build the slate and again when they enter final box office — not as a configured rule the app enforces.
>
> **Why:** the toggle had no honest enforcement behind it. Nothing in the app ever tested a film against it; every film added to a slate was marked eligible regardless, and the commissioner was already exercising the judgement by hand. A setting that changes nothing is worse than no setting, because it implies a guarantee the game does not make.
>
> **What carries over unchanged:** the refund path again. A film that should not have been on the slate is removed and refunds every bid in full.

**Adding films mid-season:** The slate is not fixed when the season begins. The commissioner may add films to the season **at any point during the season** — as release schedules firm up, or as titles are announced — but only ever **forward**, to a week whose bidding has not yet closed. A film is always added to the week in which it is scheduled to open.

Concretely, a week accepts new films while it is still being built *or* while bidding is open — the latter so a **late-announced wide release** can still join the weekend it actually opens on. Once bidding closes, the week's slate is final: films can never be added retroactively to a week that has been closed, resolved, or scored. Those weeks are history.

**Commissioner removal (any reason):** The commissioner may also remove a film from the roster for other reasons (for example, it was added to the season in error). Any removal follows the same flow — the film scores for no one, and every player who bid on or won it is **fully refunded**.
---
 
## 4. Bidding
 
Films are acquired through **blind sealed bids**. What is sealed is the whole bid — the **dollar amount** and the **fact that you bid at all**.
 
- **Bidding is blind, entirely.** While a week is open, no one may see any bid's dollar amount, who has bid on a film, or even how many bids a film has drawn — not other players, and **not the commissioner**. A bid becomes visible to nobody but the player who placed it. Everything unseals at once when the week closes: every amount and every bidder, revealed together.
- **The commissioner is treated exactly like a player.** Although the commissioner resolves bids, they gain no early sight of amounts. This replaces the pool's earlier email-workflow arrangement, under which bids were mailed to the commissioner and a commissioner who also played could read every amount before placing their own.
- Bids are submitted before the weekly deadline. The deadline is **enforced by the application and is final**: at the deadline the week closes itself, every amount is revealed, and no further bid is accepted for that week (see OQ-3). **[Configurable deadline]**
- **There is no late bid.** A player who has not bid on a film by the deadline does not own it. Nothing is held, queued, or accepted afterwards — missing the deadline costs the week, not the season.
- **The weekly rhythm runs itself.** The commissioner sets **one** timing rule for the league: the **day and time bids are due**. **[Configurable]** Everything else follows from it:
  - The season's **first** release week opens for bidding the moment the season becomes active.
  - Every week **closes automatically** at its bid deadline, revealing all amounts.
  - A week closing **immediately opens the next** release week for bidding, so long as that week's slate carries at least one eligible film. If it does not yet, it opens as soon as one is added.

  The commissioner may close a week **early** — once everyone is in, there is no reason to wait — but cannot extend one past its deadline. Recording results (resolving winners and capturing scores) stays a commissioner act and **never holds up the next week's bidding**.
- **One bid per film.** A player may bid on **as many different films** in the week's slate as they wish.
- **Whole dollars only. Minimum bid $1** **[Configurable]** — no fractional bids.
- **A $0 bid is legal, and never wins.** Zero means "in for nothing": it records that a player looked at the film and declined it at any price, and it is never a winning amount no matter how few others bid. This exists so a player who has spent their bankroll can still take part in a week rather than disappearing from it. Any *non-zero* bid must clear the minimum — in a $1-minimum season the legal amounts are $0 or $1 and up.
- A player cannot bid more than their remaining budget. **Total weekly exposure is capped:** the **sum of all of a player's bids in a week may not exceed their remaining budget**, so they can always afford every film they might win (this resolves OQ-1). Because money is spent only on films actually won, bids that lose cost nothing and are never deducted.
### 4.1 Determining Winners
 
For each film, ownership is decided by the **highest distinct bid values**. How many of them win — the number of **winning tiers** — is **3** by default. **[Configurable]**
 
1. Rank all submitted bids for the film from highest to lowest.
2. Identify the **top N distinct dollar amounts**, where N is the season's number of winning tiers (default 3).
3. **Every player** who bid one of those amounts wins a share of ownership. Ties are honored, so a single film may have **more owners than there are tiers**.
**Fewer bidders than tiers:** If fewer players bid on a film than there are winning tiers, all of them win it. There is no minimum number of bidders required for a film to be owned.
 
The number of tiers is a property of a **season**, fixed when the season is created, alongside the bankroll and the minimum bid. It is not a property of a league — a league may run consecutive seasons on different numbers.
 
**Worked example — "Backrooms" (3 tiers, the default):**
Winning bids were $11, $8, $6, $6, $6, $6. The three highest distinct values are **$11, $8, $6**. All six players who bid those amounts win the film — the four at $6 tie into the winning pool.
 
> **Rule change — 2026-08-12. The number of winning tiers is configurable per season.**
>
> **What it was:** three, stated flatly, as a fixed rule of the game.
>
> **Why it changed:** the application has carried a per-season `top_n_distinct` setting since seasons acquired their own settings — the commissioner's season form edits it, and the House rules panel and league admin panel have always rendered it. The rulebook and the schema therefore disagreed about whether this was a rule or a setting, and a rulebook that disagrees with the running code is not a source of truth. Marking it **[Configurable]** resolves the divergence in the direction the application already took, and matches how bankroll, minimum bid, season length and the bid deadline are already treated.
>
> **What this does not change:** the default is still 3, which is what the pool has always played and what every historical season was scored under. Ties still honor, fewer bidders than tiers still all win, and each winner still pays their own bid.
 
### 4.2 Payment
 
- Each winner **pays their own bid amount**, deducted from their remaining budget.
- In the Backrooms example: the $11 bidder pays $11, the $8 bidder pays $8, and each $6 bidder pays $6.
---
 
## 5. Ownership
 
- A film can be owned by **multiple players simultaneously**.
- Ownership is independent: each owner holds the film in full and earns its full score. Ownership is **not** a divided or shared stake.
---
 
## 6. Scoring
 
Each owned film earns a point score:
 
```
Score = Opening Box Office (in $ millions) × Tomatometer (as a decimal)
```
 
- **Box Office:** Domestic opening-weekend gross, expressed in millions of dollars. Whether **preview / early-access showings are included**, and the **weekday previews start counting from** (e.g. Monday, Tuesday, Wednesday, or Thursday), are set by the commissioner. **[Configurable definition]**
- **Tomatometer:** The Rotten Tomatoes critic score, converted to a decimal (e.g. 89% → 0.89).
- **Every owner** of a film receives the **full score** — the score is not split among owners.
**Example:** Backrooms opened to $81.4M with an 89% Tomatometer → 81.4 × 0.89 = **72.45 points**, awarded in full to each of its owners.
 
### 6.1 Score-Capture Timing
 
Because the Tomatometer changes over time, the score is locked in at a **fixed capture time** rather than whenever it is convenient.
 
- Current rule: **Monday morning after the film's opening weekend.** **[Configurable]**
- Both the box office figure and the Tomatometer are recorded as of this capture time.
---
 
## 7. Winning the Season
 
- The season winner is the player with the **highest cumulative total points** across all weeks.
- Total points is the sole determinant of the champion.
### 7.1 Secondary Metrics & Awards (for fun)
 
These do not decide the champion but are tracked and celebrated:
 
- **Season Efficiency (Points per Dollar):** A player's **total** points divided by their **total** dollars spent, across the whole season. Ranked separately from the points standings. This is a season-long *ranking*, not an award, and it is a different measurement from the two awards below — which are about a **single film**.

The two awards are the same measurement in opposite directions: **points-per-dollar on one film by one owner** (`film score ÷ what that owner paid for it`). Because a film's full score goes to every owner but each owner pays their own bid, two owners of the same film can post very different figures.

- **Best Efficiency Award:** the **highest** single-film points-per-dollar of the season. **[Configurable]**
- **Dessert Prize:** the **lowest** single-film points-per-dollar of the season — a tongue-in-cheek award for the season's worst pick. **[Configurable]**

Two rules apply to both awards equally:

- **Only bids above the season's minimum qualify.** A bid at the minimum is excluded from consideration for either award. A minimum bid on any halfway decent film would win Best Efficiency almost automatically, which makes the award trivial; excluding it on the Dessert side too keeps the two symmetric, and keeps a $1 flyer — which costs nothing and risks nothing — from counting as the worst decision of the season.
- **Ties split the money equally.** If several owners post the same qualifying figure, the prize (or the penalty) divides evenly among them.

> **Rule change — 2026-08-12. Both awards are now single-film efficiency, and minimum bids do not qualify.**
>
> **What it was:** Best Efficiency was "the single most efficient pick… awarded to whoever won that film at the lowest winning bid", and the Dessert Prize was the **lowest-scoring owned film**. Nothing excluded minimum bids.
>
> **What it is now:** both awards are the best and worst **single-film points-per-dollar**, over bids **above** the season minimum, with ties splitting the money.
>
> **Why:** the two halves were measuring different things, which made them impossible to state as one rule and produced results that did not match the game's own intent. Scoring the Dessert on the lowest-scoring *film* punishes owning a small film cheaply — a $1 flyer that returns almost nothing is not a bad decision, it is a cheap one. Season 31 makes the difference concrete: the lowest-scoring film was *Kiss of the Spider Woman*, owned for $2; but the season's genuinely worst pick was **$28 spent on *Merrily We Roll Along* for 1.24 points**, which the old rule did not even consider. The minimum-bid exclusion is not new in practice — it is what the pool has always done. Season 32's Best Efficiency went to *Crime 101* at $2 (6.04) even though *The Undertone* scored 6.16 on $1 bids, and that is only explicable if minimum bids never qualified.
>
> **What this does not change:** seasons already settled were settled under the old reading and are not reopened. The change applies to seasons scored from here on.
---
 
## 8. Glossary
 
- **Slate:** The set of eligible films opening in a given week.
- **Blind sealed bid:** A bid hidden **in full** from everyone — the commissioner included — until the week closes. Neither the amount, nor the bidder's identity, nor the number of bids a film has drawn is visible to anyone but the bidder while bidding is open. All of it is revealed together at the close.
- **Winning tiers:** How many distinct dollar amounts win a film. **3** by default, set per season (§4.1).
- **Top N distinct bids:** The N highest unique dollar amounts bid on a film, where N is the season's winning tiers; all players at those amounts win.
- **Tomatometer:** Rotten Tomatoes critic score, used as a decimal multiplier.
- **Efficiency:** Points earned per dollar spent.
- **Roster:** The set of films that have been validly owned and are scoring.
---
 
## 9. Open Questions / To Confirm
 
These do not block the rulebook but should be resolved before or during application design:
 
- **OQ-1 — Multi-film budget exposure — RESOLVED:** A player's remaining budget is checked against the **sum of all their bids in a week** (worst-case exposure), so they can always afford every film they might win and can never be over-committed. Money is still deducted only for films actually won; losing bids cost nothing. See §2 and §4.
- **OQ-2 — Bid ties and identical amounts:** Confirmed that identical amounts tie into a winning tier. No further tie-break is applied. (Documented here for the app to enforce as-is unless changed.)
- **OQ-3 — Late or missing bids — RESOLVED (2026-08-02, second revision — supersedes both earlier resolutions):** The weekly deadline is **system-enforced and final**. The deadline *is* the close: at that moment the week locks itself and every amount is revealed, so there is no window in which a late bid could exist and **no late-offer mechanism** (see §4). A missed deadline simply costs that week's films.
  - The first resolution (advisory deadline, manual close as the only gate) applied through Season 33.
  - The second (enforced deadline plus sealed late offers awaiting commissioner acceptance) was written 2026-08-02 and never ran a season. It was withdrawn the same day: late offers only made sense while the deadline was soft *and* the close was manual, and making the close automatic removed both.
- **OQ-4 — Awards / tie-breaks — RESOLVED, and extended 2026-08-12:** When an award has multiple tied recipients, the award's **monetary value is split equally among them** — a positive prize is divided; the Dessert Prize (a negative) splits the penalty across the tied worst-pickers.
  - **Tied paying places consume the places they occupy, and split their combined money.** Two players tied for 1st hold 1st *and* 2nd between them, so they split the first- and second-place money equally and nobody else is paid second; the next player down is **3rd** and takes the third-place refund. Three tied for 1st hold 1st, 2nd and 3rd, split all three, and nobody else is paid at all. The principle is that a tie does not create money and does not destroy it — the same total is paid out, to fewer people, in equal shares.
  - **Leftover whole dollars** (a prize that does not divide evenly) are distributed one each until exhausted. The order is arbitrary but must be **stable and not derived from a player's name**, which can change.