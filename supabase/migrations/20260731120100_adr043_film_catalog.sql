-- ADR-043 — the shared film catalog, and the RPC that puts a picked film on the
-- right week of a season.
--
-- WHY A SHARED TABLE RATHER THAN COLUMNS ON `films`. Every film-listing surface
-- renders many films at once, so a live API call per render is an unacceptable
-- N+1; something must persist. The same title appears in every league, so one
-- row dedupes it and cannot drift between leagues. And refreshing that row is
-- SAFE precisely because this table holds NO SCORING FIELD: `films.box_office_m`,
-- `films.tomatometer`, `films.screen_count` and `films.eligible` stay exactly
-- where they are, authoritative and human-written. That is a structural
-- guarantee, not a convention — nothing in this file can write a scoring input.
--
-- WHY A CHOSEN SUBSET RATHER THAN `raw jsonb`. Measured, not assumed: TMDB's
-- detail response for Superman (2025) is 350 KB — credits 110 KB,
-- watch/providers 60 KB, images 32 KB, videos 16 KB — roughly 20 MB of jsonb per
-- season of data no query would ever touch. The columns below are ~3 KB per
-- film, about 0.1% of that. Sample payloads for two films live in
-- Docs/api/payload_examples/ so this choice stays arguable against real data.
--
-- THE IMMUTABLE / MUTABLE SPLIT is the organising idea and is marked in the
-- column comments. Budget, runtime, cast, genre and collection are facts about a
-- finished film: written once, never refreshed. Ratings, votes, revenue and
-- awards all move, and each has its own correct capture moment.

-- ---------------------------------------------------------------------------
-- 1. film_catalog
-- ---------------------------------------------------------------------------
create table public.film_catalog (
  -- Identity. tmdb_id is already stable and globally unique, so a surrogate
  -- uuid would add a join hop for zero benefit.
  tmdb_id                  integer primary key check (tmdb_id > 0),
  imdb_id                  text unique,                 -- the join key to OMDb
  title                    text not null,
  original_title           text,

  -- Dates, typed. TMDB's US release_dates entries carry a type:
  --   1 Premiere · 2 Theatrical (limited) · 3 Theatrical (WIDE)
  --   4 Digital  · 5 Physical             · 6 TV
  -- Only type 3 is trustworthy for this pool, and the spike proved why: the
  -- top-level release_date matches NEITHER the premiere nor the wide date for
  -- Superman, and IS the limited date for The Brutalist — five weeks early.
  release_date_us_wide     date,
  release_date_us_limited  date,
  release_date_us_premiere date,
  release_date_digital     date,
  -- Kept ONLY as a divergence tripwire: when this disagrees with the wide date
  -- we know the film is platformed. It must never be read as "the" date.
  release_date_tmdb_raw    date,
  -- Derived, never taken from a vendor: OMDb reports The Brutalist as 2025 and
  -- TMDB's top-level date says 2024. Generating it settles the rule in schema.
  release_year integer generated always as
    (extract(year from release_date_us_wide)::int) stored,

  -- Display.
  poster_path              text,     -- '/abc.jpg' — a PATH, never a full URL
  backdrop_path            text,
  overview                 text,
  tagline                  text,
  homepage                 text,
  certification            text,     -- US MPAA, from release_dates[US]

  -- Analytics dimensions. IMMUTABLE — write once at pick time.
  runtime_min              integer check (runtime_min >= 0),
  budget                   bigint  check (budget >= 0),
  collection_id            integer,  -- franchise key, e.g. 1540907
  collection_name          text,     -- 'Superman (DCU) Collection'
  original_language        text,
  director                 text,
  composer                 text,
  cinematographer          text,

  -- Outcome metrics. MUTABLE — every one of these moves after it is written.
  rt_tomatometer           integer check (rt_tomatometer between 0 and 100),
  metascore                integer check (metascore between 0 and 100),
  imdb_rating              numeric(3, 1) check (imdb_rating between 0 and 10),
  imdb_votes               integer check (imdb_votes >= 0),
  tmdb_vote_average        numeric(4, 3) check (tmdb_vote_average between 0 and 10),
  tmdb_vote_count          integer check (tmdb_vote_count >= 0),
  -- Named for its semantics: TMDB popularity decays daily and is only
  -- meaningful FROZEN at the moment of picking, as a pre-release hype proxy.
  tmdb_popularity_at_pick  numeric,
  revenue_worldwide        bigint check (revenue_worldwide >= 0),
  box_office_domestic      bigint check (box_office_domestic >= 0),
  awards_text              text,
  metrics_refreshed_at     timestamptz,

  -- Fun.
  trailer_youtube_key      text,     -- one key, chosen from up to 67 videos

  fetched_at               timestamptz not null default now(),
  created_at               timestamptz not null default now()
);

create index film_catalog_release_wide_idx on public.film_catalog (release_date_us_wide);
create index film_catalog_collection_idx on public.film_catalog (collection_id)
  where collection_id is not null;

comment on table public.film_catalog is
  'Shared TMDB/OMDb metadata, one row per title across every league. Holds NO scoring field — box office, Tomatometer, screen count and eligibility live on films and are human-written (ADR-043).';
comment on column public.film_catalog.release_date_us_wide is
  'US wide theatrical date — release_dates[US] where type = 3. THE authoritative date. Never use the top-level release_date (ADR-041).';
