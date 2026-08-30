import type { WeekStatus } from "@/lib/commish";
import {
  getLeagueRecordBook,
  type CareerRow,
  type LeagueAggregates,
  type LeagueRecordBook,
} from "@/lib/league-records";
import type { SupabaseClient } from "@/lib/supabase";

// League data helpers (phase 11 / ADR-016). RLS scopes every read to
// leagues the caller belongs to.

export type LeagueRole = "commissioner" | "player";

export type LeagueMember = {
  id: string;
  role: LeagueRole;
  profile: { id: string; display_name: string; email: string };
};

export type LeagueSeason = {
  id: string;
  name: string;
  status: "draft" | "active" | "completed" | "archived";
  created_at: string;
};

export async function getLeague(
  supabase: SupabaseClient,
  leagueId: string
): Promise<{
  id: string;
  name: string;
  avatar_pair: number | null;
  avatar_glyph: string | null;
} | null> {
  const { data } = await supabase
    .from("leagues")
    .select("id, name, avatar_pair, avatar_glyph")
    .eq("id", leagueId)
    .maybeSingle();
  return data;
}

export async function getLeagueRoster(
  supabase: SupabaseClient,
  leagueId: string
): Promise<LeagueMember[]> {
  const { data } = await supabase
    .from("league_members")
    .select("id, role, profile:profiles(id, display_name, email)")
    .eq("league_id", leagueId)
    .order("created_at", { ascending: true });
  return (data ?? []) as unknown as LeagueMember[];
}

/**
 * WHEN THIS LEAGUE ACTUALLY STARTED PLAYING — the earliest week any of its
 * seasons has ever run, as a `week_of` date.
 *
 * NOT `leagues.created_at`, and the difference is not academic. A league whose
 * history was ingested from the old workbooks has a row created the day it was
 * imported: the replica of the real pool carries `created_at` of 2026-08-12
 * while its first week ran on 2024-01-15. Sourcing a "running since" line from
 * the league row would tell a nine-season pool it started this morning, on the
 * one surface built to celebrate how long it has been going.
 *
 * Null for a league that has seasons but no weeks in them yet — there is no
 * date to claim, and inventing one from the season row repeats the same bug a
 * level down.
 */
export async function getLeagueRunningSince(
  supabase: SupabaseClient,
  leagueId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("weeks")
    .select("week_of, season:seasons!inner(league_id)")
    .eq("season.league_id", leagueId)
    .order("week_of", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { week_of: string } | null)?.week_of ?? null;
}

export async function getLeagueSeasons(
  supabase: SupabaseClient,
  leagueId: string
): Promise<LeagueSeason[]> {
  // v_seasons, not seasons (ADR-099): the name is derived from the schedule
  // and this view is its one implementation.
  //
  // ORDERED BY THE DERIVED NUMBER, NOT `created_at`. The two agree for a league
  // that runs its seasons in order, and disagree exactly where it matters: a
  // BACKFILLED season (the historical-ingest path, ADR-406) is created last but
  // played first, so `v_seasons` renumbers it Season 1 while `created_at` puts
  // it at the top. The season rail would then list "Season 1" above Season 9,
  // labelled by one ordering and sorted by another. nav.ts already made this
  // call for the nav — "created_at would order by when a commissioner happened
  // to click rather than by when the season is played" — and this is the same
  // fact one layer down.
  //
  // NULLS FIRST is deliberate: `number` is null only for a season with no weeks
  // yet, which is one a commissioner has just created, and that is the season
  // they want at the top rather than buried under the played ones.
  const { data } = await supabase
    .from("v_seasons")
    .select("id, name, status, created_at")
    .eq("league_id", leagueId)
    .order("number", { ascending: false, nullsFirst: true });
  return (data ?? []) as LeagueSeason[];
}

// The one season that is currently the league's focus — draft or active (ADR-020
// allows at most one). Everything the League page's prominent season block and
// its Members panel need about it, in one place:
//  - playerCount + openWeek + deadline for the rich current-season card;
//  - the set of profile_ids IN the season (only when ACTIVE — a draft season
//    isn't roster-locked yet), which drives the Members "Lead vs Supporting"
//    split: Lead = in the active season, Supporting = a league member waiting
//    out the lock to join next season;
//  - the viewer's own season_member id, so the latest-results rail can mark
//    films they own without a second lookup.
// A league member can read a season's members/weeks even when not enrolled
// (is_season_member widens to league membership, phase 11), so this is complete
// regardless of who asks.
export type LeaguePlayer = { profileId: string; name: string; isMe: boolean };
export type LeagueWeek = {
  id: string;
  number: number;
  status: WeekStatus;
  bidDeadline: string | null;
};

