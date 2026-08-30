import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";
import { fetchOmdb, omdbConfigured } from "@/lib/omdb";

// The scheduled Tomatometer refresh (2026-08-03).
//
// WHY A VERCEL CRON AND NOT pg_cron. The bidding automation moved to pg_cron
// because Vercel's Hobby plan rejects sub-daily schedules — but that job is
// pure SQL, and pg_cron's whole advantage there was that it needed no secret
// anywhere. This one has to make an OUTBOUND HTTP call to OMDb, which Postgres
// cannot do without pg_net, and driving it from pg_net would mean putting
// CRON_SECRET into a database job definition. ADR-052's note is explicit that
// pg_cron was chosen "without moving a secret anywhere", so this stays in the
// application and accepts the plan's daily limit.
//
// DAILY IS ENOUGH, and the reason is what the number is for. This is an
// indicative score on a dashboard, not an input to scoring — the value that
// counts is the one the commissioner captures on Monday morning, and that path
// is untouched. A Tomatometer moves most in the days around release and then
// settles; a day-old figure is honest, and the UI says it is provisional.
//
// The refresh set is bounded by ratings_refresh_targets, not by this route:
// recent weeks, active slates, stale rows only, hard-capped. That is what
// makes the request count scale with how much pool is being played rather than
// with how many people load the dashboard — the failure mode this whole
// mechanism exists to remove.

export const maxDuration = 60;

export async function GET(request: Request) {
  // `!cronSecret` first — Vercel's documented shape. Without it an unset
  // variable makes the expected header the literal "Bearer undefined".
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!omdbConfigured()) {
    // Not an error. A deployment without the key simply has no cache to fill,
    // and the dashboard falls back to captured values only.
    return Response.json({ ok: true, skipped: "OMDB_API_KEY is unset" });
  }

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: targets, error } = await admin.rpc("ratings_refresh_targets", {
    p_stale_hours: 12,
    p_max: 120,
  });
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const ids = ((targets ?? []) as { imdb_id: string }[]).map((t) => t.imdb_id);
  let updated = 0;
  let noScore = 0;
  let failed = 0;

  // SEQUENTIAL, deliberately. OMDb's free tier is a daily request budget with
  // no documented burst allowance, and firing 120 concurrent requests is how a
  // key gets throttled or pulled. This route has a 60s budget and a hard cap
  // of 120 films; at OMDb's typical response time that fits with room to
  // spare, and a run that is cut short simply leaves the rest stale for
  // another day — which the staleness ordering then picks up first.
  for (const imdbId of ids) {
    // `fetch` directly rather than through Next's cache: this is the one call
    // site that MUST reach OMDb, and fetchOmdb's revalidate 900 would let a
    // scheduled run be served a cached body and write it back as fresh.
    const res = await fetchOmdb(imdbId, (input, init) =>
      fetch(input, { ...init, cache: "no-store" })
    );

    if (!res.ok) {
      failed++;
      await admin.rpc("record_film_rating", {
        p_imdb_id: imdbId,
        p_tomatometer: null,
        p_error: res.error.slice(0, 200),
      });
      continue;
    }

    // A film Rotten Tomatoes has not scored yet is a SUCCESS with a null
    // score, not a failure — that is what lets checked_at advance so an
    // unreleased film is not re-asked every run.
    if (res.data.tomatometer === null) noScore++;
    else updated++;

    await admin.rpc("record_film_rating", {
      p_imdb_id: imdbId,
      p_tomatometer: res.data.tomatometer,
      p_error: null,
    });
  }

  return Response.json({ ok: true, considered: ids.length, updated, noScore, failed });
}
