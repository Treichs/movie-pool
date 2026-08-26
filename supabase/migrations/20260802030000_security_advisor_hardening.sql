-- The two actionable database items from the live Supabase security advisor
-- (bug-backlog, filed 2026-07-17, re-scanned 2026-08-01).
--
-- Explicitly NOT addressed here, because they are the architecture rather than
-- bugs — do not "fix" them later without reading ADR-004:
--   * ~53 "authenticated can execute a SECURITY DEFINER function" warnings.
--     That IS the app: every write goes through a self-authorizing RPC that
--     re-checks is_commissioner / is_season_member internally. Switching them
--     to SECURITY INVOKER would break every write path in the product.
--   * audit_log and email_log have RLS enabled with no policies. That is a
--     deliberate deny-all: they are service-role-only tables, and a policy
--     would widen them.
--
-- ---------------------------------------------------------------------------
-- 1. rls_auto_enable() must not be callable through the API.
--
-- It is an EVENT TRIGGER function — it reads pg_event_trigger_ddl_commands()
-- and turns RLS on for newly created public tables. It is not ours (it is not
-- defined anywhere in supabase/migrations; it arrived with project tooling),
-- and outside an event-trigger context that call returns nothing, so exposure
-- is not currently exploitable. It is still the only anon-callable function in
-- the schema and has no business being on /rest/v1/rpc at all.
--
-- Revoking EXECUTE does NOT stop the event trigger: event triggers run the
-- function as its owner, independently of role grants. Only the REST path
-- closes.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Pin the search_path on the three functions that still float.
--
-- A mutable search_path lets an unqualified name inside a function resolve
-- against a schema the caller controls. These three are SECURITY INVOKER
-- (verified in pg_proc), so the exposure is far smaller than for the RPCs —
-- this is hygiene rather than a hole, and it clears the warning so a real one
-- is not buried in it later. Every RPC in the app already pins it; these three
-- predate that convention:
--
--   * week_of(date)              — the ADR-042 Monday anchor, used by the
--                                  weeks.week_of GENERATED column.
--   * gate_week_bid_deadline()   — the trigger keeping a bid deadline inside
--                                  its own Mon–Sun week.
--   * gate_film_release_date()   — the matching guard for film dates.
--
-- ALTER FUNCTION ... SET only attaches a configuration parameter; it does not
-- touch the body or the volatility, so the generated column that depends on
-- week_of() is unaffected and needs no rebuild.
-- ---------------------------------------------------------------------------
alter function public.week_of(date) set search_path = public, pg_catalog;
alter function public.gate_week_bid_deadline() set search_path = public, pg_catalog;
alter function public.gate_film_release_date() set search_path = public, pg_catalog;
