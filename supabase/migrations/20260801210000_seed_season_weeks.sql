-- Season setup: seed a whole season's weeks in one call.
--
-- Until now a commissioner built a season one week at a time through
-- create_week — N round-trips, N audit rows, and N chances to mistype a date
-- that silently puts a film on the wrong weekend. A season is a known shape at
-- the moment it starts: a first opening date and a number of weeks. This RPC
-- takes exactly that and writes the rest.
--
-- Two ADR-042 constraints govern the arithmetic, and both bite silently:
--   * weeks.week_of is GENERATED (opening_date back to its Monday) and carries
--     a unique index on (season_id, week_of). Seeding therefore means N
--     CONSECUTIVE Mondays — the step must be exactly 7 days or the second week
--     collides with the first.
--   * gate_week_bid_deadline requires a week's bid_deadline to fall inside that
--     week's own Mon–Sun range. Any derived deadline has to be computed from
--     that week's Monday, not from the season's.
--
-- The opening WEEKDAY is preserved rather than assumed: 3 of the 10 live weeks
-- in the current season open on a Thursday, not a Friday. Stepping by 7 days
-- from whatever date the commissioner gives keeps their weekday and lands each
-- week in its own calendar week for free.

create or replace function public.seed_season_weeks(
  p_season_id          uuid,
  p_first_opening_date date,
  p_week_count         integer
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_config   rule_configs%rowtype;
  v_opening  date;
  v_week_of  date;
  v_deadline timestamptz;
  i          integer;
begin
  if not is_commissioner(p_season_id) then
    raise exception 'only the commissioner can set up a season';
  end if;
  if p_first_opening_date is null then
    raise exception 'the season needs a first opening date';
  end if;
  if p_week_count is null or p_week_count < 1 or p_week_count > 52 then
    raise exception 'a season runs between 1 and 52 weeks';
  end if;

  -- Seeding is a SETUP act, not an editing one. Refusing on a season that
  -- already has weeks keeps it from silently renumbering or colliding with a
  -- season already under way; weeks are added or removed after setup through
  -- create_week and the draft-only delete, which is the honest path for the
  -- schedule changes a real season goes through.
  if exists (select 1 from weeks where season_id = p_season_id) then
    raise exception 'this season already has weeks — add or remove them individually';
  end if;

  select * into v_config from rule_configs where season_id = p_season_id;

  for i in 0 .. p_week_count - 1 loop
    -- Exactly 7 days: preserves the commissioner's chosen weekday AND
    -- guarantees a distinct week_of per row.
    v_opening := p_first_opening_date + (i * 7);
    v_deadline := null;

    if v_config.bidding_automation then
      v_week_of  := v_opening - (extract(isodow from v_opening)::int - 1);
      v_deadline := ((v_week_of + (v_config.auto_close_dow - 1))::timestamp
                     + v_config.auto_close_time)
                    at time zone v_config.automation_tz;
      -- Same rule create_week follows: a default that has already lapsed is no
      -- default at all, or every bid on that week arrives as a late offer for
      -- a deadline nobody was ever told about.
      if v_deadline <= now() then
        v_deadline := null;
      end if;
    end if;

    -- Week numbering ALWAYS starts at 1 (developer note, 2026-08-01). There is
    -- deliberately no offset parameter: the season's ordinal position in the
    -- league is carried by its NAME (ADR-025), so a second parallel notion of
    -- "where does numbering start" would be a drift generator.
    insert into weeks (season_id, number, opening_date, bid_deadline)
    values (p_season_id, i + 1, v_opening, v_deadline);
  end loop;

  -- ONE audit row for the whole act, because it was one decision. N rows would
  -- describe the implementation rather than what the commissioner did.
  insert into audit_log (season_id, actor, action, detail)
  values (p_season_id, auth.uid(), 'seed_season_weeks',
          jsonb_build_object('week_count', p_week_count,
                             'first_opening_date', p_first_opening_date,
                             'last_opening_date',
                               p_first_opening_date + ((p_week_count - 1) * 7),
                             'deadlines_defaulted', v_config.bidding_automation));

  return p_week_count;
end;
$$;

revoke all on function public.seed_season_weeks(uuid, date, integer) from public, anon;
grant execute on function public.seed_season_weeks(uuid, date, integer) to authenticated;

comment on function public.seed_season_weeks(uuid, date, integer) is
  'Season setup: create N consecutive release weeks from a first opening date, '
  'numbered from 1, preserving the given weekday and defaulting each week''s '
  'bid deadline from the season schedule when automation is on. Refuses on a '
  'season that already has weeks.';
