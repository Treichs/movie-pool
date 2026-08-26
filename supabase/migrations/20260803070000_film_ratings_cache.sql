-- ============================================================================
-- film_ratings — the cached, scheduled Tomatometer.
--
-- WHY A CACHE AT ALL. The week-first dashboard wants a live Tomatometer, and
-- the reason it shipped without one is arithmetic: OMDb is rate-limited per
-- key, the block renders for every user on every load, and one request per
-- film per view exhausts a free-tier quota on a busy Friday — taking the
-- release calendar down with it, since both share the key budget. Reads have
-- to be free at render time, so the fetching moves OFF the render path
-- entirely and this table is what the page reads instead.
--
-- WHAT THIS IS NOT. It is NOT a second scoring truth. films.tomatometer stays
-- the value the commissioner captured, it alone feeds the generated score
-- column, and nothing here ever writes to it — ADR-041's rule that OMDb
-- values reach a film only through a commissioner's own capture_film
-- submission is untouched. This table holds an INDICATIVE current score and
-- the UI labels it as provisional wherever a captured value does not exist.
-- The moment a film is captured, the captured number is what shows.
--
-- KEYED BY imdb_id, not film_id. The same film sits on the slates of every
-- league playing that weekend, and keying by film would fetch it once per
-- league — the exact multiplication the cache exists to remove. One row per
-- title, shared by everyone.
-- ============================================================================

create table if not exists public.film_ratings (
  imdb_id       text primary key check (imdb_id ~ '^tt[0-9]+$'),
  tomatometer   smallint check (tomatometer is null or (tomatometer between 0 and 100)),
  -- Distinguishes "asked, Rotten Tomatoes has no score yet" from "never
  -- asked". The same distinction ADR-052's capture provenance draws, and for
  -- the same reason: a film that opens Friday genuinely has no Tomatometer on
  -- Thursday, and rendering that as a gap in our data would be wrong.
  checked_at    timestamptz not null default now(),
  -- The last time OMDb actually answered, successful or not. Separate from
  -- checked_at so a run of failures cannot masquerade as fresh data.
  fetched_at    timestamptz,
  fetch_error   text
);

comment on table public.film_ratings is
  'Cached OMDb Tomatometer, refreshed on a schedule. INDICATIVE only — '
  'films.tomatometer remains the captured, scoring value (ADR-041).';

-- RLS: readable by any signed-in member, writable by nobody through the API.
-- The refresh route holds the service role, which bypasses RLS; there is no
-- policy for insert or update, so an authenticated client cannot poison the
-- cache even though it can read it.
alter table public.film_ratings enable row level security;

drop policy if exists film_ratings_select on public.film_ratings;
create policy film_ratings_select on public.film_ratings
  for select to authenticated using (true);

grant select on public.film_ratings to authenticated;

-- ---------------------------------------------------------------------------
-- ratings_refresh_targets — the BOUNDED set of films worth asking about.
--
-- The whole safety of this design is that the refresh set has a ceiling that
-- does not grow with traffic, only with how much pool is being played. A film
-- qualifies when:
--   * it is on an active slate (status active, in a season that is not
--     archived), and
--   * its week is recent — opening within the last 5 weeks or the next 2.
--     Before release there is usually no score; long after it, the score has
--     stopped moving and the commissioner has captured anyway.
--   * and its cached row is stale, or absent.
--
-- p_max is a hard cap on top of that, so a pathological season cannot turn one
-- scheduled run into a thousand requests.
-- ---------------------------------------------------------------------------
create or replace function public.ratings_refresh_targets(
  p_stale_hours integer default 12,
  p_max         integer default 120
)
returns table (imdb_id text)
language sql stable security definer set search_path = public
as $$
  select distinct f.imdb_id
  from films f
  join weeks w    on w.id = f.week_id
  join seasons s  on s.id = w.season_id
  left join film_ratings fr on fr.imdb_id = f.imdb_id
  where f.imdb_id is not null
    and f.status = 'active'
    and s.status <> 'archived'
    and w.week_of between (current_date - 35) and (current_date + 14)
    and (fr.imdb_id is null
         or fr.checked_at < now() - make_interval(hours => greatest(1, p_stale_hours)))
  order by f.imdb_id
  limit greatest(1, p_max)
$$;

comment on function public.ratings_refresh_targets(integer, integer) is
  'The bounded set of IMDb ids the scheduled Tomatometer refresh should ask '
  'OMDb about. Bounded by recency, by staleness and by a hard cap, so the '
  'request count scales with pool activity and never with traffic.';

-- Service role only — this is the refresh route's own query and there is no
-- reason for a browser to enumerate it.
revoke all on function public.ratings_refresh_targets(integer, integer) from public, anon, authenticated;
grant execute on function public.ratings_refresh_targets(integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- record_film_rating — one upsert, written by the refresh route.
--
-- A FAILED fetch still touches checked_at. Without that, a film OMDb has no
-- record of would be re-requested on every single run forever, which is
-- exactly the runaway the cache exists to prevent — the failure has to be
-- remembered as cheaply as the success.
-- ---------------------------------------------------------------------------
create or replace function public.record_film_rating(
  p_imdb_id     text,
  p_tomatometer integer default null,
  p_error       text    default null
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_imdb_id !~ '^tt[0-9]+$' then
    raise exception '"%" is not an IMDb id', p_imdb_id;
  end if;
  if p_tomatometer is not null and (p_tomatometer < 0 or p_tomatometer > 100) then
    raise exception 'a Tomatometer is 0-100';
  end if;

  insert into film_ratings (imdb_id, tomatometer, checked_at, fetched_at, fetch_error)
  values (p_imdb_id, p_tomatometer::smallint, now(),
          case when p_error is null then now() else null end,
          p_error)
  on conflict (imdb_id) do update set
    -- A failed run must not ERASE a good score. Keeping the last known value
    -- while recording the failure is what makes the cache degrade rather than
    -- blank out when OMDb has a bad afternoon.
    tomatometer = case when p_error is null
                       then excluded.tomatometer
                       else film_ratings.tomatometer end,
    checked_at  = now(),
    fetched_at  = case when p_error is null then now() else film_ratings.fetched_at end,
    fetch_error = p_error;
end;
$$;

revoke all on function public.record_film_rating(text, integer, text) from public, anon, authenticated;
grant execute on function public.record_film_rating(text, integer, text) to service_role;
