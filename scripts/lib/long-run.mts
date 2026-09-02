/**
 * THE "DEV LONG RUN" DATA GENERATOR — ten seasons of ten weeks, generated and
 * scored HERE before a single row is written.
 *
 * ── WHY A GENERATOR AND NOT A TABLE OF LITERALS ───────────────────────────
 * Every other fixture in this repo is hand-typed, and that is right for them:
 * "Dev Edge Cases" exists to reach four specific week states and each of its
 * numbers is an assertion. This league exists to reach VOLUME — 100 weeks, 300
 * films, ~1,500 bids — and hand-typing that would be a thousand lines nobody
 * can check. It is generated from a seeded PRNG instead, so it is deterministic
 * (the same seed rebuilds the same league byte for byte) without being typed.
 *
 * ── THE SIMULATION IS THE POINT ───────────────────────────────────────────
 * `simulate` reimplements the three database rules that decide an outcome:
 *
 *   1. A bid wins if its amount is one of the top `topN` DISTINCT amounts on
 *      that film (`resolve_week`, 20260803030000). Ties are honored, so a film
 *      can have more owners than there are tiers.
 *   2. Every owner receives the FULL score — ownership is never divided.
 *   3. Remaining budget is the bankroll minus WINNING bids only
 *      (`member_remaining_budget`) — a losing bid costs nothing — and a
 *      player's bids in one open week may not exceed that remaining
 *      (`place_bid`).
 *
 * Reimplementing them is what lets the seed CHOOSE its outcome — the fixture
 * needs dev-player mid-table in the live season, and the only honest way to get
 * there is to generate, score, and keep the seed that lands it, rather than to
 * fake a standings row the derived views would contradict. Money and standings
 * are derived and never stored; a fixture that forgot that would be seeding a
 * lie the app then recomputes away.
 *
 * If rule 1, 2 or 3 ever changes in SQL, this file is wrong and the seed will
 * quietly produce a league whose standings are not the ones it aimed for.
 */

/** The rulebook's own scoring: opening box office in $M × Tomatometer / 100. */
export function score(boxOfficeM: number, tomatometer: number): number {
  return Math.round(boxOfficeM * tomatometer) / 100;
}

/**
 * Mulberry32 — a small, fast, fully deterministic PRNG.
 *
 * `Math.random()` cannot be used here: the whole point is that the same seed
 * rebuilds the same ten seasons, so a re-run tops the fixture up rather than
 * inventing a different league.
 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Player = {
  /** The key bids and standings are held under — "player", "commish", "ivy". */
  key: string;
  /**
   * How well this player reads a slate, 0..1. It is the standard deviation of
   * the noise on their private estimate of a film's score — a high-skill player
   * sees roughly what the film will do, a low-skill one bids on a hunch. This
   * is the ONLY thing that separates the players, which is what stops the
   * league being ten coin flips with the same expected value.
   */
  skill: number;
  /** Fraction of the remaining bankroll they are willing to commit in a week. */
  appetite: number;
};

export type GeneratedFilm = {
  tmdbId: number;
  boxOfficeM: number;
  tomatometer: number;
  /** Player key -> whole-dollar bid. Absent means they passed on this film. */
  bids: Record<string, number>;
};

export type GeneratedWeek = { films: GeneratedFilm[] };
export type GeneratedSeason = { weeks: GeneratedWeek[] };

export type Standing = {
  key: string;
  points: number;
  spent: number;
  filmsOwned: number;
  /** Dense rank, the app-wide display model (ADR-028). */
  place: number;
};

/**
 * Generate one season and score it as the database would.
 *
 * `scoredWeeks` is how many of the generated weeks have actually been captured.
 * A completed season scores all of them; the live season scores all but the
 * last, because its final week is still open and open bids are neither won nor
 * paid for. The standings returned are the standings the app will derive.
 */
