-- Close the last three functions still callable by `anon`.
--
-- Postgres grants EXECUTE to PUBLIC on every new function by default, and `anon`
-- and `authenticated` both inherit from PUBLIC. So a SECURITY DEFINER function
-- in `public` is a public API endpoint the moment it is created — reachable at
-- /rest/v1/rpc/<name> with nothing but the publishable key, which is public by
-- design. Supabase's own advisor flags this as
-- `anon_security_definer_function_executable`, and on 2026-08-14 it named
-- exactly three: create_league, create_season, season_bidding_has_begun.
--
-- NOT A HOLE TODAY, and this migration is not a panic. Each one was probed
-- unauthenticated before writing this: create_league returns 400 "not signed in"
-- and creates nothing (row count verified at zero afterwards) because its body
-- opens with `if auth.uid() is null then raise exception`; create_season goes
-- through is_league_commissioner(), which cannot pass for a null uid; and
-- season_bidding_has_begun is a boolean read about a season id you would have to
-- already know. The bodies hold. This closes the outer door as well, so the
-- guard is defence in depth rather than the only thing standing there.
--
-- IT IS ALSO A CONSISTENCY FIX. 20260801230000_league_invites.sql ends with
-- `revoke all on function ... from public, anon` for every function it defines
-- and grants each one to `authenticated` explicitly. That migration set the
-- house pattern; these three were written before it or beside it and never
-- picked it up. Matching them means "which roles may call this" is answered the
-- same way everywhere instead of depending on when a function happened to be
-- written.
--
-- WHY authenticated IS RE-GRANTED RATHER THAN LEFT ALONE. Revoking from PUBLIC
-- removes the privilege that `authenticated` was inheriting, so the grant has to
-- be restated or the app breaks. create_league and create_season already carry
-- their own explicit grant, and the restatement is a no-op for them; it is
-- written anyway so the file reads as the complete access statement for each
-- function rather than a diff against what happens to be there.
--
-- season_bidding_has_begun had NO explicit grant at all — only the PUBLIC
-- default. It is called from inside other SECURITY DEFINER functions (which run
-- as the owner and are unaffected) and from a plain SQL statement in
-- 20260804090000's roster backfill. Granting `authenticated` keeps every
-- in-app path working; nothing in src/ calls it directly.

revoke all on function public.create_league(text, text, smallint, text)
  from public, anon;
grant execute on function public.create_league(text, text, smallint, text)
  to authenticated;

revoke all on function public.create_season(
  uuid, integer, integer, integer, integer, jsonb, integer, time, text, integer, boolean
) from public, anon;
grant execute on function public.create_season(
  uuid, integer, integer, integer, integer, jsonb, integer, time, text, integer, boolean
) to authenticated;

revoke all on function public.season_bidding_has_begun(uuid) from public, anon;
grant execute on function public.season_bidding_has_begun(uuid) to authenticated;
