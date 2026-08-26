-- ---------------------------------------------------------------------------
-- Restore seed_season_weeks' guards.
--
-- 20260803090000 rewrote this function to record bids_open_at, and rewrote it
-- from an OLDER copy — silently dropping four things the shipped version had:
--
--   * the upper bound (`p_week_count > 52`), so a request for 53 weeks wrote 53
--     weeks instead of raising. The setup spike caught it: "more than 52 weeks
--     is refused — no error raised", followed by "10 weeks exist — got 53".
--   * the null check on p_first_opening_date;
--   * the real error messages the spike asserts on;
--   * the audit action name `seed_season_weeks` and its detail keys.
--
-- This is the shipped 20260803030000 body verbatim, with bids_open_at added and
-- nothing else changed. The lesson is narrow and worth stating: when a
-- migration re-declares a function to add one column, it must start from the
-- CURRENT definition, not from whichever copy is easiest to find.
-- ---------------------------------------------------------------------------
create or replace function public.seed_season_weeks(
  p_season_id          uuid,
  p_first_opening_date date,
  p_week_count         integer
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_config   league_settings%rowtype;
  v_opening  date;
  v_week_of  date;
  v_deadline timestamptz;
  i          integer;
begin
  if not is_commissioner(p_season_id) then
    raise exception 'only the commissioner can lay out the season';
  end if;
  if p_first_opening_date is null then
    raise exception 'the season needs a first opening date';
  end if;
  if p_week_count is null or p_week_count < 1 or p_week_count > 52 then
    raise exception 'a season runs between 1 and 52 weeks';
  end if;
  if exists (select 1 from weeks where season_id = p_season_id) then
    raise exception 'this season already has weeks — add or remove them individually';
  end if;

  v_config := settings_for_season(p_season_id);

  for i in 0 .. p_week_count - 1 loop
    v_opening  := p_first_opening_date + (i * 7);
    v_week_of  := v_opening - (extract(isodow from v_opening)::int - 1);
    v_deadline := ((v_week_of + (v_config.bids_due_dow - 1))::timestamp
                   + v_config.bids_due_time)
                  at time zone v_config.bids_due_tz;
    if v_deadline <= now() then
      v_deadline := null;
    end if;

    insert into weeks (season_id, number, opening_date, bid_deadline, bids_open_at)
    values (p_season_id, i + 1, v_opening, v_deadline,
            week_bids_open_at(v_opening, v_config.bids_due_tz));
  end loop;

  insert into audit_log (season_id, actor, action, detail)
  values (p_season_id, auth.uid(), 'seed_season_weeks',
          jsonb_build_object('week_count', p_week_count,
                             'first_opening_date', p_first_opening_date,
                             'last_opening_date',
                               p_first_opening_date + ((p_week_count - 1) * 7)));

  return p_week_count;
end;
$$;
