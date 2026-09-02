/**
 * Dev fixtures — a persistent mini-season for developing/demoing the UI.
 * Unlike the spikes, these are NOT deleted afterwards; re-running the script
 * just tops up whatever is missing (idempotent).
 *
 * Creates:
 *   - dev-commish@moviepool.local (commissioner)  — password below
 *   - dev-player@moviepool.local  (player)        — password below
 *   - dev-outsider@moviepool.local (account with NO season membership)
 *   - Season "Dev Season" (active) + default league settings (ADR-059)
 *   - Week 1 (open) with two films, ready for the bidding UI in Phase 4
 *   - League "Dev Film Club" — a SECOND league where dev-commish is a plain
 *     player (context-hierarchy demo), with 3 more fixture players, a
 *     mid-season (3 scored weeks of real standings) and an OPEN week 4 with
 *     a bid deadline that dev-commish/dev-player have NOT bid in yet.
 *     Built through the real RPCs so derived standings are authentic.
 *   - League "Dev Closing Credits" — a THIRD league with a COMPLETED,
 *     fully-scored season and NO settlement yet, for reviewing the two
 *     settlement surfaces. dev-commish commissions it; dev-player plays.
 *     Re-running RESETS it to unsettled so the commissioner's
 *     Generate -> Regenerate -> Finalize flow can be driven repeatedly.
 *   - League "Dev Edge Cases" — a FOURTH league that exists only to reach the
 *     week states nothing else does: a TIE at the cut (three distinct amounts,
 *     four owners), a film REMOVED after the close with its refunds, a week
 *     that CLOSED WITH NO BIDS AT ALL, and a SKIPPED week. Its films carry
 *     real TMDB ids, so posters and the league-scoped film page are live.
 *
 * Run:  npm run seed:dev
 * Env:  NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
 *       SUPABASE_SECRET_KEY (.env.local). TMDB_READ_TOKEN too on a database
 *       whose film_catalog has not cached the fixture films yet — every
 *       fixture film is a REAL film, referenced by tmdb id.
 *
 * Dev-only convenience accounts on a throwaway database — do not reuse
 * this password pattern for anything real.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { clearSeededWeeks, futureFriday } from "./lib/season-fixture.mts";
import { generateSeason, type Player as LongRunPlayer } from "./lib/long-run.mts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !publishableKey || !secretKey) {
  console.error(
    "Missing env. Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY in .env.local",
  );
  process.exit(2);
}

export const DEV_PASSWORD = "dev-Passw0rd!";
const LEAGUE_NAME = "Dev League";
/** Week 1's slate — the two films the bidding UI is developed against. */
const DEV_LEAGUE_FILMS = [931285, 1171145] as const;
// SEASON_NAME is gone with ADR-099 — a season has no name of its own to give.
// "Dev League" identifies the fixture; its one season is found by league_id.
const USERS = [
  { email: "dev-commish@moviepool.local", name: "Dev Commish", role: "commissioner" },
  { email: "dev-player@moviepool.local", name: "Dev Player", role: "player" },
  { email: "dev-outsider@moviepool.local", name: "Dev Outsider", role: null },
] as const;

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureUser(email: string, displayName: string): Promise<string> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = data?.users.find((u) => u.email === email);
  if (existing) return existing.id;

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: DEV_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error || !created.user) throw new Error(`createUser ${email}: ${error?.message}`);
  console.log(`  created user ${email}`);
  return created.user.id;
}

// Live handoff testing on these fixtures moves the commissioner role, so a
// re-seed has to put it back where the fixtures expect it.
//
// Demoting the strays is still the point — ADR-060 permits co-commissioners,
// but these fixtures mean something specific by each account ("dev-player is a
// PLAYER"), and a league where the handoff test left two commissioners no
// longer tests what the player-facing surfaces need. What ADR-060 changed is
// the ORDER: the demote used to have to come first, because promoting while
// the drifted one still held the role tripped league_members_one_commissioner_idx.
// With that index dropped the order is free, so it now promotes first — at no
// point does the league pass through zero commissioners.
//
// Note this writes with the SERVICE ROLE, which is exactly the path ADR-060's
// never-zero guard cannot cover; the ordering is our own discipline, not
// something the database will enforce here.
async function restoreCommissioner(
  leagueId: string,
  profileId: string,
  label: string,
) {
  const { error: promoteErr } = await admin
    .from("league_members")
    .update({ role: "commissioner" })
    .eq("league_id", leagueId)
    .eq("profile_id", profileId);
  if (promoteErr) throw new Error(`${label} promote: ${promoteErr.message}`);
  const { data: stray, error: demoteErr } = await admin
    .from("league_members")
    .update({ role: "player" })
    .eq("league_id", leagueId)
    .eq("role", "commissioner")
    .neq("profile_id", profileId)
    .select("profile_id");
  if (demoteErr) throw new Error(`${label} demote: ${demoteErr.message}`);
  if (stray?.length) {
    const { data: seasons } = await admin
      .from("seasons")
      .select("id")
      .eq("league_id", leagueId);
    for (const s of seasons ?? []) {
      await admin
        .from("season_members")
        .update({ role: "player" })
        .eq("season_id", s.id)
        .eq("role", "commissioner")
        .neq("profile_id", profileId);
      await admin
        .from("season_members")
        .update({ role: "commissioner" })
        .eq("season_id", s.id)
        .eq("profile_id", profileId);
    }
    console.log(`  "${label}": restored commissioner after handoff drift`);
  }
}