export function generateSeason(opts: {
  seed: number;
  players: Player[];
  weeks: number;
  filmsPerWeek: number;
  filmPool: number[];
  bankroll: number;
  topN: number;
  minBid: number;
  /** Weeks that are final. Defaults to every generated week. */
  scoredWeeks?: number;
}): { season: GeneratedSeason; standings: Standing[] } {
  const {
    seed, players, weeks, filmsPerWeek, filmPool, bankroll, topN, minBid,
  } = opts;
  const scoredWeeks = opts.scoredWeeks ?? weeks;
  const rand = rng(seed);

  const remaining = new Map(players.map((p) => [p.key, bankroll]));
  const points = new Map(players.map((p) => [p.key, 0]));
  const owned = new Map(players.map((p) => [p.key, 0]));

  // Films are drawn WITHOUT replacement inside a season, so no season shows
  // the same title twice; across seasons the pool repeats, which is fine —
  // `films` carries no uniqueness on (week, tmdb_id) or across seasons, and a
  // league that ran for ten years would genuinely see a re-release.
  const bag = [...filmPool];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }

  const season: GeneratedSeason = { weeks: [] };

  for (let w = 0; w < weeks; w++) {
    const films: GeneratedFilm[] = [];

    for (let f = 0; f < filmsPerWeek; f++) {
      const tmdbId = bag[(w * filmsPerWeek + f) % bag.length];
      // A slate is mostly modest films with the occasional event picture —
      // a flat distribution would make every week the same decision.
      const heat = rand();
      const boxOfficeM =
        heat > 0.88 ? 70 + rand() * 110      // the tentpole
        : heat > 0.55 ? 22 + rand() * 45     // the solid opener
        : 3 + rand() * 20;                   // the one nobody remembers
      const tomatometer = Math.round(18 + rand() * 79);
      films.push({
        tmdbId,
        boxOfficeM: Math.round(boxOfficeM * 10) / 10,
        tomatometer,
        bids: {},
      });
    }

    // ── EACH PLAYER BIDS BLIND, FROM THEIR OWN ESTIMATE ───────────────────
    for (const p of players) {
      const left = remaining.get(p.key)!;
      if (left < minBid) continue;

      const truth = films.map((film) => score(film.boxOfficeM, film.tomatometer));
      const best = Math.max(...truth, 1);
      // The estimate is the truth plus noise proportional to how badly this
      // player reads a slate. Normalised against the week's best film so a
      // quiet week does not read as a week nobody wants.
      const view = films.map((_, i) => {
        const noise = (rand() - 0.5) * 2 * (1 - p.skill) * best;
        return Math.max(0, truth[i] + noise) / best;
      });

      // Late in a season a player with money left spends it — a bankroll
      // carried to the final whistle is a bankroll wasted, and a fixture where
      // everyone finishes with $40 unspent tests nothing about budgets.
      const urgency = 1 + (w / Math.max(1, weeks - 1)) * 0.9;
      const purse = Math.min(left, Math.max(minBid, Math.round(left * p.appetite * urgency)));

      const order = films
        .map((_, i) => i)
        .sort((a, b) => view[b] - view[a])
        // Nobody bids the whole slate every week; how many they chase is
        // itself a decision, and 1..filmsPerWeek keeps some weeks quiet.
        .slice(0, 1 + Math.floor(rand() * filmsPerWeek));

      const weight = order.reduce((sum, i) => sum + view[i], 0) || 1;
      let committed = 0;
      for (const i of order) {
        const share = Math.floor((purse * view[i]) / weight);
        const amount = Math.max(minBid, share);
        // THE WHOLE-WEEK BUDGET CHECK, exactly as `place_bid` applies it:
        // everything still on the table this week plus this bid must fit the
        // remaining budget, because every one of them could win.
        if (committed + amount > left) continue;
        committed += amount;
        films[i].bids[p.key] = amount;
      }
    }

    // ── RESOLVE, exactly as `resolve_week` does ───────────────────────────
    const scored = w < scoredWeeks;
    for (const film of films) {
      const amounts = [...new Set(Object.values(film.bids))].sort((a, b) => b - a);
      const winning = new Set(amounts.slice(0, topN));
      for (const [key, amount] of Object.entries(film.bids)) {
        if (!winning.has(amount)) continue;
        // An open week's bids are not yet won: nothing is owned and nothing is
        // paid until the week closes. Budget is still committed for the check
        // above, which is why this loop runs after the bidding and not inside.
        if (!scored) continue;
        remaining.set(key, remaining.get(key)! - amount);
        owned.set(key, owned.get(key)! + 1);
        points.set(key, points.get(key)! + score(film.boxOfficeM, film.tomatometer));
      }
    }

    season.weeks.push({ films });
  }

  const rows = players
    .map((p) => ({
      key: p.key,
      points: Math.round(points.get(p.key)! * 100) / 100,
      spent: bankroll - remaining.get(p.key)!,
      filmsOwned: owned.get(p.key)!,
      place: 0,
    }))
    .sort((a, b) => b.points - a.points);

  // Dense rank: equal points share a place and the next place is not skipped.
  let place = 0;
  let previous = Number.NaN;
  for (const row of rows) {
    if (row.points !== previous) {
      place += 1;
      previous = row.points;
    }
    row.place = place;
  }

  return { season, standings: rows };
}
