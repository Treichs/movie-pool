import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

// ADR-052 week automation. The schedule lives in pg_cron (job
// 'bidding-automation', every minute since 20260815220000) because Vercel's
// Hobby plan rejects sub-daily crons — an hourly entry in vercel.json once
// failed the whole deployment. This route stays as a CRON_SECRET-guarded
// MANUAL trigger; one RPC does all the work in SQL, so the L1 layer rule
// (queries live in the database, not in routes) holds.
export async function GET(request: Request) {
  if (
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: opened, error } = await admin.rpc("run_bidding_automation");
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true, opened });
}
