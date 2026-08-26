-- ============================================================================
-- ADR-023 — place_bids: submit a week's basket of bids atomically
--
-- The UI moves from per-film submit to "review & submit all": the player fills
-- in bids across the slate, sees total spend against their budget, then
-- commits once. That needs a single call that either lands every bid or none —
-- otherwise a mid-basket budget rejection leaves half the bids placed and the
-- reviewed total silently wrong.
--
-- SEMANTICS: merge, NOT replace. Films absent from the basket keep whatever
-- bid they already had; they are not cleared. This is a straight generalisation
-- of place_bid's existing upsert ("re-bidding while open replaces the bid") to
-- many films at once, and introduces no new rule.
--
-- Replace-semantics was rejected deliberately: clearing a field would then mean
-- WITHDRAWING a bid, and the rulebook does not grant withdrawal — §4 says one
-- bid per film and that re-bidding replaces it, but never that a bid can be
-- taken back. Adding withdrawal is a rules decision for the commissioner, not
-- something to smuggle in through a batch endpoint. Until then the UI must
-- submit the full basket it displayed (pre-filled with existing bids), which
-- makes merge and replace behave identically for every real submission.
--
-- place_bid(uuid, integer) is retained: it is the same rules, and the single
-- -film path is still the natural call from a film slide-out.
-- ============================================================================

create or replace function public.place_bids(p_bids jsonb)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_week            weeks%rowtype;
  v_member          season_members%rowtype;
  v_config          rule_configs%rowtype;
  v_remaining       integer;
  v_basket_total    integer;
  v_other_exposure  integer;
  v_n               integer;
  v_distinct        integer;
  v_matched         integer;
  v_week_count      integer;
  v_count           integer;
  v_bad_title       text;
begin
  if p_bids is null
     or jsonb_typeof(p_bids) <> 'array'
     or jsonb_array_length(p_bids) = 0 then
    raise exception 'no bids submitted';
  end if;

  -- One bid per film (rulebook §4) — a basket naming the same film twice is
  -- ambiguous rather than merely wrong, so reject instead of picking one.
  select count(*), count(distinct x.film_id)
    into v_n, v_distinct
  from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer);

  if v_n <> v_distinct then
    raise exception 'the same film appears more than once in this submission';
  end if;

  -- Every film must exist, and the whole basket must belong to ONE week —
  -- the budget check below is per-week, so a mixed basket would check the
  -- wrong exposure.
  select count(f.id), count(distinct f.week_id)
    into v_matched, v_week_count
  from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer)
  join films f on f.id = x.film_id;

  if v_matched <> v_n then
    raise exception 'one or more films in this submission no longer exist';
  end if;
  if v_week_count <> 1 then
    raise exception 'all bids in one submission must be for the same release week';
  end if;

  select w.* into v_week
  from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer)
  join films f on f.id = x.film_id
  join weeks w on w.id = f.week_id
  limit 1;

  if v_week.status <> 'open' then
    raise exception 'bidding is not open for this week';
  end if;

  -- ADR-006: any member of the season may bid, commissioner included.
  -- Lock the member row so concurrent submissions serialise, keeping the
  -- sum-exposure check race-free (same guard as place_bid).
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

  -- Rulebook §3: only films at/above the screen threshold are biddable, and a
  -- removed film scores for no one. Name the offender — a batch rejection that
  -- doesn't say which film is unactionable.
  select f.title into v_bad_title
  from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer)
  join films f on f.id = x.film_id
  where f.status <> 'active'
  limit 1;
  if v_bad_title is not null then
    raise exception '"%" has been removed from the slate', v_bad_title;
  end if;

  select f.title into v_bad_title
  from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer)
  join films f on f.id = x.film_id
  where not f.eligible
  limit 1;
  if v_bad_title is not null then
    raise exception '"%" is not eligible for bidding (under the screen threshold)', v_bad_title;
  end if;

  -- Whole dollars >= min_bid (the integer column already forbids fractions).
  select f.title into v_bad_title
  from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer)
  join films f on f.id = x.film_id
  where x.amount is null or x.amount < v_config.min_bid
  limit 1;
  if v_bad_title is not null then
    raise exception 'bid on "%" must be at least $%', v_bad_title, v_config.min_bid;
  end if;

  v_remaining := member_remaining_budget(v_member.id);

  select coalesce(sum(x.amount), 0) into v_basket_total
  from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer);

  -- ADR-001 sum-exposure, whole-basket form: the basket, PLUS any bid already
  -- standing on this week's other active films, must fit in the budget — so
  -- the player can always afford everything they might win.
  select coalesce(sum(b.amount), 0) into v_other_exposure
  from bids b
  join films f on f.id = b.film_id
  where b.season_member_id = v_member.id
    and f.week_id = v_week.id
    and f.status = 'active'
    and b.film_id not in (
      select x.film_id
      from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer)
    );

  if v_basket_total + v_other_exposure > v_remaining then
    raise exception
      'total bids this week ($%) would exceed your remaining budget ($%)',
      v_basket_total + v_other_exposure, v_remaining;
  end if;

  -- All-or-nothing: this is one statement inside one function, so any raise
  -- above has already aborted the transaction and nothing lands.
  insert into bids (film_id, season_member_id, amount)
  select x.film_id, v_member.id, x.amount
  from jsonb_to_recordset(p_bids) as x(film_id uuid, amount integer)
  on conflict (film_id, season_member_id)
  do update set amount = excluded.amount, updated_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.place_bids(jsonb) is
  'ADR-023 batch bidding. Takes [{"film_id":uuid,"amount":int}, ...] for a '
  'single open week; all-or-nothing, with one whole-basket budget check. '
  'Merge semantics — films not named keep their existing bid (no withdrawal).';

revoke all on function public.place_bids(jsonb) from public, anon;
grant execute on function public.place_bids(jsonb) to authenticated;