export type LeagueCurrentSeason = {
  season: { id: string; name: string; status: LeagueSeason["status"] } | null;
  players: LeaguePlayer[];
  weeks: LeagueWeek[];
  activeMemberProfileIds: Set<string>;
  myMemberId: string | null;
};

export async function getLeagueCurrentSeason(
  supabase: SupabaseClient,
  leagueId: string,
  userId: string,
  /**
   * A specific season to read instead of the league's live one.
   *
   * Added 2026-08-05 for League Home's season picker. Without it the page could
   * only ever describe the draft-or-active season, which is why finished
   * seasons needed a separate archive panel that could show their winners but
   * was not a way to GO to one. Scoped by league_id as well as id, so a
   * `?season=` naming someone else's season resolves to nothing rather than to
   * a season this league does not own.
   */
  seasonId?: string | null
): Promise<LeagueCurrentSeason> {
  const empty: LeagueCurrentSeason = {
    season: null,
    players: [],
    weeks: [],
    activeMemberProfileIds: new Set(),
    myMemberId: null,
  };

  const base = supabase
    .from("v_seasons")
    .select("id, name, status")
    .eq("league_id", leagueId);
  const { data: seasonRow } = seasonId
    ? await base.eq("id", seasonId).limit(1)
    : await base
        .in("status", ["draft", "active"])
        .order("created_at", { ascending: false })
        .limit(1);
  const season = (seasonRow ?? [])[0] as LeagueCurrentSeason["season"];
  if (!season) return empty;

  const [membersRes, weeksRes] = await Promise.all([
    supabase
      .from("season_members")
      .select("id, profile_id, profile:profiles(display_name)")
      .eq("season_id", season.id),
    supabase
      .from("weeks")
      .select("id, number, status, bid_deadline")
      .eq("season_id", season.id)
      .order("number"),
  ]);

  const members = (membersRes.data ?? []) as unknown as {
    id: string;
    profile_id: string;
    profile: { display_name: string } | null;
  }[];
  const weeks = (weeksRes.data ?? []) as {
    id: string;
    number: number;
    status: WeekStatus;
    bid_deadline: string | null;
  }[];

  return {
    season,
    players: members.map((m) => ({
      profileId: m.profile_id,
      name: m.profile?.display_name ?? "Unknown player",
      isMe: m.profile_id === userId,
    })),
    weeks: weeks.map((w) => ({
      id: w.id,
      number: w.number,
      status: w.status,
      bidDeadline: w.bid_deadline,
    })),
    // Lead/Supporting only means something once the season is locked (active).
    activeMemberProfileIds:
      season.status === "active"
        ? new Set(members.map((m) => m.profile_id))
        : new Set<string>(),
    myMemberId: members.find((m) => m.profile_id === userId)?.id ?? null,
  };
}

// getSeasonRecentResults and getPastSeasonsWinners were deleted here on
// 2026-08-09 (state audit): both were exported, ran real reads, and had no
// caller anywhere in src/ or scripts/ — the career table and record book
// superseded the surfaces they were built for.

// The league activity feed. Reads through get_league_activity, which is the
// only door into audit_log (deny-all RLS, service-role otherwise) and returns
// a curated whitelist rather than raw rows — see the migration for why the
// `detail` payload deliberately never crosses this boundary.

export type LeagueActivity = {
  /** audit_log.id is a bigint — the RPC returns it as a number. */
  id: number;
  action: string;
  at: string;
  /** ADR-082: an audit line names an ACCOUNT. Null for a system-authored row
   *  (the cron opening a week) — audit_log.actor is nullable. */
  actorId: string | null;
  actorName: string | null;
  /** The season an event belongs to — league-scoped events (a member joining)
   *  carry none. Returned so the settings overlay's Corrections pane can link
   *  to the season a correction happened in. */
  seasonId: string | null;
  seasonName: string | null;
  weekNumber: number | null;
};

