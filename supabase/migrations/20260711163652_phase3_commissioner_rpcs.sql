-- ============================================================================
-- Phase 3 — Commissioner config + season/week/slate management RPCs
--
-- Sources of truth:
--   Docs/design/v1_build_plan.md §3 (data model) §6 (application structure)
--   Docs/reference/movie_pool_official_rules.md (canonical rulebook)
--   ADR-004 deny-by-default exposure   ADR-007 commissioner-side memberships
--   ADR-008 open season creation       ADR-009 mutable rules with audit
--
-- Same conventions as phase 1: every write goes through a SECURITY DEFINER
-- RPC with pinned search_path; no table write policies exist, so these RPCs
-- (and the service role) are the only write paths.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Seed the OQ-5 payout hypothesis as the column default so every new
--    rule_configs row starts from the Season 30 reconstruction (management
--    doc §5). Commissioner must still ratify — the rules UI says so.
-- ---------------------------------------------------------------------------
alter table public.rule_configs
  alter column payout_structure set default
    '{"first_pct": 70, "second_pct": 30, "third": "buy_in_refund", "efficiency_prize": 50, "dessert_penalty": 10}'::jsonb;

-- Backfill rows that still carry the empty default (dev fixtures).
update public.rule_configs
  set payout_structure =
    '{"first_pct": 70, "second_pct": 30, "third": "buy_in_refund", "efficiency_prize": 50, "dessert_penalty": 10}'::jsonb
  where payout_structure = '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 1. create_season — ADR-008: any signed-in user may create a season and
