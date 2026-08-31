-- ============================================================================
-- PHASE 2, PART ONE — DROP `weeks.bids_open_at`.
--
-- The 2026-08-05 settings rework (…_settings_rework_phase1_additive) was
-- explicitly two-phase and named this column in its own header:
--
--   "seed_season_weeks → stops writing the display-only bids_open_at (made
--    nullable here; dropped in Phase 2). No src reads it."
--
-- Phase 2 was never written. The column has been WRITE-ONLY for four weeks:
-- three functions computed and stored it, and nothing — no query in src/, no
-- other function, no view, no index, no policy, no constraint — has ever read
-- it back. Verified 2026-08-31 against the live database.
--
-- `week_bids_open_at(date, text)` existed only to compute it and goes with it.
--
-- ORDER MATTERS: every writer is replaced first, then the function they called,
-- then the column. A plpgsql body is resolved at call time, so the reverse
-- order would deploy green and fail on the next `create_week`.
--
-- WHAT THIS IS NOT: a behaviour change. Nothing rendered this value and nothing
-- branched on it. The `create_week` audit_log entry carried it and now does
-- not, which is the only externally visible difference.
--
-- Function bodies below are the LIVE definitions (pg_get_functiondef,
-- 2026-08-31) with only the bids_open_at lines removed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. create_week — drops v_open_at, its assignment, the insert column and the
--    audit field.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_week(p_season_id uuid, p_number integer, p_opening_date date, p_bid_deadline timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_week_id  uuid;
  v_config   league_settings%rowtype;
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

  v_config := settings_for_season(p_season_id);

  if v_deadline is null and v_config.league_id is not null then
    v_week_of  := p_opening_date - (extract(isodow from p_opening_date)::int - 1);
    v_deadline := ((v_week_of + (v_config.bids_due_dow - 1))::timestamp
                   + v_config.bids_due_time)
                  at time zone v_config.bids_due_tz;
    -- 20260801200000: a default that has already lapsed is no default at all.
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
                             'deadline_defaulted', p_bid_deadline is null));

  return v_week_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. update_week — the UPDATE now sets opening_date alone.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_week(p_week_id uuid, p_opening_date date, p_bid_deadline timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if v_week.status not in ('draft', 'open') then
    raise exception 'week can no longer be edited (status: %)', v_week.status;
  end if;
  if p_opening_date is null then
    raise exception 'week needs an opening date';
  end if;

  -- p_bid_deadline is ACCEPTED AND IGNORED, deliberately. The parameter is kept
  -- so existing callers still resolve; the deadline is set through
  -- set_week_bid_deadline, which knows the difference between an override and
  -- an inherited value.
  --
  -- week_of is NOT set here: it is generated from opening_date, so it follows
  -- on its own and assigning to it is an error.
  update weeks
  set opening_date = p_opening_date
  where id = p_week_id;

  -- Moving the weekend moves the week it belongs to, so its inherited deadline
  -- moves with it — the case that made the old function wrong even before
  -- defaults existed, since it changed opening_date and left the deadline
  -- pointing at the old week.
  perform sync_week_deadlines(v_week.season_id);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. add_films_from_catalog — its auto-created week no longer stores it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_films_from_catalog(p_season_id uuid, p_films jsonb, p_allow_create_week boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                         bid_deadline)
      values (p_season_id, v_next_number, v_week_of + 4, 'draft',
              v_deadline)
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
$function$
;

-- ---------------------------------------------------------------------------
-- 4. The helper, then the column. Nothing calls either any more.
-- ---------------------------------------------------------------------------
drop function if exists public.week_bids_open_at(date, text);

alter table public.weeks drop column if exists bids_open_at;