async function main() {
  console.log("Seeding dev fixtures (idempotent)…");

  const ids: Record<string, string> = {};
  for (const u of USERS) {
    ids[u.email] = await ensureUser(u.email, u.name);
  }

  // THE LEAGUE IS THE KEY, NOT THE SEASON'S NAME (ADR-099 repair).
  //
  // This block used to find the season with `.eq("name", "Dev Season")` and
  // insert `{ name: SEASON_NAME }`. ADR-099 made a season's name DERIVED — it
  // is "Season N" computed in `v_seasons` by rank over earliest `week_of`, and
  // the column is gone — so both statements died on "Could not find the 'name'
  // column of 'seasons' in the schema cache" and took the whole seed with them.
  //
  // The lookup inverts: find the LEAGUE by name (leagues.name is still a real
  // column), then its LIVE season by `league_id` plus status.
  //
  // THE STATUS FILTER IS THE WHOLE THING, and its absence was a bug. ADR-020 is
  // "at most one ACTIVE season per league" — the migration is literally
  // `adr020_one_active_season.sql` and its unique index is
  // `(league_id) where status in ('draft','active')`. A league ACCUMULATES
  // completed and archived seasons; ADR-099's numbering exists because of it,
  // and the replica has nine. Matching on `league_id` alone therefore breaks
  // the moment Dev League holds a second season: `maybeSingle()` returns
  // `data: null` WITH a PGRST116 error, the error is discarded, `!season` is
  // true, and the seed inserts a duplicate that the week trigger then rejects.
  // Filtering to the live one restores the uniqueness the index guarantees.
  let { data: league } = await admin
    .from("leagues")
    .select("id")
    .eq("name", LEAGUE_NAME)
    .maybeSingle();
  if (!league) {
    const { data, error } = await admin
      .from("leagues")
      .insert({ name: LEAGUE_NAME, created_by: ids[USERS[0].email] })
      .select("id")
      .single();
    if (error) throw new Error(`league: ${error.message}`);
    league = data;
    console.log(`  created league "${LEAGUE_NAME}"`);
  }
  const leagueId = league!.id;

  const seasonLookup = await admin
    .from("seasons")
    .select("id")
    .eq("league_id", leagueId)
    .in("status", ["draft", "active"])
    .maybeSingle();
  // Checked rather than discarded: the failure this guards against announced
  // itself only through the error, and swallowing it is what turned a bad
  // query into a duplicate insert.
  if (seasonLookup.error) {
    throw new Error(`season lookup: ${seasonLookup.error.message}`);
  }
  let season = seasonLookup.data;
  if (!season) {
    const { data, error } = await admin
      .from("seasons")
      .insert({
        league_id: leagueId,
        status: "active",
        created_by: ids[USERS[0].email],
      })
      .select("id")
      .single();
    if (error) throw new Error(`season: ${error.message}`);
    season = data;
    // Read the name back from v_seasons rather than printing one we chose:
    // the derived name is the only one there is, and it is not knowable until
    // the season has a week (until then it is null, which is also true).
    const { data: derived } = await admin
      .from("v_seasons")
      .select("name")
      .eq("id", season.id)
      .maybeSingle();
    console.log(`  created season "${derived?.name ?? "unnamed until it has a week"}"`);
  }
  const seasonId = season!.id;

  const commishId = ids[USERS.find((u) => u.role === "commissioner")!.email];
  await restoreCommissioner(leagueId, commishId, LEAGUE_NAME);
  for (const u of USERS) {
    if (!u.role) continue;
    const { error } = await admin
      .from("league_members")
      .upsert(
        { league_id: leagueId, profile_id: ids[u.email], role: u.role },
        { onConflict: "league_id,profile_id" },
      );
    if (error) throw new Error(`league member ${u.email}: ${error.message}`);
  }

  // ADR-059: settings live on the league. The Dev League is inserted directly
  // (not via create_league, which seeds this row), so ensure it here.
  const { data: config } = await admin
    .from("league_settings")
    .select("league_id")
    .eq("league_id", leagueId)
    .maybeSingle();
  if (!config) {
    const { error } = await admin.from("league_settings").insert({ league_id: leagueId });
    if (error) throw new Error(`league_settings: ${error.message}`);
    console.log("  created default league settings");
  }

  for (const u of USERS) {
    if (!u.role) continue;
    const { error } = await admin
      .from("season_members")
      .upsert(
        { season_id: seasonId, profile_id: ids[u.email], role: u.role },
        { onConflict: "season_id,profile_id" },
      );
    if (error) throw new Error(`member ${u.email}: ${error.message}`);
  }

  // THREE HOURS, not one and not a day — and computed HERE, at seed time, not
  // hard-coded. The bid page's final-hour threshold flips the countdown to
  // vermilion inside 60 minutes, so a 3h seed exercises the ordinary state
  // and leaves room to test the threshold by editing the row. A fixed
  // timestamp goes stale by the next day and the week silently stops being
  // biddable, which is how this fixture came to have no deadline at all.
  //
  // opening_date moves WITH it, and that part is not optional: ADR-042's
  // `weeks_gate_bid_deadline` trigger (20260731120000_adr042_week_model.sql)
  // rejects any bid_deadline whose own UTC calendar date falls outside its
  // week's Mon-Sun range, derived from opening_date. The week's opening_date
  // was hard-coded to 2026-07-17 — confirmed by running this against the
  // hosted DB, which threw "bid deadline ... falls outside the week of
  // 2026-07-13" — so deriving the deadline alone is not enough; the week
  // itself has to be re-anchored to the same instant, every run, or the
  // insert/update fails outright once real time has moved off that date.
  const week1DeadlineAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const week1Isodow = week1DeadlineAt.getUTCDay() === 0 ? 7 : week1DeadlineAt.getUTCDay();
  const week1Monday = new Date(week1DeadlineAt);
  week1Monday.setUTCDate(week1DeadlineAt.getUTCDate() - (week1Isodow - 1));
  week1Monday.setUTCHours(0, 0, 0, 0);
  const week1Friday = new Date(week1Monday);
  week1Friday.setUTCDate(week1Monday.getUTCDate() + 4);
  const week1OpeningDate = week1Friday.toISOString().slice(0, 10);
  const week1BidDeadline = week1DeadlineAt.toISOString();

  let { data: week } = await admin
    .from("weeks")
    .select("id")
    .eq("season_id", seasonId)
    .eq("number", 1)
    .maybeSingle();
  if (!week) {
    const { data, error } = await admin
      .from("weeks")
      .insert({
        season_id: seasonId,
        number: 1,
        opening_date: week1OpeningDate,
        status: "open",
        bid_deadline: week1BidDeadline,
      })
      .select("id")
      .single();
    if (error) throw new Error(`week: ${error.message}`);
    week = data;
    console.log("  created week 1 (open)");

    // "Dev Film Alpha"/"Beta" until 2026-08-31. A film needs a catalog row now,
    // and a made-up title has none — so the bidding fixture bids on real films.
    for (const tmdbId of DEV_LEAGUE_FILMS) {
      await addCatalogFilm(week!.id, tmdbId);
    }
    console.log("  created 2 films");
  } else {
    // Re-seeding is idempotent for the week's existence, but NOT for its
    // deadline: a re-run has to push both fields back out to "now" every
    // time, or the fixture goes stale (and un-biddable, then DB-rejected on
    // the next re-seed) the moment the script isn't re-run within the window.
    //
    // THE STATUS GOES BACK TO `open` TOO, ADDED 2026-08-29. Without it a re-run
    // produced an impossible row — a CLOSED week with a deadline three hours in
    // the future — and every reader that asks "is a week taking bids" filters
    // on `status = 'open'`, not on the clock. So the nav countdown, the bell's
    // unbid-week alert and `/leagues`' open-week chip were all undrivable the
    // moment anything closed week 1, and re-seeding looked like it had fixed
    // them because the deadline moved. The deadline is the fixture's headline;
    // the status is what makes it mean anything.
    const { error } = await admin
      .from("weeks")
      .update({
        opening_date: week1OpeningDate,
        bid_deadline: week1BidDeadline,
        status: "open",
      })
      .eq("id", week.id);
    if (error) throw new Error(`week 1 refresh: ${error.message}`);
    console.log("  refreshed week 1 (opening_date + bid_deadline, 3h out)");
  }

  await seedFilmClub(ids);
  await seedClosingCredits();
  await seedEdgeCases();
  await seedLongRun(ids);

  await backfillCatalogMetrics();

  console.log("\nDev fixtures ready:");
  for (const u of USERS) {
    console.log(`  ${u.email}  (${u.role ?? "no season"})  password: ${DEV_PASSWORD}`);
  }
  for (const u of CLUB_USERS) {
    console.log(`  ${u.email}  (Dev Film Club ${u.role})  password: ${DEV_PASSWORD}`);
  }
  for (const u of LONG_RUN_NEW_USERS) {
    console.log(`  ${u.email}  (${LONG_RUN_NAME} player)  password: ${DEV_PASSWORD}`);
  }
}

// ---------------------------------------------------------------------------
// League #2: "Dev Film Club" — dense, mid-season data for reviewing the
// dashboard/leaderboard surfaces. dev-commish is a PLAIN PLAYER here; a
// separate fixture (dev-frank) commissions it. Everything runs through the
// real RPCs with real JWTs so standings/budgets derive exactly as in prod.
// ---------------------------------------------------------------------------

const CLUB_NAME = "Dev Film Club";
const CLUB_USERS = [
  { email: "dev-frank@moviepool.local", name: "Dev Frank", role: "commissioner" },
  { email: "dev-grace@moviepool.local", name: "Dev Grace", role: "player" },
  { email: "dev-hana@moviepool.local", name: "Dev Hana", role: "player" },
] as const;

// Bidders are keyed by short name; scores follow box × tomatometer/100.
// Designed so the five players end with DIFFERENT points vs efficiency
// ranks (commish: points #3, efficiency #2 — the dual-rank tiles matter).
// A FIXTURE FILM IS A REAL MOVIE PLUS INVENTED MONEY. `tmdbId` names an actual
// TMDB title, so the poster, the film page and the cross-league identity all
// work; `box` and `tomato` are the fixture's own numbers, written to the
// per-league `films` row by capture_film and never to the shared catalog.
//
// The titles used to live here as invented strings ("Neon Harvest"). They are
// gone: the title now comes from the catalog, so the fixture cannot assert a
// name the film page disagrees with.
type ClubFilm = {
  tmdbId: number;
  box: number;
  tomato: number;
  bids: Record<string, number>;
};
const CLUB_WEEKS: { films: ClubFilm[] }[] = [
  {
    films: [
      { tmdbId: 1339713, box: 64.2, tomato: 91,
        bids: { grace: 18, commish: 12, hana: 8, frank: 5 } },
      { tmdbId: 1083381, box: 28.5, tomato: 44,
        bids: { frank: 10, player: 6 } },
      { tmdbId: 1212461, box: 9.8, tomato: 96,
        bids: { player: 4, hana: 3 } },
    ],
  },
  {
    films: [
      { tmdbId: 1084244, box: 88.7, tomato: 58,
        bids: { frank: 22, grace: 15, player: 10, commish: 9 } },
      { tmdbId: 1290821, box: 12.3, tomato: 88,
        bids: { commish: 6, hana: 5 } },
      { tmdbId: 1273221, box: 22.1, tomato: 35,
        bids: { hana: 2 } },
    ],
  },
  {
    films: [
      { tmdbId: 1275779, box: 41.6, tomato: 79,
        bids: { player: 14, grace: 11, commish: 7 } },
      { tmdbId: 1127384, box: 55.0, tomato: 62,
        bids: { frank: 16, hana: 12, grace: 9 } },
      { tmdbId: 1327819, box: 6.4, tomato: 93,
        bids: { commish: 3 } },
    ],
  },
];
// Week 4 stays OPEN: others have bid (the who's-in signal), dev-commish and
// dev-player have NOT — the dashboard's action-needed state.
const OPEN_WEEK_FILMS: { tmdbId: number; bids: Record<string, number> }[] = [
  { tmdbId: 1081003, bids: { frank: 20, hana: 10 } },
  { tmdbId: 1122573, bids: { grace: 7 } },
  { tmdbId: 1301421, bids: {} },
];

