-- ============================================================================
-- `search_invitable_profiles` learns to work before the league exists.
--
-- The function was written for a picker that was never built, and it takes a
-- league id: it gates on `is_league_commissioner(p_league_id)` and reports
-- `already_member` against that league. That is right for league settings and
-- IMPOSSIBLE for the new-league wizard, which is deliberately "four steps, one
-- submit" — no league row exists while the commissioner is typing names, and
-- creating one early would leave a half-built league behind every time someone
-- closed the tab on step three.
--
-- So `p_league_id` becomes optional:
--
--   given     → commissioner of THAT league, and `already_member` is real.
--   omitted   → any signed-in user, and `already_member` is always false
--               because there is no league to be a member of yet.
--
-- ── WHAT THAT WIDENS, STATED PLAINLY ──────────────────────────────────────
-- Before: you had to commission a league to search names. After: any signed-in
-- account can. That reads like a real loosening and is close to none, because
-- `create_league` is granted to every authenticated user with no gate beyond
-- being signed in — "commissioner of some league" was already one click away
-- from "anybody". The gate was a ritual, not a control.
--
-- THE CONTROL THAT ACTUALLY MATTERS IS UNCHANGED, and it is the asymmetry
-- below: display names match on SUBSTRING, emails only on an EXACT match. You
-- can type "chr" and find Chris; you cannot type "@gmail" and walk the user
-- table. The UI must not undo it either — it renders names, never an address it
-- learned here.
--
-- ── AND IT STOPS RETURNING THE CALLER ─────────────────────────────────────
-- Inviting yourself is not a thing. It never showed up in league settings by
-- accident, because you are already a member there and the row came back
-- disabled; with no league that accident stops being covered, so the exclusion
-- is explicit rather than incidental.
--
-- Dropped and recreated rather than replaced: `create or replace` cannot add a
-- default to an existing argument. Nothing calls it yet, so nothing breaks.
-- ============================================================================

drop function if exists public.search_invitable_profiles(uuid, text);

create function public.search_invitable_profiles(
  p_league_id uuid default null,
  p_query     text default ''
)
returns table (profile_id uuid, display_name text, already_member boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_q text := trim(coalesce(p_query, ''));
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;
  -- Only when a league is named. With none there is nothing to commission.
  if p_league_id is not null and not is_league_commissioner(p_league_id) then
    raise exception 'only the league commissioner can search for members';
  end if;
  if length(v_q) < 3 then
    return; -- empty result, not an error: the UI asks as you type
  end if;

  return query
  select p.id,
         p.display_name,
         p_league_id is not null and exists (
           select 1 from league_members lm
           where lm.league_id = p_league_id and lm.profile_id = p.id
         )
  from profiles p
  where p.id <> auth.uid()
    and (
      p.display_name ilike '%' || v_q || '%'
      or lower(p.email) = lower(v_q)   -- EXACT only; no partial email matching
    )
  order by (p.display_name ilike v_q || '%') desc, p.display_name
  limit 8;
end;
$$;

revoke all on function public.search_invitable_profiles(uuid, text) from public, anon;
grant execute on function public.search_invitable_profiles(uuid, text) to authenticated;

comment on function public.search_invitable_profiles(uuid, text) is
  'Type-ahead for inviting someone who already has an account. Names match on '
  'substring, emails ONLY in full — that asymmetry is what stops this being an '
  'address-harvesting endpoint. Never returns an email; callers invite by '
  'profile id and create_league_invite looks the address up.';
