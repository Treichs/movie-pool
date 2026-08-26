-- ============================================================================
-- Phase 4 — place_bid eligibility guard
--
-- Rulebook §3: only films at/above the screen threshold are on the slate.
-- Phase 1's place_bid checked film status (active/removed) but not the
-- commissioner-controlled `eligible` flag, so a player could bid on a film
-- the commissioner had marked under-threshold. Close that gap here; the UI
-- also hides the bid form for ineligible films, this is the defense-in-depth.
-- Otherwise identical to the phase 1 definition.
-- ============================================================================

create or replace function public.place_bid(p_film_id uuid, p_amount integer)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_film      films%rowtype;
  v_week      weeks%rowtype;
  v_member    season_members%rowtype;
  v_config    rule_configs%rowtype;
  v_remaining integer;
  v_exposure  integer;
  v_bid_id    uuid;
begin
  select * into v_film from films where id = p_film_id;
  if not found then
    raise exception 'film not found';
  end if;
  if v_film.status <> 'active' then
    raise exception 'film has been removed from the slate';
  end if;
  if not v_film.eligible then
    raise exception 'film is not eligible for bidding (under the screen threshold)';
  end if;

  select * into v_week from weeks where id = v_film.week_id;
  if v_week.status <> 'open' then
    raise exception 'bidding is not open for this week';
  end if;

  -- ADR-006: any member of the season may bid, commissioner included.
  -- Lock the member row so one player's concurrent bids serialize, keeping
  -- the sum-exposure check race-free.
  select sm.* into v_member
  from season_members sm
  where sm.season_id = v_week.season_id
    and sm.profile_id = auth.uid()
  for update;
  if not found then
    raise exception 'you are not a member of this season';
  end if;

  select * into v_config from rule_configs where season_id = v_week.season_id;
  if not found then
    raise exception 'season has no rule configuration';
  end if;

  -- Whole dollars ≥ min_bid (integer type already forbids fractions).
  if p_amount is null or p_amount < v_config.min_bid then
    raise exception 'bid must be at least $%', v_config.min_bid;
  end if;

  v_remaining := member_remaining_budget(v_member.id);

  -- ADR-001 sum-exposure: Σ(my bids on this week's ACTIVE films, excluding any
  -- existing bid on THIS film) + new amount must fit in my remaining budget.
  select coalesce(sum(b.amount), 0) into v_exposure
  from bids b
  join films f on f.id = b.film_id
  where b.season_member_id = v_member.id
    and f.week_id = v_week.id
    and f.status = 'active'
    and b.film_id <> p_film_id;

  if v_exposure + p_amount > v_remaining then
    raise exception 'total bids this week ($%) would exceed your remaining budget ($%)',
      v_exposure + p_amount, v_remaining;
  end if;

  -- Upsert the one-bid-per-film row (re-bidding while open replaces the bid).
  insert into bids (film_id, season_member_id, amount)
  values (p_film_id, v_member.id, p_amount)
  on conflict (film_id, season_member_id)
  do update set amount = excluded.amount, updated_at = now()
  returning id into v_bid_id;

  return v_bid_id;
end;
$$;