comment on column public.film_catalog.release_date_tmdb_raw is
  'TMDB top-level release_date, stored only to detect divergence from the wide date. Not for display or week mapping.';
comment on column public.film_catalog.rt_tomatometer is
  'Tomatometer as OMDb last cached it. A SUGGESTION ONLY — it must never reach films.tomatometer except through a commissioner''s capture_film submission (ADR-041).';
comment on column public.film_catalog.revenue_worldwide is
  'TMDB cumulative WORLDWIDE gross. NOT opening weekend — unusable for scoring (ADR-002 reaffirmed).';
comment on column public.film_catalog.box_office_domestic is
  'OMDb cumulative DOMESTIC gross. NOT opening weekend — unusable for scoring (ADR-002 reaffirmed).';
comment on column public.film_catalog.tmdb_popularity_at_pick is
  'Snapshot of TMDB popularity at the moment the commissioner picked the film. Decays daily; meaningless if refreshed.';

-- Genres and cast are ROWS, not text[]. The whole reason this field set was
-- chosen deliberately is a future analytics feature, and "which genres score
-- best per dollar" is a group-by. An array would make the one query the data
-- exists for the awkward one.
create table public.film_genres (
  tmdb_id  integer not null references public.film_catalog (tmdb_id) on delete cascade,
  genre_id integer not null,
  name     text not null,
  primary key (tmdb_id, genre_id)
);
create index film_genres_genre_idx on public.film_genres (genre_id);

create table public.film_cast (
  tmdb_id      integer not null references public.film_catalog (tmdb_id) on delete cascade,
  billing      smallint not null check (billing >= 0),  -- TMDB credits.cast[].order
  person_id    integer not null,
  name         text not null,
  -- `character_name`, not `character`: the bare word is a Postgres keyword and
  -- would need quoting or care in every future query for no benefit.
  character_name text,
  profile_path text,
  primary key (tmdb_id, billing)
);
create index film_cast_person_idx on public.film_cast (person_id);

comment on table public.film_cast is
  'Top-billed cast only (3-5 rows), sliced from the 95-entry credits array we deliberately do not store.';

-- The link. NULLABLE forever: manually-added films (ADR-002''s required
-- fallback) have no catalog row and must stay legal.
alter table public.films add column tmdb_id integer references public.film_catalog (tmdb_id);
create index films_tmdb_id_idx on public.films (tmdb_id);

-- ---------------------------------------------------------------------------
-- 2. RLS
--
--    These three policies are the repo's FIRST unconditional SELECT, and that
--    is a CHOICE rather than an oversight under ADR-004's deny-by-default
--    posture. These tables hold public film metadata only — no user, league,
--    season, bid or money data — and every member must be able to browse the
--    release calendar. There is no write policy, so writes stay
--    RPC/service-role only like every other table in the schema.
-- ---------------------------------------------------------------------------
alter table public.film_catalog enable row level security;
alter table public.film_genres  enable row level security;
alter table public.film_cast    enable row level security;

create policy film_catalog_select on public.film_catalog
  for select to authenticated using (true);
create policy film_genres_select on public.film_genres
  for select to authenticated using (true);
create policy film_cast_select on public.film_cast
  for select to authenticated using (true);

grant select on public.film_catalog, public.film_genres, public.film_cast to authenticated;
grant select, insert, update, delete
  on public.film_catalog, public.film_genres, public.film_cast to service_role;

-- ---------------------------------------------------------------------------
-- 3. add_films_from_catalog
--
--    SKIP-AND-REPORT, NOT ALL-OR-NOTHING — deliberately unlike place_bids,
--    which is atomic because the budget check is a whole-basket invariant
--    (ADR-001). Here every failure is per-row and benign (already on the slate,
--    locked week, no US date), so failing six films because one was a duplicate
--    would protect no invariant. Hard errors are reserved for caller-level
--    problems: not signed in, not a commissioner, season missing, malformed
--    batch.
--
--    THE SECURITY PROPERTY THAT MAKES A PLAIN is_commissioner GUARD SUFFICIENT:
--    the browser sends only tmdb_ids, the season, and the create-week flag. The
--    SERVER ACTION re-fetches each film's detail from TMDB and builds p_films
--    itself, so a member can never inject a crafted poster_path, title or
--    release date. Do not add a client-supplied-payload caller.
--
--    NOTE ON ELIGIBILITY: neither API reports screen counts, so catalog films
--    arrive with screen_count null and eligible = true. That is add_film's
--    behaviour verbatim for an unknown count, and it is correct per rulebook §3
--    — unconfirmed films stay biddable and are removed with refunds if they
--    turn out to be under threshold (ADR-010/011).
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

      select coalesce(max(number), 0) + 1 into v_next_number
        from weeks where season_id = p_season_id;
      -- opening_date is set to the FRIDAY of the target week: weeks.week_of is
      -- generated from it, and Friday matches the convention 7 of the 10
      -- existing rows already follow. Born 'draft' so bidding is still opened
      -- deliberately.
      insert into weeks (season_id, number, opening_date, status)
      values (p_season_id, v_next_number, v_week_of + 4, 'draft')
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

revoke all on function public.add_films_from_catalog(uuid, jsonb, boolean) from public, anon;
grant execute on function public.add_films_from_catalog(uuid, jsonb, boolean) to authenticated;
