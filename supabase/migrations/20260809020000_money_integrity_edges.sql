-- Four medium-severity fixes from the 2026-08-09 state audit (M1-M4). All
-- four are edge paths where money or the sealed-bid cutoff leaked around a
-- guard that the main path enforces. Every body below starts from the CURRENT
-- effective definition with only the fix applied (the 2026-08-04 stale-copy
-- lesson).

-- ---------------------------------------------------------------------------
-- M2. open_week — the manual door gets the same one-open-week guard as the
--     automatic one.
--
-- ADR-080's rework reinstated "one week open per season", but only inside
-- open_due_weeks. open_week was never redefined after phase 3, so the
-- commissioner could open a second week while one was live — and place_bid
-- computes exposure PER WEEK against the same bankroll, so two open weeks let
-- a player commit their remaining budget twice over. Body from
-- 20260711163652, guard added.
-- ---------------------------------------------------------------------------
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
  -- One week open at a time — the same invariant open_due_weeks enforces.
  -- The budget check in place_bid/place_bids scopes exposure to a single
  -- week, so a second open week would let every player double-commit their
  -- remaining bankroll.
  if exists (
    select 1 from weeks g
    where g.season_id = v_week.season_id and g.status = 'open'
  ) then
    raise exception 'another week is already open — bidding runs one week at a time';
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

-- ---------------------------------------------------------------------------
-- M4. pass_week / resume_bidding — the deadline cuts both ways.
--
-- place_bid and place_bids refuse once now() > bid_deadline even while the
-- week's status is still 'open' (the hourly closer leaves a window of up to
-- an hour). pass_week — which deletes the caller's entire sheet — and
-- resume_bidding checked only the status, so during that window a player
-- could retract everything at 12:01 while placing was correctly refused.
-- Same check, same wording as place_bid. Bodies from 20260805010000.
-- ---------------------------------------------------------------------------
create or replace function public.pass_week(p_week_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_week    weeks%rowtype;
  v_member  season_members%rowtype;
  v_cleared integer;
begin
  select * into v_week from weeks where id = p_week_id;
  if not found then
    raise exception 'week not found';
  end if;
  if v_week.status <> 'open' then
    raise exception 'bidding is not open for this week';
  end if;
  if v_week.bid_deadline is not null and now() > v_week.bid_deadline then
    raise exception 'the deadline for this week has passed';
  end if;

  select sm.* into v_member from season_members sm
  where sm.season_id = v_week.season_id and sm.profile_id = auth.uid()
  for update;
  if not found then
    raise exception 'you are not a member of this season';
  end if;

  delete from bids b
  using films f
  where f.id = b.film_id
    and f.week_id = p_week_id
    and b.season_member_id = v_member.id;
  get diagnostics v_cleared = row_count;

  insert into bid_sheets (week_id, season_member_id, status)
  values (p_week_id, v_member.id, 'passed')
  on conflict (week_id, season_member_id)
  do update set status = 'passed', updated_at = now();

  -- Audit, but NOT in the members' activity feed: get_league_activity works
  -- from a whitelist and this action is not on it, so passing stays private
  -- exactly as long as every other participation fact does.
  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(), 'pass_week',
          jsonb_build_object('week_id', p_week_id, 'week_number', v_week.number,
                             'bids_cleared', v_cleared));
end;
$$;