async function signIn(mail: string): Promise<SupabaseClient> {
  const client = createClient(url!, publishableKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: mail,
    password: DEV_PASSWORD,
  });
  if (error) throw new Error(`sign in ${mail}: ${error.message}`);
  return client;
}

async function rpc<T = unknown>(
  client: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

// ---------------------------------------------------------------------------
// THE CATALOG PATH (2026-08-31)
//
// Every fixture film carries a `tmdb_id`, and that column references
// film_catalog — so a fixture film cannot exist without a catalog row. The
// fixtures used to hand-type a title through `add_film` (dropped in
// 20260831180000) and leave the link empty, which produced films with no
// poster, no cross-league identity and NO FILM PAGE AT ALL — both film routes
// are addressed by tmdb id, so an unlinked film is unreachable. `add_film` is
// gone; this is what replaces it.
//
// ONLY REAL TMDB DATA IS WRITTEN TO film_catalog. That table is a SHARED
// cache — the replica league's film pages read the same rows — so the
// fixtures' invented box office and Tomatometers stay where they belong, on
// the per-league `films` row that `capture_film` writes. It is the same
// distinction the old header drew when it refused to invent Tomatometers.
//
// The fetch is here rather than imported because `src/lib/tmdb.ts` opens with
// `import "server-only"` and resolves through the `@/` alias, neither of which
// survives a plain `node scripts/*.mts`. This is the field set the fixtures
// need and no more.
// ---------------------------------------------------------------------------

const TMDB_TOKEN = process.env.TMDB_READ_TOKEN;
const OMDB_KEY = process.env.OMDB_API_KEY?.trim();

type Rec = Record<string, unknown>;

/** The catalog row for `tmdbId`, fetched once if this database has not cached
 *  it yet. Returns the real title, which is what the fixture film is called —
 *  a fixture that named its films itself would be asserting a title the
 *  catalog disagrees with. */
async function ensureCatalogFilm(tmdbId: number): Promise<string> {
  const { data: cached } = await admin
    .from("film_catalog")
    .select("title")
    .eq("tmdb_id", tmdbId)
    .maybeSingle();
  if (cached) {
    await ensureCatalogMetrics(tmdbId);
    return cached.title;
  }

  if (!TMDB_TOKEN) {
    throw new Error(
      `film_catalog has no row for tmdb ${tmdbId} and TMDB_READ_TOKEN is not set. ` +
        `Add it to .env.local — the fixtures cannot create a film without a catalog row.`,
    );
  }

  const res = await fetch(
    `https://api.themoviedb.org/3/movie/${tmdbId}?append_to_response=release_dates`,
    { headers: { Authorization: `Bearer ${TMDB_TOKEN}`, accept: "application/json" } },
  );
  if (!res.ok) {
    throw new Error(`TMDB ${tmdbId}: ${res.status} ${await res.text()}`);
  }
  // Narrowed, never asserted — external JSON is the one place a cast is
  // genuinely dangerous, which is the rule `src/lib/tmdb.ts` states at length.
  const obj = (v: unknown): Rec => (typeof v === "object" && v !== null ? (v as Rec) : {});
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() !== "" ? v : null;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const iso = (v: unknown): string | null =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;

  const d = obj(await res.json());
  const title = str(d.title);
  if (!title) throw new Error(`TMDB ${tmdbId}: no title in the response`);

  // US wide is release type 3 — the only type the pool bids on, and the same
  // rule `src/lib/tmdb.ts` documents at length.
  const us = obj(arr(obj(d.release_dates).results).find(
    (r) => str(obj(r).iso_3166_1) === "US",
  ));
  const wide = obj(arr(us.release_dates).find((r) => num(obj(r).type) === 3));

  const { error } = await admin.from("film_catalog").insert({
    tmdb_id: tmdbId,
    imdb_id: str(d.imdb_id),
    title,
    original_title: str(d.original_title),
    release_date_us_wide: iso(wide.release_date),
    // `release_year` is GENERATED from the dates above — writing it is rejected.
    release_date_tmdb_raw: iso(d.release_date),
    poster_path: str(d.poster_path),
    backdrop_path: str(d.backdrop_path),
    overview: str(d.overview),
    tagline: str(d.tagline),
    homepage: str(d.homepage),
    certification: str(wide.certification),
    runtime_min: num(d.runtime),
    budget: num(d.budget),
    original_language: str(d.original_language),
    studios:
      arr(d.production_companies)
        .map((c) => str(obj(c).name))
        .filter((n): n is string => n !== null)
        .join(", ") || null,
    tmdb_vote_average: num(d.vote_average),
    tmdb_vote_count: num(d.vote_count),
    fetched_at: new Date().toISOString(),
  });
  if (error) throw new Error(`film_catalog ${tmdbId}: ${error.message}`);
  console.log(`  cached film_catalog ${tmdbId} — ${title}`);
  await ensureCatalogMetrics(tmdbId);
  return title;
}

// ---------------------------------------------------------------------------
// THE OMDb HALF OF A CATALOG ROW — REAL NUMBERS, FETCHED, NEVER INVENTED.
//
// A seeded film is added by hand and never picked, so the columns the catalog
// picker would have written stayed null and the film pages' Tomatometer,
// Metacritic and IMDb figures rendered as nothing at all. The header above
// refuses to close that with made-up values, and it is right to: film_catalog
// is a SHARED cache the replica league reads. So this asks OMDb, exactly as
// the picker does, and writes what it answers.
//
// The fetch and the parse are restated here rather than imported for the same
// reason the TMDB one above is: `src/lib/omdb.ts` opens with `import
// "server-only"` and resolves through `@/`, neither of which survives a plain
// `node scripts/*.mts`. The two traps that file documents are load-bearing and
// are honoured below: the Tomatometer lives in `Ratings[]` and not in any
// top-level field, and OMDb answers HTTP 200 on failure, so `Response` is
// tested before anything else is read.
//
// `metrics_refreshed_at` is the idempotence guard AND the thing that keeps
// "asked, nothing to report" apart from "never asked" — a film Rotten
// Tomatoes has not scored yet is a null Tomatometer on a stamped row, and is
// not asked about again on the next run.
// ---------------------------------------------------------------------------
/**
 * Every catalog row the fixtures can reach, brought up to date with OMDb.
 *
 * WHY THIS IS A SWEEP AND NOT A SIDE-EFFECT OF SEEDING A LEAGUE. The league
 * seeders are idempotent by SKIPPING — "already seeded, skipping" — so a film
 * added before this existed is never walked again, and hanging the fetch off
 * `ensureCatalogFilm` alone would have backfilled nothing on any database that
 * had already been seeded once. That is the whole population in practice.
 *
 * `metrics_refreshed_at` makes the sweep cost nothing on the second run: a row
 * is asked about exactly once, whether or not Rotten Tomatoes had a score to
 * give. Serial on purpose — OMDb's free tier is a daily call budget, not a
 * concurrency one, and a seed script is not in a hurry.
 */
async function backfillCatalogMetrics(): Promise<void> {
  if (!OMDB_KEY) {
    console.log("");
    console.log("  OMDB_API_KEY is unset — film pages will show no Tomatometer.");
    return;
  }

  const { data: rows, error } = await admin
    .from("film_catalog")
    .select("tmdb_id")
    .is("metrics_refreshed_at", null)
    .not("imdb_id", "is", null);
  if (error) throw new Error(`film_catalog sweep: ${error.message}`);
  if (!rows || rows.length === 0) return;

  console.log("");
  console.log(`  asking OMDb about ${rows.length} catalog films…`);
  let rated = 0;
  for (const r of rows) {
    await ensureCatalogMetrics(r.tmdb_id, { quiet: true });
    rated += 1;
  }
  console.log(`  ${rated} catalog rows stamped`);
}

async function ensureCatalogMetrics(
  tmdbId: number,
  opts: { quiet?: boolean } = {},
): Promise<void> {
  if (!OMDB_KEY) return;

  const { data: row } = await admin
    .from("film_catalog")
    .select("imdb_id, metrics_refreshed_at")
    .eq("tmdb_id", tmdbId)
    .maybeSingle();
  if (!row || row.metrics_refreshed_at !== null) return;
  if (!row.imdb_id || !/^tt\d+$/.test(row.imdb_id)) return;

  const res = await fetch(
    `https://www.omdbapi.com/?apikey=${encodeURIComponent(OMDB_KEY)}` +
      `&i=${encodeURIComponent(row.imdb_id)}&tomatoes=short`,
    { signal: AbortSignal.timeout(8_000) },
  );
  const raw: unknown = await res.json();
  const obj = (v: unknown): Rec =>
    typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Rec) : {};
  /** OMDb writes "N/A" where other APIs write null, and it means the same. */
  const field = (o: Rec, key: string): string | null => {
    const v = o[key];
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t === "" || t === "N/A" ? null : t;
  };
  const digits = (v: string | null): number | null => {
    if (v === null) return null;
    const n = Number(v.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? Math.trunc(n) : null;
  };

  const d = obj(raw);
  // Trap 2 — the only signal that anything went wrong.
  if (field(d, "Response") !== "True") {
    if (!opts.quiet) {
      console.log(`  omdb ${tmdbId}: ${field(d, "Error") ?? "failed"} — left null`);
    }
    return;
  }

  // Trap 1 — match on Source, and tolerate the "83%" formatting.
  let tomatometer: number | null = null;
  if (Array.isArray(d.Ratings)) {
    for (const r of d.Ratings) {
      if (field(obj(r), "Source") !== "Rotten Tomatoes") continue;
      const pct = digits(field(obj(r), "Value"));
      if (pct !== null && pct >= 0 && pct <= 100) tomatometer = pct;
    }
  }
  const metascore = digits(field(d, "Metascore"));
  const imdbRating = Number(field(d, "imdbRating"));

  const { error } = await admin
    .from("film_catalog")
    .update({
      rt_tomatometer: tomatometer,
      metascore:
        metascore !== null && metascore >= 0 && metascore <= 100 ? metascore : null,
      imdb_rating: Number.isFinite(imdbRating) ? imdbRating : null,
      metrics_refreshed_at: new Date().toISOString(),
    })
    .eq("tmdb_id", tmdbId);
  if (error) throw new Error(`film_catalog metrics ${tmdbId}: ${error.message}`);
  if (!opts.quiet) {
    console.log(
      `  omdb ${tmdbId} — Tomatometer ${tomatometer === null ? "not yet rated" : `${tomatometer}%`}`,
    );
  }
}

/**
 * Put a catalog film on a specific week's slate.
 *
 * A DIRECT INSERT, not an RPC, and that is the one place these fixtures leave
 * the real path. The product's only film-creation path is
 * `add_films_from_catalog`, which DERIVES its weeks from release dates; these
 * fixtures lay out an explicit calendar of past Fridays that no real release
 * schedule would produce. The service-role insert is the same posture the Dev
 * League week already uses for its own films.
 */
async function addCatalogFilm(
  weekId: string,
  tmdbId: number,
): Promise<{ id: string; title: string }> {
  const title = await ensureCatalogFilm(tmdbId);
  const { data, error } = await admin
    .from("films")
    .insert({ week_id: weekId, title, tmdb_id: tmdbId, eligible: true })
    .select("id")
    .single();
  if (error) throw new Error(`film ${title}: ${error.message}`);
  return { id: data.id, title };
}

// The most recent Friday strictly before today anchors the past weeks; the
// open week points at the NEXT Friday with a deadline the Thursday before.
// LOCAL IN, UTC OUT WAS A DAY-OFF BUG. `getDay()` reads the machine's local
// weekday and `toISOString()` writes the UTC calendar date, so seeding on any
// evening west of Greenwich produced SATURDAYS — a week whose opening_date is
// not a Friday, in a game whose whole calendar is Fridays. It only ever showed
// up if you seeded after about 8pm Eastern, which is why the fixture data
// currently in the database happens to be correct. `getUTCDay`/`setUTCDate`
// keep both ends in UTC, the same way `season-fixture.mts` already does.
function fridays(): { past: string[]; next: string; deadline: string } {
  const day = 24 * 60 * 60 * 1000;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const toFriday = (5 - today.getUTCDay() + 7) % 7 || 7; // days until next Friday
  const next = new Date(today.getTime() + toFriday * day);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const past = [3, 2, 1].map((n) => iso(new Date(next.getTime() - n * 7 * day)));
  const deadline = new Date(next.getTime() - day);
  deadline.setUTCHours(16, 0, 0, 0); // Thursday ~noon US/Eastern
  return { past, next: iso(next), deadline: deadline.toISOString() };
}

async function seedFilmClub(ids: Record<string, string>) {
  const { data: existing } = await admin
    .from("leagues")
    .select("id")
    .eq("name", CLUB_NAME)
    .maybeSingle();
  if (existing) {
    // dev-frank commissions the Film Club; heal any handoff-test drift.
    for (const u of CLUB_USERS) {
      ids[u.email] = await ensureUser(u.email, u.name);
    }
    const frankId = ids[CLUB_USERS.find((u) => u.role === "commissioner")!.email];
    await restoreCommissioner(existing.id, frankId, CLUB_NAME);
    console.log(`  "${CLUB_NAME}" already seeded — skipping`);
    return;
  }

  console.log(`\nSeeding "${CLUB_NAME}" (mid-season, 5 players)…`);
  for (const u of CLUB_USERS) {
    ids[u.email] = await ensureUser(u.email, u.name);
  }

  const c: Record<string, SupabaseClient> = {
    frank: await signIn("dev-frank@moviepool.local"),
    grace: await signIn("dev-grace@moviepool.local"),
    hana: await signIn("dev-hana@moviepool.local"),
    commish: await signIn("dev-commish@moviepool.local"),
    player: await signIn("dev-player@moviepool.local"),
  };

  // Frank commissions; everyone else joins BEFORE the season starts (roster
  // lock) — dev-commish is deliberately a plain player in this league.
  const leagueId = await rpc<string>(c.frank, "create_league", {
    p_name: CLUB_NAME,
  });
  // This fixture used to back-date leagues.season_start_number so the club
  // read as its 7th season. ADR-099 removed the counter: a season's number is
  // its rank by earliest week, so a league with one season is on Season 1 and
  // the only way to be on Season 7 is to have six seasons behind it. The
  // fixture states less than it used to, and everything it states is true.
  for (const mail of [
    "dev-grace@moviepool.local",
    "dev-hana@moviepool.local",
    "dev-commish@moviepool.local",
    "dev-player@moviepool.local",
  ]) {
    await rpc(c.frank, "add_league_member", {
      p_league_id: leagueId,
      p_email: mail,
      p_role: "player",
    });
  }
  const seasonId = await rpc<string>(c.frank, "create_season", {
    p_league_id: leagueId,
    p_first_opening_date: futureFriday(),
    p_default_season_length: 1,
  });
  // ADR-099: create_season seeds week 1; this spike lays out its own
  // calendar (usually in the past), so the seeded week comes back out.
  await clearSeededWeeks(admin, seasonId);
  // Seasons are ACTIVE from creation (20260804080000).
  await rpc(c.frank, "open_due_weeks_for_season", { p_season_id: seasonId });
  console.log(`  created league + auto-named season (5 members)`);

  const dates = fridays();
  for (const [i, week] of CLUB_WEEKS.entries()) {
    const weekId = await rpc<string>(c.frank, "create_week", {
      p_season_id: seasonId,
      p_number: i + 1,
      p_opening_date: dates.past[i],
      p_bid_deadline: null,
    });
    const filmIds: Record<number, string> = {};
    for (const f of week.films) {
      filmIds[f.tmdbId] = (await addCatalogFilm(weekId, f.tmdbId)).id;
    }
    await rpc(c.frank, "open_week", { p_week_id: weekId });
    for (const f of week.films) {
      for (const [who, amount] of Object.entries(f.bids)) {
        await rpc(c[who], "place_bid", { p_film_id: filmIds[f.tmdbId], p_amount: amount });
      }
    }
    // ADR-070: close decides winners; finalize_week ends the week afterwards.
    await rpc(c.frank, "close_week", { p_week_id: weekId });
    for (const f of week.films) {
      await rpc(c.frank, "capture_film", {
        p_film_id: filmIds[f.tmdbId],
        p_box_office_m: f.box,
        p_tomatometer: f.tomato,
      });
    }
    await rpc(c.frank, "finalize_week", { p_week_id: weekId });
    console.log(`  week ${i + 1} final (${week.films.length} films)`);
  }

  const openWeekId = await rpc<string>(c.frank, "create_week", {
    p_season_id: seasonId,
    p_number: CLUB_WEEKS.length + 1,
    p_opening_date: dates.next,
    p_bid_deadline: dates.deadline,
  });
  const openFilmIds: Record<number, string> = {};
  for (const f of OPEN_WEEK_FILMS) {
    openFilmIds[f.tmdbId] = (await addCatalogFilm(openWeekId, f.tmdbId)).id;
  }
  await rpc(c.frank, "open_week", { p_week_id: openWeekId });
  for (const f of OPEN_WEEK_FILMS) {
    for (const [who, amount] of Object.entries(f.bids)) {
      await rpc(c[who], "place_bid", { p_film_id: openFilmIds[f.tmdbId], p_amount: amount });
    }
  }
  console.log(
    `  week ${CLUB_WEEKS.length + 1} OPEN (deadline ${dates.deadline}) — dev-commish/dev-player have not bid`,
  );
}

// ---------------------------------------------------------------------------
// League #3: "Dev Closing Credits" — a COMPLETED, fully-scored season with NO
// settlement yet, for reviewing the two settlement surfaces. dev-commish
// commissions it (so the commissioner workbench is reachable) and dev-player
// plays in it (so the player settlement view is reachable).
//
// Deliberately left at "completed, unsettled" rather than pre-finalized: that
// is the state the commissioner workbench actually starts from, so the whole
// Generate -> Regenerate -> Finalize flow can be driven in the UI. Finalizing
// it there is what reveals the player-side view. Re-running this script RESETS
// the fixture to unsettled (generate_settlement refuses once a settlement is
// final), so the flow can be reviewed as many times as needed.
//
// The results below are shaped to exercise every branch of the ADR-015 /
// ADR-018 ledger at once:
//   - grace + player TIE for 1st on points  -> dense-rank split of 1st money
//   - hana 2nd, commish 3rd                 -> 2nd remainder + 3rd buy-in back
//   - commish wins efficiency from 3rd      -> prize is not just "the winner"
//   - frank owns the season's worst film    -> dessert penalty
// ---------------------------------------------------------------------------

const CREDITS_NAME = "Dev Closing Credits";

// Bids are keyed by the short names in `c` below. Winners are the top 3
// DISTINCT amounts, so some bids here deliberately lose (frank's $4 on the
// first film, hana's $7 on the seventh) — a finished season should contain
// losses.
const CREDITS_WEEKS: { films: ClubFilm[] }[] = [
  {
    films: [
      // commish wins this at $5 -> 63.00/$5 = 12.6 pts/$, the season's best
      // single pick, so the efficiency prize lands on a NON-winner.
      { tmdbId: 687163, box: 70.0, tomato: 90,
        bids: { player: 15, grace: 10, hana: 10, commish: 5, frank: 4 } },
      { tmdbId: 1284465, box: 20.0, tomato: 50,
        bids: { frank: 8, commish: 3 } },
      { tmdbId: 1564614, box: 5.0, tomato: 95,
        bids: { grace: 1, player: 1 } },
    ],
  },
  {
    films: [
      { tmdbId: 454639, box: 90.0, tomato: 60,
        bids: { hana: 20, player: 12, frank: 12, grace: 5 } },
      { tmdbId: 1297842, box: 8.0, tomato: 85,
        bids: { commish: 2 } },
    ],
  },
  {
    films: [
      { tmdbId: 1280738, box: 35.0, tomato: 75,
        bids: { player: 10, grace: 9, commish: 8, hana: 7 } },
      // 3.0 box x 15% = 0.45 — the season's worst owned film -> frank's dessert.
      { tmdbId: 1325734, box: 3.0, tomato: 15,
        bids: { frank: 6 } },
    ],
  },
];

// Every user this league needs already exists (the core three plus the Film
// Club cast), so unlike seedFilmClub this one only signs them in.
async function seedClosingCredits() {
  const { data: existing } = await admin
    .from("leagues")
    .select("id")
    .eq("name", CREDITS_NAME)
    .maybeSingle();

  if (existing) {
    // Reset to the pre-draft state so the workbench flow stays reviewable.
    const { data: seasons } = await admin
      .from("seasons")
      .select("id")
      .eq("league_id", existing.id);
    const seasonIds = (seasons ?? []).map((s) => s.id);
    if (seasonIds.length) {
      // settlement_lines cascade from settlements.
      const { error } = await admin
        .from("settlements")
        .delete()
        .in("season_id", seasonIds);
      if (error) throw new Error(`settlement reset: ${error.message}`);
    }
    // dev-commish commissions Closing Credits (the settlement workbench
    // fixture depends on it); heal any handoff-test drift.
    const { data: commishUser } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const commish = commishUser?.users.find(
      (u) => u.email === "dev-commish@moviepool.local",
    );
    if (commish) await restoreCommissioner(existing.id, commish.id, CREDITS_NAME);
    console.log(`  "${CREDITS_NAME}" already seeded — reset to unsettled`);
    return;
  }

  console.log(`\nSeeding "${CREDITS_NAME}" (completed season, unsettled)…`);

  const c: Record<string, SupabaseClient> = {
    commish: await signIn("dev-commish@moviepool.local"),
    player: await signIn("dev-player@moviepool.local"),
    grace: await signIn("dev-grace@moviepool.local"),
    hana: await signIn("dev-hana@moviepool.local"),
    frank: await signIn("dev-frank@moviepool.local"),
  };

  const leagueId = await rpc<string>(c.commish, "create_league", {
    p_name: CREDITS_NAME,
  });
  // Was back-dated to "Season 12" for the dashboard's finished-season card;
  // see the note above. Under ADR-099 this league's single finished season
  // derives as Season 1, and any surface that asserted the old label is
  // asserting a stored value that no longer exists.
  for (const mail of [
    "dev-player@moviepool.local",
    "dev-grace@moviepool.local",
    "dev-hana@moviepool.local",
    "dev-frank@moviepool.local",
  ]) {
    await rpc(c.commish, "add_league_member", {
      p_league_id: leagueId,
      p_email: mail,
      p_role: "player",
    });
  }
  const seasonId = await rpc<string>(c.commish, "create_season", {
    p_league_id: leagueId,
    p_first_opening_date: futureFriday(),
    p_default_season_length: 1,
  });
  // ADR-099: create_season seeds week 1; this spike lays out its own
  // calendar (usually in the past), so the seeded week comes back out.
  await clearSeededWeeks(admin, seasonId);
  // Seasons are ACTIVE from creation (20260804080000).
  await rpc(c.commish, "open_due_weeks_for_season", { p_season_id: seasonId });

  // A finished season sits in the past: anchor its weeks BEFORE the Film
  // Club's, so the archive/schedule surfaces get a believable ordering.
  const day = 24 * 60 * 60 * 1000;
  const base = new Date(Date.now() - 10 * 7 * day);
  for (const [i, week] of CREDITS_WEEKS.entries()) {
    const opening = new Date(base.getTime() + i * 7 * day).toISOString().slice(0, 10);
    const weekId = await rpc<string>(c.commish, "create_week", {
      p_season_id: seasonId,
      p_number: i + 1,
      p_opening_date: opening,
      p_bid_deadline: null,
    });
    const filmIds: Record<number, string> = {};
    for (const f of week.films) {
      filmIds[f.tmdbId] = (await addCatalogFilm(weekId, f.tmdbId)).id;
    }
    await rpc(c.commish, "open_week", { p_week_id: weekId });
    for (const f of week.films) {
      for (const [who, amount] of Object.entries(f.bids)) {
        await rpc(c[who], "place_bid", { p_film_id: filmIds[f.tmdbId], p_amount: amount });
      }
    }
    await rpc(c.commish, "close_week", { p_week_id: weekId });
    for (const f of week.films) {
      await rpc(c.commish, "capture_film", {
        p_film_id: filmIds[f.tmdbId],
        p_box_office_m: f.box,
        p_tomatometer: f.tomato,
      });
    }
    await rpc(c.commish, "finalize_week", { p_week_id: weekId });
    console.log(`  week ${i + 1} final (${week.films.length} films)`);
  }

  await rpc(c.commish, "update_season_status", {
    p_season_id: seasonId,
    p_status: "completed",
  });

  const { data: final } = await c.commish
    .from("v_standings")
    .select("display_name, points, spent")
    .eq("season_id", seasonId)
    .order("points", { ascending: false });
  console.log("  season COMPLETED, no settlement — final standings:");
  for (const r of final ?? []) {
    console.log(`    ${r.display_name}: ${r.points} pts / $${r.spent}`);
  }
  console.log("  -> drive Generate/Regenerate/Finalize from the commish workbench");
}


// ---------------------------------------------------------------------------
// League #4: "Dev Edge Cases" — the three week states no other fixture reaches.
//
// Added 2026-08-29, when the week board (board 3.2) was driven and three of its
// branches turned out to be unreachable against real data. They are not rare
// states — a tie at the cut is the rule players misread most often, a removed
// film is the only thing the corrections panel exists for, and a skipped week
// is ADR-069's whole reason to exist. None of them had ever rendered.
//
//   week 1  FINAL, and carries two of the three:
//             · a TIE at the cut — three distinct amounts, four owners
//             · a film REMOVED after the close, with its refunds
//   week 2  CLOSED WITH NO BIDS — a real slate every player passed on
//   week 3  SKIPPED
//
// FILMS CARRY REAL TMDB IDS, so the poster, the artwork and the link to
// `/leagues/[id]/films/[tmdbId]` are all live. Every fixture in this file does
// now — a film cannot be created without one — but this is where it started, and
// `addCatalogFilm` is the one path.
//
// THE OMDb HALF OF A FILM PAGE (Tomatometer, Metacritic, IMDb) used to be out
// of reach here, and is not any more — `ensureCatalogMetrics` asks OMDb the
// same question the commissioner's catalog picker asks and writes the answer.
// The constraint that made it look unreachable still holds and is what that
// function is shaped around: `src/lib/omdb.ts` is `import "server-only"` and
// cannot be called from a script, so the fetch is restated inline exactly as
// the TMDB one above is. What is NOT allowed has not changed — no invented
// Tomatometer is ever written to `film_catalog`, because that table is a
// SHARED cache and the replica league's film pages read the same rows.
// ---------------------------------------------------------------------------

const EDGE_NAME = "Dev Edge Cases";

/** The two films of the week nobody bid in. Named so the console line and the
 *  fixture agree without either repeating a title the catalog owns. */
const UNBID_FILMS = [1292415, 1198994] as const;
/** The tie at the cut, and the film pulled after the close. Referenced by id
 *  rather than title for the same reason. */
const EDGE_TIE = 87513;
const EDGE_REMOVED = 1368314;

type EdgeFilm = ClubFilm & {
  /** Set to remove the film after the close, with this as the reason. */
  removeBecause?: string;
};

// top_n_distinct is 3 — the rulebook default this league keeps.
const EDGE_FILMS: EdgeFilm[] = [
  {
    // THE TIE. Distinct amounts are 12, 9 and 5 — three tiers — but two people
    // bid 9, so FOUR players own it and all four earn the full score. That is
    // the sentence the reveal has to be able to say. dev-commish bids under
    // the cut on purpose, so the fixture also holds a visible loss.
    tmdbId: 87513,
    box: 24.6,
    tomato: 62,
    bids: { grace: 12, player: 9, hana: 9, frank: 5, commish: 3 },
  },
  {
    // dev-commish OWNS this one, so the your-week panel and the owned row's
    // ink border have something to render.
    tmdbId: 898704,
    box: 41.0,
    tomato: 78,
    bids: { commish: 8, frank: 6, grace: 4, hana: 2 },
  },
  {
    // REMOVED after bidding closed. Both bids are refunded in full, it scores
    // for nobody, and the correction says so.
    tmdbId: 1368314,
    box: 0,
    tomato: 0,
    bids: { player: 7, hana: 5 },
    removeBecause: "Opened limited, not wide, so it is not eligible.",
  },
];

/** The most recent Friday strictly before today. UTC on both ends — the same
 *  local-in/UTC-out trap `fridays()` above was carrying. */
function lastFriday(weeksBack: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  const back = (d.getUTCDay() - 5 + 7) % 7 || 7; // days since the last Friday
  d.setUTCDate(d.getUTCDate() - back - weeksBack * 7);
  return d.toISOString().slice(0, 10);
}

// A multi-paragraph post, because the announcement page has to prove it keeps
// its line breaks — a blank line between paragraphs AND a single newline
// inside one, which are two different bugs. Every other fixture announcement
// is one line, which is exactly the shape that hides both.
const EDGE_ANNOUNCEMENT = {
  title: "Week 04 slate is up early",
  body: [
    "Week 04 goes up on Tuesday rather than Thursday morning. Two wide releases land the same weekend and I would rather everyone had the time to look at both properly.",
    "The deadline has not moved — it is still Thursday at noon Eastern. You simply get two extra days to think about it, which in my experience makes everybody bid worse.",
    "One thing worth flagging: the second of the two may open limited rather than wide.\nIf that turns out to be the case I will pull it and refund whoever won it, the same way we handled it last season.",
  ].join("\n\n"),
};

/** Post the fixture announcement if the league has none. Split out because it
 *  has to run on a league that ALREADY EXISTS — the seeder skips those, and an
 *  announcement added to the fixture after the league was first seeded would
 *  otherwise never appear on anyone's database. */
async function ensureEdgeAnnouncement(leagueId: string) {
  const { count } = await admin
    .from("league_announcements")
    .select("id", { count: "exact", head: true })
    .eq("league_id", leagueId);
  if (count && count > 0) return;

  const commish = await signIn("dev-commish@moviepool.local");
  await rpc(commish, "post_league_announcement", {
    p_league_id: leagueId,
    p_body: EDGE_ANNOUNCEMENT.body,
    p_title: EDGE_ANNOUNCEMENT.title,
  });
  console.log("  posted the multi-paragraph announcement");
}

/**
 * WEEK 2: A REAL SLATE THAT EVERY PLAYER PASSED ON.
 *
 * The sixth week state, and the only fixture that reaches it. It is NOT the
 * skipped week — that one never had a slate; this one had films that really
 * opened and nobody wanted. Left at `closed` on purpose: that is the state the
 * commissioner's one-press "Finish the week" quick action appears in, and a
 * fixture that pressed it would put the button out of reach.
 *
 * `lastFriday(1)` is at least 7 days back whatever day the seed runs, so
 * ADR-080's results gate is already open and the button is live on arrival.
 *
 * Split out for the same reason as `ensureEdgeAnnouncement` — it has to be
 * able to run on a league that ALREADY EXISTS, which the seeder otherwise
 * skips whole. On those it first moves the skipped week out a weekend, since
 * this week needs the slot the results gate can see.
 */
async function ensureUnbidWeek(seasonId: string, commish: SupabaseClient) {
  const { data } = await admin
    .from("weeks")
    .select("id, number, status")
    .eq("season_id", seasonId);
  const weeks = data ?? [];
  if (weeks.some((w) => w.number === 3)) return;

  const skipped = weeks.find((w) => w.status === "skipped");
  if (skipped) {
    // Re-dated BEFORE the insert below, so neither the number nor the Friday
    // is ever held by two weeks at once.
    const { error } = await admin
      .from("weeks")
      .update({ number: 3, opening_date: lastFriday(0) })
      .eq("id", skipped.id);
    if (error) throw new Error(`move skipped week: ${error.message}`);
    console.log("  moved the skipped week to week 3 to make room");
  }

  const weekId = await rpc<string>(commish, "create_week", {
    p_season_id: seasonId,
    p_number: 2,
    p_opening_date: lastFriday(1),
    p_bid_deadline: null,
  });
  for (const tmdbId of UNBID_FILMS) {
    await addCatalogFilm(weekId, tmdbId);
  }
  await rpc(commish, "open_week", { p_week_id: weekId });
  await rpc(commish, "close_week", { p_week_id: weekId });
  console.log("  week 2 CLOSED WITH NO BIDS (awaiting the commissioner's one press)");
}

async function seedEdgeCases() {
  const { data: existing } = await admin
    .from("leagues")
    .select("id")
    .eq("name", EDGE_NAME)
    .maybeSingle();
  if (existing) {
    await ensureEdgeAnnouncement(existing.id);
    const { data: season } = await admin
      .from("seasons")
      .select("id")
      .eq("league_id", existing.id)
      .maybeSingle();
    if (season) {
      await ensureUnbidWeek(season.id, await signIn("dev-commish@moviepool.local"));
    }
    console.log(`  "${EDGE_NAME}" already seeded — skipping`);
    return;
  }

  console.log(
    `\nSeeding "${EDGE_NAME}" (tie, removal, a week nobody bid in, skipped week)…`,
  );

  const c: Record<string, SupabaseClient> = {
    commish: await signIn("dev-commish@moviepool.local"),
    player: await signIn("dev-player@moviepool.local"),
    grace: await signIn("dev-grace@moviepool.local"),
    hana: await signIn("dev-hana@moviepool.local"),
    frank: await signIn("dev-frank@moviepool.local"),
  };

  const leagueId = await rpc<string>(c.commish, "create_league", {
    p_name: EDGE_NAME,
  });
  for (const mail of [
    "dev-player@moviepool.local",
    "dev-grace@moviepool.local",
    "dev-hana@moviepool.local",
    "dev-frank@moviepool.local",
  ]) {
    await rpc(c.commish, "add_league_member", {
      p_league_id: leagueId,
      p_email: mail,
      p_role: "player",
    });
  }
  const seasonId = await rpc<string>(c.commish, "create_season", {
    p_league_id: leagueId,
    p_first_opening_date: futureFriday(),
    p_default_season_length: 1,
  });
  await clearSeededWeeks(admin, seasonId);
  await rpc(c.commish, "open_due_weeks_for_season", { p_season_id: seasonId });

  // ---- week 1: the tie and the removal ------------------------------------
  const weekId = await rpc<string>(c.commish, "create_week", {
    p_season_id: seasonId,
    p_number: 1,
    p_opening_date: lastFriday(2),
    p_bid_deadline: null,
  });

  const filmIds: Record<number, string> = {};
  const titles: Record<number, string> = {};
  for (const f of EDGE_FILMS) {
    const added = await addCatalogFilm(weekId, f.tmdbId);
    filmIds[f.tmdbId] = added.id;
    titles[f.tmdbId] = added.title;
  }

  await rpc(c.commish, "open_week", { p_week_id: weekId });
  for (const f of EDGE_FILMS) {
    for (const [who, amount] of Object.entries(f.bids)) {
      await rpc(c[who], "place_bid", {
        p_film_id: filmIds[f.tmdbId],
        p_amount: amount,
      });
    }
  }
  // CLOSE FIRST. Removal is the commissioner reacting to what the close
  // revealed, and `remove_film` refunds winning bids that have to exist first.
  await rpc(c.commish, "close_week", { p_week_id: weekId });

  for (const f of EDGE_FILMS) {
    if (f.removeBecause) {
      await rpc(c.commish, "remove_film", {
        p_film_id: filmIds[f.tmdbId],
        p_reason: f.removeBecause,
      });
      continue;
    }
    await rpc(c.commish, "capture_film", {
      p_film_id: filmIds[f.tmdbId],
      p_box_office_m: f.box,
      p_tomatometer: f.tomato,
    });
  }
  await rpc(c.commish, "finalize_week", { p_week_id: weekId });
  console.log(
    `  week 1 final — ${titles[EDGE_TIE]} ties at $9 (4 owners), ` +
      `${titles[EDGE_REMOVED]} removed`,
  );

  // ---- week 2: films opened, and nobody bid on any of them ------------------
  await ensureUnbidWeek(seasonId, c.commish);

  // ---- week 3: skipped -----------------------------------------------------
  const skippedId = await rpc<string>(c.commish, "create_week", {
    p_season_id: seasonId,
    p_number: 3,
    p_opening_date: lastFriday(0),
    p_bid_deadline: null,
  });
  // `skip_week` refuses a week that has opened or still carries a slate, so it
  // is called on the draft the line above just made.
  await rpc(c.commish, "skip_week", { p_week_id: skippedId });
  console.log("  week 3 SKIPPED (no releases)");

  await ensureEdgeAnnouncement(leagueId);
}

main().catch((err) => {
  console.error("Seed crashed:", err);
  process.exit(2);
});

// ---------------------------------------------------------------------------
// League #5: "Dev Long Run" — the fixture that exists for VOLUME.
//
// Added 2026-09-02. Every league above it is small on purpose — 3 to 5 players,
// 1 to 4 weeks, each number an assertion about a specific state. That made them
// useless for the one question they were being asked: does a screen still hold
// up against a real league? A standings table of five, a bump chart with three
// points and a weeks ledger with four rows will look fine at any spacing. The
// imported seasons 31/32/33 are 14, 19 and 18 weeks with a full roster, and
// nothing seeded came within an order of magnitude of them.
//
// So: TEN players, TEN seasons, TEN weeks each. Seasons 1-9 are complete and
// fully scored; season 10 is live with weeks 1-9 final and week 10 OPEN on a
// real deadline. 100 weeks, 300 films, ~1,960 bids, all through the real RPCs
// so every derived number — standings, budgets, awards, head-to-head, the rank
// walk — is computed exactly as it is in production.
//
// ── THE DATA IS GENERATED, AND THE OUTCOME IS CHOSEN ──────────────────────
// `scripts/lib/long-run.mts` generates the league from a seeded PRNG and scores
// it with the database's own three rules, so the seed can be SEARCHED for the
// outcome the fixture needs rather than the standings being faked (they are
// derived; a faked row would be recomputed away). SEED 13 is the one that
// lands it, and what it lands is deliberate:
//
//   · dev-player finishes 6th of 10 in the live season — the only position
//     where BOTH halves of the season hero populate, with a player 8.38 points
//     ahead and another 4.37 behind.
//   · dev-player's ten seasons place 1,8,9,6,10,2,1,8,7,6 — two wins and a
//     last — so the records and history screens have a career to show rather
//     than ten identical finishes.
//   · Dev Grace takes four of the ten seasons, which gives the all-time
//     records a name that recurs.
//
// Changing SEED, the roster, or the three rules in `long-run.mts` changes all
// of that. The seed is not arbitrary; it is the search result.
//
// ── dev-commish COMMISSIONS IT ────────────────────────────────────────────
// The commissioner surfaces had never been driven against a league with a
// decade of history behind them, and the season queue is the block this page
// hides from a plain player. dev-player is an ordinary member, which is what
// makes it the account to review the player-facing screens from.
// ---------------------------------------------------------------------------

const LONG_RUN_NAME = "Dev Long Run";
/** The search result. See the header — this is not a nonce. */
const LONG_RUN_SEED = 13;
const LONG_RUN_SEASONS = 10;
const LONG_RUN_WEEKS = 10;
const LONG_RUN_FILMS_PER_WEEK = 3;
/**
 * Exactly 120, and the number is load-bearing: `generateSeason` shuffles the
 * pool, which consumes one PRNG draw per film, so a pool of a different size
 * shifts the whole stream and rebuilds a different league than the one SEED 13
 * was chosen for.
 */
const LONG_RUN_POOL_SIZE = 120;

const LONG_RUN_NEW_USERS = [
  { email: "dev-ivy@moviepool.local", name: "Dev Ivy" },
  { email: "dev-jonah@moviepool.local", name: "Dev Jonah" },
  { email: "dev-kira@moviepool.local", name: "Dev Kira" },
  { email: "dev-luis@moviepool.local", name: "Dev Luis" },
  { email: "dev-mira@moviepool.local", name: "Dev Mira" },
] as const;

/**
 * The roster, and the two numbers that separate them.
 *
 * `skill` is how well a player reads a slate and `appetite` is how much of the
 * bankroll they will commit in a week; between them they are the only reason
 * one player finishes above another. A league of ten identical players would
 * be ten coin flips and its standings would say nothing.
 */
const LONG_RUN_PLAYERS: LongRunPlayer[] = [
  { key: "commish", skill: 0.72, appetite: 0.3 },
  { key: "player", skill: 0.62, appetite: 0.26 },
  { key: "frank", skill: 0.8, appetite: 0.34 },
  { key: "grace", skill: 0.68, appetite: 0.22 },
  { key: "hana", skill: 0.58, appetite: 0.38 },
  { key: "ivy", skill: 0.75, appetite: 0.28 },
  { key: "jonah", skill: 0.5, appetite: 0.42 },
  { key: "kira", skill: 0.66, appetite: 0.24 },
  { key: "luis", skill: 0.55, appetite: 0.33 },
  { key: "mira", skill: 0.7, appetite: 0.2 },
];

const LONG_RUN_EMAIL: Record<string, string> = {
  commish: "dev-commish@moviepool.local",
  player: "dev-player@moviepool.local",
  frank: "dev-frank@moviepool.local",
  grace: "dev-grace@moviepool.local",
  hana: "dev-hana@moviepool.local",
  ivy: "dev-ivy@moviepool.local",
  jonah: "dev-jonah@moviepool.local",
  kira: "dev-kira@moviepool.local",
  luis: "dev-luis@moviepool.local",
  mira: "dev-mira@moviepool.local",
};

/**
 * The Friday `weeksBack` weeks before the NEXT Friday.
 *
 * The whole 100-week calendar is laid backwards from one anchor so the live
 * season's last week is the next Friday and every week before it steps back
 * exactly seven days — about 23 months of history, in order, with no gap for a
 * season boundary to fall into. UTC at both ends, for the reason `fridays()`
 * documents at length.
 */
function fridayBefore(weeksBack: number): string {
  const day = 24 * 60 * 60 * 1000;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const toFriday = (5 - today.getUTCDay() + 7) % 7 || 7;
  const next = today.getTime() + toFriday * day;
  return new Date(next - weeksBack * 7 * day).toISOString().slice(0, 10);
}

/**
 * 120 real films with posters, drawn from the catalog this database already
 * holds and ordered by tmdb id so the draw is the same on every machine.
 *
 * No TMDB call: 300 film slots over ten seasons would otherwise be 300 fetches
 * of titles the catalog cached long ago. Posters are required because the
 * screens this fixture exists to test — the picks rail, the film page — are
 * mostly poster.
 */
async function longRunFilmPool(): Promise<number[]> {
  const { data, error } = await admin
    .from("film_catalog")
    .select("tmdb_id")
    .not("poster_path", "is", null)
    .order("tmdb_id")
    .limit(LONG_RUN_POOL_SIZE);
  if (error) throw new Error(`film pool: ${error.message}`);
  if (!data || data.length < LONG_RUN_POOL_SIZE) {
    throw new Error(
      `film pool: need ${LONG_RUN_POOL_SIZE} catalog films with posters, found ${data?.length ?? 0}.`,
    );
  }
  return data.map((r) => r.tmdb_id);
}

async function seedLongRun(ids: Record<string, string>) {
  const { data: existing } = await admin
    .from("leagues")
    .select("id")
    .eq("name", LONG_RUN_NAME)
    .maybeSingle();
  if (existing) {
    for (const u of LONG_RUN_NEW_USERS) ids[u.email] = await ensureUser(u.email, u.name);
    const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const commish = users?.users.find((u) => u.email === LONG_RUN_EMAIL.commish);
    if (commish) await restoreCommissioner(existing.id, commish.id, LONG_RUN_NAME);
    console.log(`  "${LONG_RUN_NAME}" already seeded — skipping`);
    return;
  }

  console.log(
    `\nSeeding "${LONG_RUN_NAME}" (${LONG_RUN_PLAYERS.length} players, ` +
      `${LONG_RUN_SEASONS} seasons x ${LONG_RUN_WEEKS} weeks)…`,
  );
  console.log("  this one writes ~2,000 bids and takes a few minutes.");

  for (const u of LONG_RUN_NEW_USERS) ids[u.email] = await ensureUser(u.email, u.name);

  const c: Record<string, SupabaseClient> = {};
  for (const p of LONG_RUN_PLAYERS) c[p.key] = await signIn(LONG_RUN_EMAIL[p.key]);

  const leagueId = await rpc<string>(c.commish, "create_league", { p_name: LONG_RUN_NAME });
  for (const p of LONG_RUN_PLAYERS) {
    if (p.key === "commish") continue;
    await rpc(c.commish, "add_league_member", {
      p_league_id: leagueId,
      p_email: LONG_RUN_EMAIL[p.key],
      p_role: "player",
    });
  }
  console.log(`  created league with ${LONG_RUN_PLAYERS.length} members`);

  const filmPool = await longRunFilmPool();
  const totalWeeks = LONG_RUN_SEASONS * LONG_RUN_WEEKS;
  const deadline = (() => {
    const d = new Date(`${fridayBefore(0)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    d.setUTCHours(16, 0, 0, 0); // Thursday, ~noon US/Eastern
    return d.toISOString();
  })();

  for (let s = 0; s < LONG_RUN_SEASONS; s++) {
    const live = s === LONG_RUN_SEASONS - 1;
    // The open week is generated like any other — its bids are real bids — but
    // it is not scored, because an open week's bids are neither won nor paid.
    const scoredWeeks = live ? LONG_RUN_WEEKS - 1 : LONG_RUN_WEEKS;
    const { season, standings } = generateSeason({
      // 7919 is prime and larger than any draw a season makes, so no two
      // seasons share a stretch of the stream.
      seed: LONG_RUN_SEED + s * 7919,
      players: LONG_RUN_PLAYERS,
      weeks: LONG_RUN_WEEKS,
      filmsPerWeek: LONG_RUN_FILMS_PER_WEEK,
      filmPool,
      bankroll: 100,
      topN: 3,
      minBid: 1,
      scoredWeeks,
    });

    // ADR-020: a league may hold only ONE draft/active season, so each season
    // has to be finished before the next is created. Seasons are therefore
    // built oldest-first, which is also the order their numbers derive in.
    const seasonId = await rpc<string>(c.commish, "create_season", {
      p_league_id: leagueId,
      p_first_opening_date: futureFriday(),
      p_default_season_length: 1,
    });
    await clearSeededWeeks(admin, seasonId);
    await rpc(c.commish, "open_due_weeks_for_season", { p_season_id: seasonId });

    for (const [w, week] of season.weeks.entries()) {
      const globalWeek = s * LONG_RUN_WEEKS + w;
      const openThisWeek = live && w === LONG_RUN_WEEKS - 1;
      const weekId = await rpc<string>(c.commish, "create_week", {
        p_season_id: seasonId,
        p_number: w + 1,
        p_opening_date: fridayBefore(totalWeeks - 1 - globalWeek),
        p_bid_deadline: openThisWeek ? deadline : null,
      });

      const filmIds: Record<number, string> = {};
      for (const f of week.films) {
        filmIds[f.tmdbId] = (await addCatalogFilm(weekId, f.tmdbId)).id;
      }
      await rpc(c.commish, "open_week", { p_week_id: weekId });

      // One `place_bids` per player rather than one `place_bid` per film: it is
      // the RPC the bid form itself calls, it applies the whole-basket budget
      // check the way a real submission does, and it turns ~1,960 round trips
      // into ~900. The baskets are independent, so they go out together.
      const baskets = LONG_RUN_PLAYERS.map((p) => ({
        key: p.key,
        basket: week.films
          .filter((f) => f.bids[p.key] !== undefined)
          .map((f) => ({ film_id: filmIds[f.tmdbId], amount: f.bids[p.key] })),
      })).filter(
        ({ key, basket }) =>
          // THE ACTION STATE IS THE POINT OF AN OPEN WEEK. Everyone else has
          // bid — that is the who's-in signal — and the two accounts the UI is
          // reviewed from have not, so the season page's "place your bids" is
          // live rather than already answered.
          basket.length > 0 &&
          !(openThisWeek && (key === "player" || key === "commish")),
      );
      await Promise.all(
        baskets.map(({ key, basket }) => rpc(c[key], "place_bids", { p_bids: basket })),
      );

      if (openThisWeek) {
        console.log(
          `  S${s + 1} week ${w + 1} OPEN (deadline ${deadline}) — dev-player/dev-commish have not bid`,
        );
        break;
      }

      await rpc(c.commish, "close_week", { p_week_id: weekId });
      await Promise.all(
        week.films.map((f) =>
          rpc(c.commish, "capture_film", {
            p_film_id: filmIds[f.tmdbId],
            p_box_office_m: f.boxOfficeM,
            p_tomatometer: f.tomatometer,
          }),
        ),
      );
      await rpc(c.commish, "finalize_week", { p_week_id: weekId });
    }

    if (!live) {
      await rpc(c.commish, "update_season_status", {
        p_season_id: seasonId,
        p_status: "completed",
      });
    }
    const top = standings[0];
    const me = standings.find((r) => r.key === "player")!;
    console.log(
      `  season ${s + 1}/${LONG_RUN_SEASONS} ${live ? "LIVE" : "completed"} — ` +
        `won by ${top.key} (${top.points}) · dev-player ${me.place}${
          ["st", "nd", "rd"][me.place - 1] ?? "th"
        } with ${me.points}`,
    );
  }
}