export async function getLeagueActivity(
  supabase: SupabaseClient,
  leagueId: string,
  limit = 12
): Promise<LeagueActivity[]> {
  const { data, error } = await supabase.rpc("get_league_activity", {
    p_league_id: leagueId,
    p_limit: limit,
  });
  // A rail is an accessory to the League page, never its reason to render — so
  // a failure here degrades to an empty feed rather than a 500.
  //
  // BUT IT IS LOGGED NOW (2026-08-04), because the silence cost a day. Two
  // ADR-060 migrations reintroduced a `column reference "id" is ambiguous`
  // error into this RPC, and because the empty return is indistinguishable from
  // a genuinely quiet league, League Home showed "Nothing has happened here
  // yet" for leagues with thousands of audit rows and nothing anywhere said
  // otherwise. Swallowing an error to protect the render is right; swallowing
  // the fact that there WAS one is not.
  if (error) {
    console.error("getLeagueActivity failed", { leagueId, error: error.message });
  }
  if (error || !data) return [];
  return (
    data as {
      id: number;
      action: string;
      at: string;
      actor_id: string | null;
      actor_name: string | null;
      season_id: string | null;
      season_name: string | null;
      week_number: number | null;
    }[]
  ).map((r) => ({
    id: r.id,
    action: r.action,
    at: r.at,
    actorId: r.actor_id,
    actorName: r.actor_name,
    seasonId: r.season_id,
    seasonName: r.season_name,
    weekNumber: r.week_number,
  }));
}

/** One commissioner-authored note on League Home. */
export type LeagueAnnouncement = {
  id: string;
  /** The one-line label. Always present (ADR-084). */
  title: string;
  /** The long form, read on the announcement's own page. Null when the title
   *  said everything there was to say. */
  body: string | null;
  at: string;
  authorName: string | null;
  authorId: string;
};

const ANNOUNCEMENT_COLUMNS =
  "id, title, body, created_at, author_id, profiles!inner(display_name)";

type AnnouncementRow = {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
  author_id: string;
  profiles: { display_name: string | null } | null;
};

const toAnnouncement = (r: AnnouncementRow): LeagueAnnouncement => ({
  id: r.id,
  title: r.title,
  body: r.body,
  at: r.created_at,
  authorName: r.profiles?.display_name ?? null,
  authorId: r.author_id,
});

// Announcements are read STRAIGHT off the table rather than through an RPC,
// which is the opposite of how the activity feed works — and the difference is
// the point. Activity comes from audit_log, a deny-all table whose whole
// safety story is that one SECURITY DEFINER function returns a curated slice.
// This table has an ordinary SELECT policy (`is_league_member`), so the policy
// IS the access control and a function wrapping it would add a second place
// for that rule to live without adding a check.
export async function getLeagueAnnouncements(
  supabase: SupabaseClient,
  leagueId: string,
  limit = 30
): Promise<LeagueAnnouncement[]> {
  const { data, error } = await supabase
    .from("league_announcements")
    .select(ANNOUNCEMENT_COLUMNS)
    .eq("league_id", leagueId)
    .order("created_at", { ascending: false })
    .limit(limit);
  // Same posture as the activity feed: a panel is an accessory to League Home,
  // never its reason to render.
  if (error || !data) return [];
  return (data as unknown as AnnouncementRow[]).map(toAnnouncement);
}

/**
 * One announcement, for its own page (ADR-084).
 *
 * Unlike the list, this one DOES distinguish "not found" from "empty": the
 * page it feeds has nothing else on it, so a missing row is a 404 rather than
 * a quiet gap. The league id is part of the lookup so a member cannot read an
 * announcement by guessing an id from a league they are not in — RLS would
 * refuse anyway, and this makes the URL honest as well.
 */
export async function getLeagueAnnouncement(
  supabase: SupabaseClient,
  leagueId: string,
  announcementId: string
): Promise<LeagueAnnouncement | null> {
  const { data, error } = await supabase
    .from("league_announcements")
    .select(ANNOUNCEMENT_COLUMNS)
    .eq("league_id", leagueId)
    .eq("id", announcementId)
    .maybeSingle();
  if (error || !data) return null;
  return toAnnouncement(data as unknown as AnnouncementRow);
}

// ---------------------------------------------------------------------------
// LEAGUE HOME (board 4.2) — the composer for `/leagues/[leagueId]`.
// ---------------------------------------------------------------------------