--    becomes its commissioner. Atomic: season + default rules + membership.
-- ---------------------------------------------------------------------------
create or replace function public.create_season(p_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_season_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'season needs a name';
  end if;

  insert into seasons (name, created_by)
  values (trim(p_name), auth.uid())
  returning id into v_season_id;

  -- Rulebook defaults come from the column defaults set in phase 1 / above.
  insert into rule_configs (season_id) values (v_season_id);

  insert into season_members (season_id, profile_id, role)
  values (v_season_id, auth.uid(), 'commissioner');

  insert into audit_log (season_id, actor, action, detail)
  values (v_season_id, auth.uid(), 'create_season',
          jsonb_build_object('name', trim(p_name)));

  return v_season_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. update_season_status — forward-only lifecycle:
--    draft → active → completed → archived.
-- ---------------------------------------------------------------------------
create or replace function public.update_season_status(
  p_season_id uuid,
  p_status    public.season_status
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_season seasons%rowtype;
  v_ok boolean;
begin
  select * into v_season from seasons where id = p_season_id for update;
  if not found then
    raise exception 'season not found';
  end if;
  if not is_commissioner(p_season_id) then
    raise exception 'only the commissioner can change the season status';
  end if;

  v_ok := (v_season.status = 'draft'     and p_status = 'active')
       or (v_season.status = 'active'    and p_status = 'completed')
       or (v_season.status = 'completed' and p_status = 'archived');
  if not v_ok then
    raise exception 'cannot move season from % to %', v_season.status, p_status;
  end if;

  update seasons set status = p_status where id = p_season_id;

  insert into audit_log (season_id, actor, action, detail)
  values (p_season_id, auth.uid(), 'update_season_status',
          jsonb_build_object('from', v_season.status, 'to', p_status));
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. update_rule_config — ADR-009: editable in any season status; once the
--    season is past draft every change is audit-logged with old/new values
--    (the UI additionally warns). award_defs stays out of the v1 form.
-- ---------------------------------------------------------------------------
create or replace function public.update_rule_config(
  p_season_id             uuid,
  p_fake_bankroll         integer,
  p_screen_threshold      integer,
  p_top_n_distinct        integer,
  p_min_bid               integer,
  p_capture_timing        text,
  p_bid_deadline_default  text,
  p_include_previews      boolean,
  p_preview_start_weekday public.weekday_start,
  p_buy_in                integer,
  p_payout_structure      jsonb
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_season seasons%rowtype;
  v_old    rule_configs%rowtype;
begin
  select * into v_season from seasons where id = p_season_id;
  if not found then
    raise exception 'season not found';
  end if;
  if not is_commissioner(p_season_id) then
    raise exception 'only the commissioner can change the rules';
  end if;

  select * into v_old from rule_configs where season_id = p_season_id for update;
  if not found then
    raise exception 'season has no rule configuration';
  end if;

  -- Column CHECK constraints enforce the numeric floors (bankroll > 0 etc.).
  update rule_configs set
    fake_bankroll         = p_fake_bankroll,
    screen_threshold      = p_screen_threshold,
    top_n_distinct        = p_top_n_distinct,
    min_bid               = p_min_bid,
    capture_timing        = p_capture_timing,
    bid_deadline_default  = p_bid_deadline_default,
    include_previews      = p_include_previews,
    preview_start_weekday = p_preview_start_weekday,
    buy_in                = p_buy_in,
    payout_structure      = p_payout_structure
  where season_id = p_season_id;

  if v_season.status <> 'draft' then
    insert into audit_log (season_id, actor, action, detail)
    values (p_season_id, auth.uid(), 'update_rule_config',
            jsonb_build_object(
              'old', to_jsonb(v_old) - 'id' - 'season_id' - 'created_at',
              'new', jsonb_build_object(
                'fake_bankroll', p_fake_bankroll,
                'screen_threshold', p_screen_threshold,
                'top_n_distinct', p_top_n_distinct,
                'min_bid', p_min_bid,
                'capture_timing', p_capture_timing,
                'bid_deadline_default', p_bid_deadline_default,
                'include_previews', p_include_previews,
                'preview_start_weekday', p_preview_start_weekday,
                'buy_in', p_buy_in,
                'payout_structure', p_payout_structure)));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Roster management — ADR-007: season_members writes are commissioner-side.
--    Lookup is by exact email inside SECURITY DEFINER, so commissioners never
--    get to browse profiles they couldn't already see.
-- ---------------------------------------------------------------------------
create or replace function public.add_season_member(
  p_season_id uuid,
  p_email     text,
  p_role      public.member_role default 'player'
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_profile_id uuid;
  v_member_id  uuid;
begin
  if not is_commissioner(p_season_id) then
    raise exception 'only the commissioner can add players';
  end if;

  select id into v_profile_id
  from profiles
  where lower(email) = lower(trim(p_email));
  if not found then
    raise exception 'no account found for % — they need to sign up first', trim(p_email);
  end if;

  if exists (select 1 from season_members
             where season_id = p_season_id and profile_id = v_profile_id) then
    raise exception 'that account is already in this season';
  end if;

  insert into season_members (season_id, profile_id, role)
  values (p_season_id, v_profile_id, p_role)
  returning id into v_member_id;

  insert into audit_log (season_id, actor, action, detail)
  values (p_season_id, auth.uid(), 'add_season_member',
          jsonb_build_object('profile_id', v_profile_id, 'role', p_role));

  return v_member_id;
end;
$$;

create or replace function public.remove_season_member(p_member_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_member season_members%rowtype;
begin
  select * into v_member from season_members where id = p_member_id for update;
  if not found then
    raise exception 'member not found';
  end if;
  if not is_commissioner(v_member.season_id) then
    raise exception 'only the commissioner can remove members';
  end if;

  -- A member with bids is part of season history — removal would corrupt
  -- standings. Film removal/refund (phase 7) is the tool for cleanup.
  if exists (select 1 from bids where season_member_id = p_member_id) then
    raise exception 'cannot remove a member who has placed bids';
  end if;

  if v_member.role = 'commissioner' and not exists (
    select 1 from season_members
    where season_id = v_member.season_id
      and role = 'commissioner'
      and id <> p_member_id
  ) then
    raise exception 'cannot remove the only commissioner';
  end if;

  delete from season_members where id = p_member_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_member.season_id, auth.uid(), 'remove_season_member',
          jsonb_build_object('profile_id', v_member.profile_id, 'role', v_member.role));
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Week lifecycle. Weeks are born draft (slate under construction),
--    published to open (bidding), then locked by close_week (phase 1).
-- ---------------------------------------------------------------------------
create or replace function public.create_week(
  p_season_id    uuid,
  p_number       integer,
  p_opening_date date,
  p_bid_deadline timestamptz default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_week_id uuid;
begin
  if not is_commissioner(p_season_id) then
    raise exception 'only the commissioner can create weeks';
  end if;
  if p_number is null or p_number < 1 then
    raise exception 'week number must be 1 or higher';
  end if;
  if p_opening_date is null then
    raise exception 'week needs an opening date';
  end if;
  if exists (select 1 from weeks where season_id = p_season_id and number = p_number) then
    raise exception 'week % already exists in this season', p_number;
  end if;

  insert into weeks (season_id, number, opening_date, bid_deadline)
  values (p_season_id, p_number, p_opening_date, p_bid_deadline)
  returning id into v_week_id;

  insert into audit_log (season_id, actor, action, detail)
  values (p_season_id, auth.uid(), 'create_week',
          jsonb_build_object('week_id', v_week_id, 'week_number', p_number,
                             'opening_date', p_opening_date));

  return v_week_id;
end;
$$;

create or replace function public.update_week(
  p_week_id      uuid,
  p_opening_date date,
  p_bid_deadline timestamptz
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_week weeks%rowtype;
begin
  select * into v_week from weeks where id = p_week_id for update;
  if not found then
    raise exception 'week not found';
  end if;
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can edit weeks';
  end if;
  -- The deadline is advisory (ADR-003), so it stays editable while bidding
  -- is open; once locked the week is history.
  if v_week.status not in ('draft', 'open') then
    raise exception 'week can no longer be edited (status: %)', v_week.status;
  end if;
  if p_opening_date is null then
    raise exception 'week needs an opening date';
  end if;

  update weeks
  set opening_date = p_opening_date, bid_deadline = p_bid_deadline
  where id = p_week_id;
end;
$$;

create or replace function public.open_week(p_week_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_week weeks%rowtype;
begin
  select * into v_week from weeks where id = p_week_id for update;
  if not found then
    raise exception 'week not found';
  end if;
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can open bidding';
  end if;
  if v_week.status <> 'draft' then
    raise exception 'only a draft week can be opened (status: %)', v_week.status;
  end if;
  if not exists (
    select 1 from films
    where week_id = p_week_id and status = 'active' and eligible
  ) then
    raise exception 'add at least one eligible film before opening bidding';
  end if;

  update weeks set status = 'open' where id = p_week_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(), 'open_week',
          jsonb_build_object('week_id', p_week_id, 'week_number', v_week.number));
end;
$$;

create or replace function public.delete_week(p_week_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_week weeks%rowtype;
begin
  select * into v_week from weeks where id = p_week_id for update;
  if not found then
    raise exception 'week not found';
  end if;
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can delete weeks';
  end if;
  -- Drafts have never accepted bids, so deleting one erases nothing real.
  if v_week.status <> 'draft' then
    raise exception 'only a draft week can be deleted (status: %)', v_week.status;
  end if;

  delete from weeks where id = p_week_id;  -- films cascade

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(), 'delete_week',
          jsonb_build_object('week_number', v_week.number));
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Slate management (films). Eligibility rule (rulebook §3): films on
--    screen_threshold+ screens are eligible. Unknown screen counts default to
--    eligible — the commissioner confirms or the film is later removed with
--    refunds (phase 7).
-- ---------------------------------------------------------------------------
create or replace function public.add_film(
  p_week_id      uuid,
  p_title        text,
  p_screen_count integer default null,
  p_imdb_id      text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_week      weeks%rowtype;
  v_threshold integer;
  v_film_id   uuid;
begin
  select * into v_week from weeks where id = p_week_id;
  if not found then
    raise exception 'week not found';
  end if;
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can add films';
  end if;
  -- Films may still be added while bidding is open (late-announced wide
  -- releases happen); locked and later weeks are history.
  if v_week.status not in ('draft', 'open') then
    raise exception 'films can no longer be added to this week (status: %)', v_week.status;
  end if;
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'film needs a title';
  end if;

  select screen_threshold into v_threshold
  from rule_configs where season_id = v_week.season_id;

  insert into films (week_id, title, screen_count, imdb_id, eligible)
  values (p_week_id, trim(p_title), p_screen_count, nullif(trim(coalesce(p_imdb_id, '')), ''),
          coalesce(p_screen_count >= v_threshold, true))
  returning id into v_film_id;

  return v_film_id;
end;
$$;

create or replace function public.update_film(
  p_film_id      uuid,
  p_title        text,
  p_screen_count integer,
  p_imdb_id      text,
  p_eligible     boolean
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_film films%rowtype;
  v_week weeks%rowtype;
begin
  select * into v_film from films where id = p_film_id for update;
  if not found then
    raise exception 'film not found';
  end if;
  select * into v_week from weeks where id = v_film.week_id;
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can edit films';
  end if;
  if v_week.status not in ('draft', 'open') then
    raise exception 'films can no longer be edited in this week (status: %)', v_week.status;
  end if;
  if v_film.status <> 'active' then
    raise exception 'film has been removed from the slate';
  end if;
  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'film needs a title';
  end if;

  update films set
    title        = trim(p_title),
    screen_count = p_screen_count,
    imdb_id      = nullif(trim(coalesce(p_imdb_id, '')), ''),
    eligible     = p_eligible
  where id = p_film_id;
end;
$$;

create or replace function public.delete_film(p_film_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_film films%rowtype;
  v_week weeks%rowtype;
begin
  select * into v_film from films where id = p_film_id for update;
  if not found then
    raise exception 'film not found';
  end if;
  select * into v_week from weeks where id = v_film.week_id;
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can delete films';
  end if;
  if v_week.status not in ('draft', 'open') then
    raise exception 'films can no longer be deleted from this week (status: %)', v_week.status;
  end if;
  -- Once someone has bid on it, deletion would silently eat their bid;
  -- that path is phase 7's remove-with-refund.
  if exists (select 1 from bids where film_id = p_film_id) then
    raise exception 'players have bid on this film — use remove-with-refund instead';
  end if;

  delete from films where id = p_film_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Grants — ADR-004 deliberate exposure.
-- ---------------------------------------------------------------------------
revoke all on function public.create_season(text)                                                                            from public, anon;
revoke all on function public.update_season_status(uuid, public.season_status)                                               from public, anon;
revoke all on function public.update_rule_config(uuid, integer, integer, integer, integer, text, text, boolean, public.weekday_start, integer, jsonb) from public, anon;
revoke all on function public.add_season_member(uuid, text, public.member_role)                                              from public, anon;
revoke all on function public.remove_season_member(uuid)                                                                     from public, anon;
revoke all on function public.create_week(uuid, integer, date, timestamptz)                                                  from public, anon;
revoke all on function public.update_week(uuid, date, timestamptz)                                                           from public, anon;
revoke all on function public.open_week(uuid)                                                                                from public, anon;
revoke all on function public.delete_week(uuid)                                                                              from public, anon;
revoke all on function public.add_film(uuid, text, integer, text)                                                            from public, anon;
revoke all on function public.update_film(uuid, text, integer, text, boolean)                                                from public, anon;
revoke all on function public.delete_film(uuid)                                                                              from public, anon;

grant execute on function
  public.create_season(text),
  public.update_season_status(uuid, public.season_status),
  public.update_rule_config(uuid, integer, integer, integer, integer, text, text, boolean, public.weekday_start, integer, jsonb),
  public.add_season_member(uuid, text, public.member_role),
  public.remove_season_member(uuid),
  public.create_week(uuid, integer, date, timestamptz),
  public.update_week(uuid, date, timestamptz),
  public.open_week(uuid),
  public.delete_week(uuid),
  public.add_film(uuid, text, integer, text),
  public.update_film(uuid, text, integer, text, boolean),
  public.delete_film(uuid)
  to authenticated;