create or replace function public.resume_bidding(p_week_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_week   weeks%rowtype;
  v_member season_members%rowtype;
begin
  select * into v_week from weeks where id = p_week_id;
  if not found then
    raise exception 'week not found';
  end if;
  if v_week.status <> 'open' then
    raise exception 'bidding is not open for this week';
  end if;
  if v_week.bid_deadline is not null and now() > v_week.bid_deadline then
    raise exception 'the deadline for this week has passed';
  end if;

  select sm.* into v_member from season_members sm
  where sm.season_id = v_week.season_id and sm.profile_id = auth.uid();
  if not found then
    raise exception 'you are not a member of this season';
  end if;

  update bid_sheets set status = 'open', updated_at = now()
  where week_id = p_week_id
    and season_member_id = v_member.id
    and status = 'passed';
end;
$$;

-- ---------------------------------------------------------------------------
-- M1. override_bid_amount — everyone the re-resolution touches gets the
--     bankroll check, not just the corrected bid's owner.
--
-- Re-deciding a film's winners can flip ANOTHER member's losing bid to
-- winning, charging them retroactively against a budget their later bids
-- already spent — silently negative, poisoning every subsequent place_bid
-- check and the standings' spent column. member_remaining_budget counts
-- winning bids only, which is exactly the set a correction changes, so every
-- bidder on the film is re-checked. Body from 20260805010000.
-- ---------------------------------------------------------------------------
create or replace function public.override_bid_amount(
  p_bid_id uuid,
  p_amount integer,
  p_reason text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_bid       bids%rowtype;
  v_film      films%rowtype;
  v_week      weeks%rowtype;
  v_config    league_settings%rowtype;
  v_old       integer;
  v_remaining integer;
  v_member    season_members%rowtype;
  r           record;
begin
  select * into v_bid from bids where id = p_bid_id for update;
  if not found then
    raise exception 'bid not found';
  end if;

  select * into v_film from films where id = v_bid.film_id for update;
  select * into v_week from weeks where id = v_film.week_id for update;

  if not is_commissioner(v_week.season_id) then
    raise exception 'only a commissioner can correct a bid';
  end if;

  if v_week.status not in ('closed', 'final') then
    raise exception
      'bids can only be corrected after the week closes and amounts are revealed (status: %)',
      v_week.status;
  end if;

  if v_film.status <> 'active' then
    raise exception 'this film was removed from the slate — its bids are already refunded';
  end if;

  v_config := settings_for_season(v_week.season_id);
  if v_config.league_id is null then
    raise exception 'season has no league settings';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'a bid is a whole number of dollars, 0 or more';
  end if;
  if p_amount > 0 and p_amount < v_config.min_bid then
    raise exception 'correct to $0, or to at least $%', v_config.min_bid;
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'give a reason for the correction (players are told one was made)';
  end if;

  v_old := v_bid.amount;
  if v_old = p_amount then
    return;
  end if;

  update bids set amount = p_amount, updated_at = now() where id = p_bid_id;

  update bids b
  set is_winning = (
    v_film.eligible
    and b.amount > 0
    and b.amount in (
      select distinct b2.amount
      from bids b2
      where b2.film_id = v_film.id
        and b2.amount > 0
      order by b2.amount desc
      limit v_config.top_n_distinct
    )
  )
  where b.film_id = v_film.id;

  select * into v_member from season_members where id = v_bid.season_member_id;

  -- Every bidder on the film, because is_winning may have flipped for any of
  -- them. Raising rolls the whole correction back, amount and all.
  for r in
    select sm.id as member_id, pr.display_name
    from season_members sm
    join profiles pr on pr.id = sm.profile_id
    where sm.id in (
      select b.season_member_id from bids b where b.film_id = v_film.id
    )
  loop
    v_remaining := member_remaining_budget(r.member_id);
    if v_remaining < 0 then
      raise exception
        'that correction puts % $% over their $% bankroll',
        r.display_name, -v_remaining, v_config.fake_bankroll;
    end if;
  end loop;

  insert into audit_log (season_id, actor, action, detail)
  values (v_week.season_id, auth.uid(), 'override_bid_amount',
          jsonb_build_object(
            'week_id', v_week.id, 'week_number', v_week.number,
            'week_status', v_week.status,
            'film_id', v_film.id, 'title', v_film.title,
            'season_member_id', v_bid.season_member_id,
            'profile_id', v_member.profile_id,
            'old', v_old, 'new', p_amount,
            'reason', trim(p_reason)));
end;
$$;

-- ---------------------------------------------------------------------------
-- M3. add_films_from_catalog — a week it creates gets a deadline, like every
--     other week.
--
-- The picker's week-creation branch inserted only (season_id, number,
-- opening_date, status). run_bidding_automation closes only weeks whose
-- bid_deadline is not null, so a picker-created week opened on the clock and
-- then never closed — bidding could run past the release weekend, when the
-- grosses are public. The branch now derives the deadline exactly as
-- seed_season_weeks does, writes bids_open_at the same way, and SKIPS a film
-- whose target week's deadline has already passed rather than nulling it
-- (nulling is precisely the never-closes fault 20260804130000 removed from
-- seeding). Body from 20260731120100 otherwise verbatim.
-- ---------------------------------------------------------------------------
create or replace function public.add_films_from_catalog(
  p_season_id         uuid,
  p_films             jsonb,
  p_allow_create_week boolean default false
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_entry         jsonb;
  v_tmdb_id       integer;
  v_title         text;
  v_release       date;
  v_week_of       date;
  v_week          weeks%rowtype;
  v_latest        date;
  v_next_number   integer;
  v_film_id       uuid;
  v_created_week  boolean;
  v_added         jsonb := '[]'::jsonb;
  v_skipped       jsonb := '[]'::jsonb;
  v_created       integer := 0;
  v_config        league_settings%rowtype;
  v_deadline      timestamptz;
begin
  if auth.uid() is null then
    raise exception 'must be signed in';
  end if;
  if not exists (select 1 from seasons where id = p_season_id) then
    raise exception 'season not found';
  end if;
  if not is_commissioner(p_season_id) then
    raise exception 'only the commissioner can add films';
  end if;
  if p_films is null or jsonb_typeof(p_films) <> 'array' then
    raise exception 'p_films must be a json array';
  end if;
  if jsonb_array_length(p_films) = 0 then
    raise exception 'no films supplied';
  end if;
  if jsonb_array_length(p_films) > 50 then
    raise exception 'too many films in one batch (max 50)';
  end if;

  v_config := settings_for_season(p_season_id);

  -- The season's furthest-out week. Week creation is APPEND-ONLY, so this is
  -- the boundary between "offer to create" and "refuse — mid-season gap".
  select max(week_of) into v_latest from weeks where season_id = p_season_id;

  for v_entry in select value from jsonb_array_elements(p_films) loop
    v_created_week := false;
    v_tmdb_id := nullif(v_entry ->> 'tmdb_id', '')::integer;
    v_title   := nullif(trim(coalesce(v_entry ->> 'title', '')), '');
    v_release := nullif(v_entry ->> 'release_date_us_wide', '')::date;

    if v_tmdb_id is null or v_tmdb_id <= 0 or v_title is null then
      v_skipped := v_skipped || jsonb_build_object(
        'tmdb_id', v_tmdb_id, 'title', v_title,
        'reason', 'invalid-payload', 'detail', 'missing tmdb_id or title');
      continue;
    end if;

    if v_release is null then
      v_skipped := v_skipped || jsonb_build_object(
        'tmdb_id', v_tmdb_id, 'title', v_title, 'reason', 'no-release-date',
        'detail', 'no US wide release date — add it manually');
      continue;
    end if;

    v_week_of := week_of(v_release);

    if v_week_of < week_of(current_date) then
      v_skipped := v_skipped || jsonb_build_object(
        'tmdb_id', v_tmdb_id, 'title', v_title, 'reason', 'in-the-past',
        'detail', 'the week of ' || v_week_of || ' has already passed');
      continue;
    end if;

    select * into v_week from weeks
      where season_id = p_season_id and week_of = v_week_of;

    if found then
      -- Films may still join a week while bidding is OPEN — late-announced wide
      -- releases happen. Locked and later weeks are history.
      if v_week.status not in ('draft', 'open') then
        v_skipped := v_skipped || jsonb_build_object(
          'tmdb_id', v_tmdb_id, 'title', v_title, 'reason', 'week-closed',
          'detail', 'week ' || v_week.number || ' is ' || v_week.status);
        continue;
      end if;
    else
      if v_latest is not null and v_week_of < v_latest then
        -- Refused even with p_allow_create_week. The app relies on an unstated
        -- invariant that week numbers ascend with date (getWeeks orders by
        -- number; the trend charts assume chronological order), so a hole in the
        -- middle must be filled deliberately via create_week.
        v_skipped := v_skipped || jsonb_build_object(
          'tmdb_id', v_tmdb_id, 'title', v_title, 'reason', 'mid-season-gap',
          'detail', 'no week for ' || v_week_of || ' — create it manually');
        continue;
      end if;
      if not p_allow_create_week then
        v_skipped := v_skipped || jsonb_build_object(
          'tmdb_id', v_tmdb_id, 'title', v_title, 'reason', 'no-week',
          'detail', 'no week for the week of ' || v_week_of);
        continue;
      end if;

      -- The deadline this week would inherit, derived exactly as
      -- seed_season_weeks derives it. Already passed means bidding could
      -- never legally happen on this week — skip the film rather than create
      -- a week the automation can never close.
      v_deadline := league_default_bid_deadline(v_week_of, v_config.bids_due_dow,
                                                v_config.bids_due_time, v_config.bids_due_tz);
      if v_deadline is not null and v_deadline <= now() then
        v_skipped := v_skipped || jsonb_build_object(
          'tmdb_id', v_tmdb_id, 'title', v_title, 'reason', 'deadline-passed',
          'detail', 'bids for the week of ' || v_week_of || ' were already due');
        continue;
      end if;

      select coalesce(max(number), 0) + 1 into v_next_number
        from weeks where season_id = p_season_id;
      -- opening_date is set to the FRIDAY of the target week: weeks.week_of is
      -- generated from it, and Friday matches the convention 7 of the 10
      -- existing rows already follow. Born 'draft' so bidding is still opened
      -- deliberately.
      insert into weeks (season_id, number, opening_date, status,
                         bid_deadline, bids_open_at)
      values (p_season_id, v_next_number, v_week_of + 4, 'draft',
              v_deadline, week_bids_open_at(v_week_of + 4, v_config.bids_due_tz))
      returning * into v_week;

      insert into audit_log (season_id, actor, action, detail)
      values (p_season_id, auth.uid(), 'create_week',
              jsonb_build_object('week_id', v_week.id, 'week_number', v_week.number,
                                 'opening_date', v_week.opening_date,
                                 'source', 'add_films_from_catalog'));

      v_created_week := true;
      v_created := v_created + 1;
      v_latest := greatest(coalesce(v_latest, v_week_of), v_week_of);
    end if;

    -- Dedupe on either key. tmdb_id catches the same pick twice; the title match
    -- catches a film the commissioner already added by hand through FilmForm,
    -- which is the likelier collision in practice.
    if exists (
      select 1 from films
       where week_id = v_week.id
         and status = 'active'
         and (tmdb_id = v_tmdb_id or lower(title) = lower(v_title))
    ) then
      v_skipped := v_skipped || jsonb_build_object(
        'tmdb_id', v_tmdb_id, 'title', v_title, 'reason', 'already-on-slate',
        'detail', v_title || ' is already on week ' || v_week.number);
      continue;
    end if;

    -- Upsert the catalog row. coalesce(excluded.x, film_catalog.x) means a
    -- partial payload can never clobber a value we already know.
    insert into film_catalog as fc (
      tmdb_id, imdb_id, title, original_title,
      release_date_us_wide, release_date_us_limited, release_date_us_premiere,
      release_date_digital, release_date_tmdb_raw,
      poster_path, backdrop_path, overview, tagline, homepage, certification,
      runtime_min, budget, collection_id, collection_name, original_language,
      director, composer, cinematographer,
      rt_tomatometer, metascore, imdb_rating, imdb_votes,
      tmdb_vote_average, tmdb_vote_count, tmdb_popularity_at_pick,
      revenue_worldwide, box_office_domestic, awards_text, metrics_refreshed_at,
      trailer_youtube_key, fetched_at
    )
    values (
      v_tmdb_id,
      nullif(v_entry ->> 'imdb_id', ''),
      v_title,
      nullif(v_entry ->> 'original_title', ''),
      v_release,
      nullif(v_entry ->> 'release_date_us_limited', '')::date,
      nullif(v_entry ->> 'release_date_us_premiere', '')::date,
      nullif(v_entry ->> 'release_date_digital', '')::date,
      nullif(v_entry ->> 'release_date_tmdb_raw', '')::date,
      nullif(v_entry ->> 'poster_path', ''),
      nullif(v_entry ->> 'backdrop_path', ''),
      nullif(v_entry ->> 'overview', ''),
      nullif(v_entry ->> 'tagline', ''),
      nullif(v_entry ->> 'homepage', ''),
      nullif(v_entry ->> 'certification', ''),
      nullif(v_entry ->> 'runtime_min', '')::integer,
      nullif(v_entry ->> 'budget', '')::bigint,
      nullif(v_entry ->> 'collection_id', '')::integer,
      nullif(v_entry ->> 'collection_name', ''),
      nullif(v_entry ->> 'original_language', ''),
      nullif(v_entry ->> 'director', ''),
      nullif(v_entry ->> 'composer', ''),
      nullif(v_entry ->> 'cinematographer', ''),
      nullif(v_entry ->> 'rt_tomatometer', '')::integer,
      nullif(v_entry ->> 'metascore', '')::integer,
      nullif(v_entry ->> 'imdb_rating', '')::numeric,
      nullif(v_entry ->> 'imdb_votes', '')::integer,
      nullif(v_entry ->> 'tmdb_vote_average', '')::numeric,
      nullif(v_entry ->> 'tmdb_vote_count', '')::integer,
      nullif(v_entry ->> 'tmdb_popularity_at_pick', '')::numeric,
      nullif(v_entry ->> 'revenue_worldwide', '')::bigint,
      nullif(v_entry ->> 'box_office_domestic', '')::bigint,
      nullif(v_entry ->> 'awards_text', ''),
      now(),
      nullif(v_entry ->> 'trailer_youtube_key', ''),
      now()
    )
    on conflict (tmdb_id) do update set
      imdb_id                  = coalesce(excluded.imdb_id, fc.imdb_id),
      title                    = excluded.title,
      original_title           = coalesce(excluded.original_title, fc.original_title),
      release_date_us_wide     = coalesce(excluded.release_date_us_wide, fc.release_date_us_wide),
      release_date_us_limited  = coalesce(excluded.release_date_us_limited, fc.release_date_us_limited),
      release_date_us_premiere = coalesce(excluded.release_date_us_premiere, fc.release_date_us_premiere),
      release_date_digital     = coalesce(excluded.release_date_digital, fc.release_date_digital),
      release_date_tmdb_raw    = coalesce(excluded.release_date_tmdb_raw, fc.release_date_tmdb_raw),
      poster_path              = coalesce(excluded.poster_path, fc.poster_path),
      backdrop_path            = coalesce(excluded.backdrop_path, fc.backdrop_path),
      overview                 = coalesce(excluded.overview, fc.overview),
      tagline                  = coalesce(excluded.tagline, fc.tagline),
      homepage                 = coalesce(excluded.homepage, fc.homepage),
      certification            = coalesce(excluded.certification, fc.certification),
      runtime_min              = coalesce(excluded.runtime_min, fc.runtime_min),
      budget                   = coalesce(excluded.budget, fc.budget),
      collection_id            = coalesce(excluded.collection_id, fc.collection_id),
      collection_name          = coalesce(excluded.collection_name, fc.collection_name),
      original_language        = coalesce(excluded.original_language, fc.original_language),
      director                 = coalesce(excluded.director, fc.director),
      composer                 = coalesce(excluded.composer, fc.composer),
      cinematographer          = coalesce(excluded.cinematographer, fc.cinematographer),
      rt_tomatometer           = coalesce(excluded.rt_tomatometer, fc.rt_tomatometer),
      metascore                = coalesce(excluded.metascore, fc.metascore),
      imdb_rating              = coalesce(excluded.imdb_rating, fc.imdb_rating),
      imdb_votes               = coalesce(excluded.imdb_votes, fc.imdb_votes),
      tmdb_vote_average        = coalesce(excluded.tmdb_vote_average, fc.tmdb_vote_average),
      tmdb_vote_count          = coalesce(excluded.tmdb_vote_count, fc.tmdb_vote_count),
      -- NOT coalesced: this is a snapshot, and re-picking is a new snapshot.
      tmdb_popularity_at_pick  = coalesce(excluded.tmdb_popularity_at_pick, fc.tmdb_popularity_at_pick),
      revenue_worldwide        = coalesce(excluded.revenue_worldwide, fc.revenue_worldwide),
      box_office_domestic      = coalesce(excluded.box_office_domestic, fc.box_office_domestic),
      awards_text              = coalesce(excluded.awards_text, fc.awards_text),
      metrics_refreshed_at     = now(),
      trailer_youtube_key      = coalesce(excluded.trailer_youtube_key, fc.trailer_youtube_key),
      fetched_at               = now();

    -- Children are replaced wholesale rather than merged: they are small,
    -- ordered, and a partial merge would leave a stale 4th-billed actor behind.
    if v_entry ? 'genres' and jsonb_typeof(v_entry -> 'genres') = 'array' then
      delete from film_genres where tmdb_id = v_tmdb_id;
      insert into film_genres (tmdb_id, genre_id, name)
      select v_tmdb_id, (g ->> 'id')::integer, g ->> 'name'
        from jsonb_array_elements(v_entry -> 'genres') g
       where g ? 'id' and nullif(g ->> 'name', '') is not null
      on conflict do nothing;
    end if;

    if v_entry ? 'cast' and jsonb_typeof(v_entry -> 'cast') = 'array' then
      delete from film_cast where tmdb_id = v_tmdb_id;
      insert into film_cast (tmdb_id, billing, person_id, name, character_name, profile_path)
      select v_tmdb_id, (c ->> 'order')::smallint, (c ->> 'id')::integer,
             c ->> 'name', nullif(c ->> 'character', ''), nullif(c ->> 'profile_path', '')
        from jsonb_array_elements(v_entry -> 'cast') c
       where c ? 'order' and c ? 'id' and nullif(c ->> 'name', '') is not null
      on conflict do nothing;
    end if;

    insert into films (week_id, title, imdb_id, tmdb_id, release_date, eligible)
    values (v_week.id, v_title, nullif(v_entry ->> 'imdb_id', ''), v_tmdb_id, v_release, true)
    returning id into v_film_id;

    v_added := v_added || jsonb_build_object(
      'tmdb_id', v_tmdb_id, 'title', v_title, 'film_id', v_film_id,
      'week_id', v_week.id, 'week_number', v_week.number,
      'week_of', v_week_of, 'created_week', v_created_week);
  end loop;

  insert into audit_log (season_id, actor, action, detail)
  values (p_season_id, auth.uid(), 'add_films_from_catalog',
          jsonb_build_object('added', jsonb_array_length(v_added),
                             'skipped', jsonb_array_length(v_skipped),
                             'weeks_created', v_created,
                             'source', 'tmdb',
                             'detail', jsonb_build_object('added', v_added,
                                                          'skipped', v_skipped)));

  return jsonb_build_object('added', v_added, 'skipped', v_skipped,
                            'weeks_created', v_created);
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill: any existing draft/open week missing its deadline inherits the
-- league default now, via the designed single writer.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select id from seasons where status = 'active' loop
    perform sync_week_deadlines(r.id);
  end loop;
end $$;