/**
 * THE CAREER TABLE IS THE ROSTER, and that is not a shortcut.
 * `CareerRow` already carries `name`, `isMe`, `isCommissioner`, `seasons` and
 * `points` — every column board 4.2's members list draws — and
 * `league-records.ts` says so itself: "the career table can stand in for the
 * roster (ADR-083)". Calling `getLeagueRoster` as well would be a second query
 * answering a question this one has already answered.
 *
 * DUES IS ABSENT, AND IT IS ABSENT FROM THE DATABASE. Board 4.2 draws a dues
 * panel and the plan carries a whole screen for it (Task 21), but there is no
 * dues table, no payments table and no composer — checked across all 116
 * migrations on 2026-08-29. It is a domain nobody has modelled yet, not a read
 * nobody has written, so this page cannot show a balance and the prototype's
 * dues strip has nothing to render. Raised rather than stubbed.
 */
export type LeagueRecordsPage = {
  league: { id: string; name: string };
  /** Null when the league has no season yet, or no standing in any of them —
   *  `getLeagueRecordBook`'s own two null cases, kept apart from "no league",
   *  which 404s. */
  book: LeagueRecordBook | null;
};

/**
 * `/leagues/[leagueId]/records` — board 4.3.
 *
 * THE RECORD BOOK IS NOT REBUILT HERE. `getLeagueRecordBook` already computes
 * the whole thing and is the composer this screen was always meant to use.
 * What it does NOT do is fetch the league or its seasons — its `seasons`
 * parameter exists precisely so a caller passes the list it already has, which
 * is what `getLeagueHome` does below. This is the same three reads, keeping
 * the one field the home page drops: `records`.
 *
 * THE GATE IS THE FIRST READ, AND IT IS RLS'S. `leagues` gates SELECT on
 * `is_league_member`, so a league the viewer does not belong to comes back
 * null and the page 404s — indistinguishable from one that does not exist,
 * which is the right answer to give a stranger holding an id.
 */
export async function getLeagueRecordsPage(
  ctx: { supabase: SupabaseClient; user: { id: string } },
  leagueId: string
): Promise<LeagueRecordsPage | null> {
  const { supabase, user } = ctx;

  const league = await getLeague(supabase, leagueId);
  if (!league) return null;

  const seasons = await getLeagueSeasons(supabase, leagueId);
  const book = await getLeagueRecordBook(supabase, seasons, user.id);

  return { league: { id: league.id, name: league.name }, book };
}

export type LeagueHome = {
  league: { id: string; name: string; glyph: string | null };
  isCommissioner: boolean;
  runningSince: string | null;
  /** Every season, newest first — the archive AND the record book's input. */
  seasons: LeagueSeason[];
  current: LeagueCurrentSeason;
  /** The earliest week still taking bids, which is what the thread counts to. */
  openWeek: LeagueWeek | null;
  career: CareerRow[];
  aggregates: LeagueAggregates | null;
  announcements: LeagueAnnouncement[];
};

export async function getLeagueHome(
  ctx: { supabase: SupabaseClient; user: { id: string } },
  leagueId: string
): Promise<LeagueHome | null> {
  const { supabase, user } = ctx;

  // THE GATE IS THE FIRST READ AND IT IS RLS'S. `leagues` gates SELECT on
  // `is_league_member`, so a league the viewer does not belong to comes back
  // null and the page 404s — indistinguishable from one that does not exist,
  // which is the correct answer to give a stranger holding an id.
  const league = await getLeague(supabase, leagueId);
  if (!league) return null;

  const [seasons, runningSince, current, announcements] = await Promise.all([
    getLeagueSeasons(supabase, leagueId),
    getLeagueRunningSince(supabase, leagueId),
    getLeagueCurrentSeason(supabase, leagueId, user.id),
    getLeagueAnnouncements(supabase, leagueId, 2),
  ]);

  // The record book takes the seasons this page already fetched rather than
  // fetching its own — its parameter exists for exactly that.
  const book = await getLeagueRecordBook(supabase, seasons, user.id);

  const career = book?.career ?? [];
  const me = career.find((row) => row.isMe);

  // Two weeks can be open at once (2026-08-03), and the earliest is the one
  // with a deadline actually approaching — the same rule `getNavLeagues` uses
  // for the shell's countdown, so the two never disagree.
  const openWeek =
    current.weeks
      .filter((w) => w.status === "open")
      .sort((a, b) => a.number - b.number)[0] ?? null;

  return {
    league: { id: league.id, name: league.name, glyph: league.avatar_glyph },
    isCommissioner: me?.isCommissioner ?? false,
    runningSince,
    seasons,
    current,
    openWeek,
    career,
    aggregates: book?.aggregates ?? null,
    announcements,
  };
}
