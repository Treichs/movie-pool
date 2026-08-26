-- ---------------------------------------------------------------------------
-- ONE WAY IN — the last three direct table writes become RPCs.
--
-- ADR-416 gate 1 rule 3: there is one way to reach data. Measured 2026-08-19,
-- src/ held exactly three writes that did not go through an RPC, against 55
-- that did. This migration removes all three, so the rule becomes true with NO
-- sanctioned-exception list — a check with nothing to grandfather cannot rot
-- the way an exception manifest does.
--
-- The ADR recorded TWO. There were three: the third is profiles.display_name,
-- which had been a deliberate ADR-004 exception since phase 2 and was correctly
-- documented as one. It is converted anyway, for a reason the other two do not
-- share — see below.
--
-- WHY display_name IS THE ONE THAT MATTERED. Revoking its column grant removes
-- `authenticated`'s LAST direct UPDATE privilege on any table in this schema.
-- Until now the rule was true in application code and false at the permission
-- layer: any authenticated session could have written that column directly,
-- whatever the app chose to do. After this, it cannot. That is a narrowing of
-- privilege, not a tidying of style.
--
-- It was also the odd one out inside a single file. src/app/(member)/account/
-- actions.ts edited display_name by table write and bio by the update_bio RPC —
-- same form, same kind of edit, two mechanisms.
--
-- WHY THE TWO email_log WRITES ARE HERE TOO, stated honestly because the
-- argument against them is real. They are called only by the cron routes, with
-- the service role, which bypasses RLS either way; a delivery log is not game
-- state and never feeds a score. So these two functions buy no security. They
-- were converted on a deliberate ruling (2026-08-19) that a rule with zero
-- exceptions is worth more than the ceremony it costs, because the alternative
-- is a sanctioned list that some later write quietly joins.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. display_name — the same shape as update_bio, which is the sibling this
--    should have matched from the start.
--
--    The 2..40 bounds are lifted from the server action that used to hold them
--    alone. They stay in the action too: it needs to return a message rather
--    than an exception, and a bound enforced only above the RPC is a bound the
--    RPC does not have.
-- ---------------------------------------------------------------------------
create or replace function public.update_display_name(p_name text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;
  if length(v_name) < 2 then
    raise exception 'a display name needs at least 2 characters';
  end if;
  if length(v_name) > 40 then
    raise exception 'a display name is capped at 40 characters';
  end if;

  update profiles set display_name = v_name where id = auth.uid();
end;
$$;

revoke all on function public.update_display_name(text) from public, anon;
grant execute on function public.update_display_name(text) to authenticated;

-- THE POINT OF THE WHOLE MIGRATION. `grant update (display_name) on
-- public.profiles to authenticated` (20260711151448_phase2_auth_profiles.sql)
-- was the last direct write privilege any API role held on any table. The row
-- policy profiles_update_own stays: it is what constrains the UPDATE this
-- function performs to the caller's own row, and dropping it would widen a
-- SECURITY DEFINER function to every profile.
revoke update (display_name) on public.profiles from authenticated;

-- ---------------------------------------------------------------------------
-- 2 + 3. The outbound mail ledger.
--
--    TWO functions rather than one with both scopes nullable, mirroring the two
--    unique constraints the table actually carries (email_log_week... and
--    email_log_season_dedupe) and the email_log_one_scope check that permits
--    exactly one of them. A single function taking both would be able to
--    express the state the table forbids.
--
--    ON CONFLICT names the constraint directly here. That is the small win
--    hiding in this half of the migration: 20260816150000 recorded that the
--    table carries two full unique constraints instead of one partial index
--    specifically because "supabase-js upserts can name either as its conflict
--    target (ON CONFLICT cannot infer a partial index through that client)".
--    In SQL that limit does not apply — the constraint choice is no longer
--    driven by what the JS client can express.
-- ---------------------------------------------------------------------------
create or replace function public.record_email(
  p_week_id    uuid,
  p_profile_id uuid,
  p_kind       text,
  p_status     text,
  p_error      text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into email_log (week_id, profile_id, kind, status, error)
  values (p_week_id, p_profile_id, p_kind, p_status, p_error)
  on conflict (week_id, profile_id, kind)
  do update set status = excluded.status,
                error  = excluded.error;
end;
$$;

create or replace function public.record_season_email(
  p_season_id  uuid,
  p_profile_id uuid,
  p_kind       text,
  p_status     text,
  p_error      text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into email_log (season_id, profile_id, kind, status, error)
  values (p_season_id, p_profile_id, p_kind, p_status, p_error)
  on conflict (season_id, profile_id, kind)
  do update set status = excluded.status,
                error  = excluded.error;
end;
$$;

-- The ledger has never been reachable by a signed-in user (email_log has RLS on
-- and deliberately no policies), and these functions do not change that. Only
-- the cron's service-role client may call them, which is exactly who called the
-- upserts they replace.
revoke all on function public.record_email(uuid, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.record_season_email(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_email(uuid, uuid, text, text, text)
  to service_role;
grant execute on function public.record_season_email(uuid, uuid, text, text, text)
  to service_role;

comment on function public.update_display_name(text) is
  'ADR-416 gate 1 rule 3: replaces the direct profiles.display_name write and '
  'the column grant that sanctioned it, so authenticated holds no direct UPDATE '
  'privilege on any table.';
