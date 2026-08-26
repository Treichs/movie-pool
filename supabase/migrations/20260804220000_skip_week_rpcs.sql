-- ADR-069, part 2 of 2: the two doors into `skipped`, and the one predicate
-- that had to be corrected for it.
--
-- Separate file because part 1's `alter type ... add value` cannot be used in
-- the transaction that adds it.

-- ---------------------------------------------------------------------------
-- 1. skip_week — the commissioner states that this weekend has no slate.
--
--    ONLY FROM `draft`, and only with an empty slate. Both refusals are about
--    the same thing: `skipped` means "nothing happened here", so it must be
--    impossible to reach from a week where something already did. A week that
--    has opened has taken bids; a week with films on it is a week that intends
--    to. Neither is skippable, and the commissioner is told which it is.
--
--    NOT A DELETE. The week keeps its number, its dates and its place in the
--    calendar — a season that ran fourteen weekends, one of which was empty,
--    is a different season from one that ran thirteen.
-- ---------------------------------------------------------------------------
create or replace function public.skip_week(p_week_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_week  weeks%rowtype;
  v_films integer;
begin
  select * into v_week from weeks where id = p_week_id for update;
  if not found then
    raise exception 'week not found';
  end if;
  if not is_commissioner(v_week.season_id) then
    raise exception 'only the commissioner can skip a week';
  end if;

  if v_week.status = 'skipped' then
    raise exception 'this week is already skipped';
  end if;
  if v_week.status <> 'draft' then
    raise exception 'only a week that has not opened can be skipped (status: %)',
      v_week.status;
  end if;

  select count(*) into v_films
  from films f
  where f.week_id = p_week_id and f.status = 'active';
  if v_films > 0 then
    raise exception 'this week has % film(s) on its slate — take them off before skipping it',
      v_films;
  end if;

  update weeks set status = 'skipped' where id = p_week_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(), 'skip_week',
          jsonb_build_object('week_id', p_week_id, 'week_number', v_week.number));
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. unskip_week — put it back, because skipping is a judgement and a release
--    calendar moves. Returns to `draft`, which is exactly where it came from;
--    from there the normal rules resume, and the week opens on its own once it
--    has a slate and its clock has passed.
-- ---------------------------------------------------------------------------
create or replace function public.unskip_week(p_week_id uuid)
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
    raise exception 'only the commissioner can un-skip a week';
  end if;
  if v_week.status <> 'skipped' then
    raise exception 'this week is not skipped (status: %)', v_week.status;
  end if;

  update weeks set status = 'draft' where id = p_week_id;

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(), 'unskip_week',
          jsonb_build_object('week_id', p_week_id, 'week_number', v_week.number));
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. season_bidding_has_begun — the one predicate written as a denylist.
--
--    20260804090000 phrased it as "any week that is not still draft", because
--    at the time the four non-draft states all meant bidding HAS happened. A
--    skipped week breaks that reading: it is not draft, and nothing happened in
--    it. Left as it was, skipping a week would freeze the season roster and
--    stop new league members being added to a season that has not started.
--
--    Stated as the two states that mean "nothing has happened yet" rather than
--    re-listing the four that mean it has, so a future member of the enum is
--    counted as real bidding until someone decides otherwise — the safe way for
--    this particular test to be wrong.
-- ---------------------------------------------------------------------------
create or replace function public.season_bidding_has_begun(p_season_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from weeks w
    where w.season_id = p_season_id
      and w.status not in ('draft', 'skipped')
  );
$$;

revoke all on function public.skip_week(uuid)   from public, anon;
revoke all on function public.unskip_week(uuid) from public, anon;
grant execute on function public.skip_week(uuid)   to authenticated;
grant execute on function public.unskip_week(uuid) to authenticated;
