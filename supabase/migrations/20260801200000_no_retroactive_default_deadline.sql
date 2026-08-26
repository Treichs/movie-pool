-- ADR-052 correction: a DEFAULTED deadline must never be born already lapsed.
--
-- create_week computes its default deadline from the week's own Monday plus
-- the season's auto_close day and time. That is right for a week set up in
-- advance and wrong for one set up late: a commissioner adding the CURRENT
-- week's slate on a Friday got a deadline of Thursday evening — already gone —
-- and from that moment every single bid landed as a sealed late offer needing
-- manual review. Nobody was ever told a deadline; enforcement began anyway.
--
-- The rule now: default a deadline only when there is still time to meet it.
-- If the computed moment has already passed, the week is created WITHOUT a
-- deadline, which leaves it unenforced — the honest outcome, since a deadline
-- nobody was given cannot bind them. A commissioner who wants one on a
-- late-created week sets it explicitly, and that path is unchanged.
--
-- Only the defaulting branch changes. An EXPLICIT p_bid_deadline in the past
-- is still accepted exactly as before: that is a commissioner stating a fact
-- about a week that is already under way, not the system inventing a rule.
--
-- Found by spike:adr, which started failing the moment new seasons began
-- defaulting to automation on — its weeks are created mid-week, so every bid
-- turned late and get_week_bidders (which hides pending offers) went empty.

create or replace function public.create_week(
  p_season_id     uuid,
  p_number        integer,
  p_opening_date  date,
  p_bid_deadline  timestamptz default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_week_id  uuid;
  v_config   rule_configs%rowtype;
  v_deadline timestamptz := p_bid_deadline;
  v_week_of  date;
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

  select * into v_config from rule_configs where season_id = p_season_id;
  if v_deadline is null and v_config.bidding_automation then
    v_week_of  := p_opening_date - (extract(isodow from p_opening_date)::int - 1);
    v_deadline := ((v_week_of + (v_config.auto_close_dow - 1))::timestamp
                   + v_config.auto_close_time)
                  at time zone v_config.automation_tz;
    -- The correction: a default that has already lapsed is no default at all.
    if v_deadline <= now() then
      v_deadline := null;
    end if;
  end if;

  insert into weeks (season_id, number, opening_date, bid_deadline)
  values (p_season_id, p_number, p_opening_date, v_deadline)
  returning id into v_week_id;

  insert into audit_log (season_id, actor, action, detail)
  values (p_season_id, auth.uid(), 'create_week',
          jsonb_build_object('week_id', v_week_id, 'week_number', p_number,
                             'opening_date', p_opening_date,
                             'bid_deadline', v_deadline,
                             'deadline_defaulted', p_bid_deadline is null and v_deadline is not null));

  return v_week_id;
end;
$$;

revoke all on function public.create_week(uuid, integer, date, timestamptz) from public, anon;
grant execute on function public.create_week(uuid, integer, date, timestamptz) to authenticated;

comment on function public.create_week(uuid, integer, date, timestamptz) is
  'Creates a release week. Under ADR-052 automation the bid deadline defaults '
  'from the season schedule, but ONLY when that moment is still in the future '
  '— a week created after its own close time is left unenforced rather than '
  'turning every bid into a late offer.';
