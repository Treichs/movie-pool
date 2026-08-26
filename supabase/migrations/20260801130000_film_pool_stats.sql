-- Cross-league performance stats for one film, for the film detail page.
--
-- THE PRIVACY LINE THIS FUNCTION DRAWS, and why it is where it is.
--
-- A film's SCORE is an objective fact about the film: opening box office times
-- Tomatometer, both of which any league records identically because they
-- describe the movie, not the players. Sharing "this film averaged 41.2 points
-- across 3 leagues" reveals nothing about anybody.
--
-- A film's BIDS are player data. ADR-022 is the repo's most load-bearing rule:
-- while a week is open nobody sees another player's bid, INCLUDING the
-- commissioner, and RLS is what enforces it. A SECURITY DEFINER function
-- bypasses RLS by definition, so if this returned bid amounts it would hand a
-- non-member exactly what RLS exists to withhold — and for a film played in
-- only one other league, an "average winning bid" IS that league's bids.
--
-- So: this function returns PERFORMANCE ONLY. Bid-derived numbers (what was
-- paid, who owned it, points per dollar) are queried by the page through the
-- caller's OWN session, where RLS scopes them to leagues the viewer belongs to,
-- and the UI labels them as such. Nothing here needs a new policy, because
-- nothing here reads a policy-protected table for its sensitive columns.
--
-- SCOPED TO SCORED WEEKS. A week only reaches 'scored' once every eligible film
-- has its numbers captured, so restricting to it means nothing in flight can
-- leak, and every figure below is final rather than half-entered.

create or replace function public.get_film_pool_stats(p_tmdb_id integer)
returns jsonb
language sql
stable security definer set search_path = public
as $$
  with played as (
    select
      f.score,
      f.box_office_m,
      f.tomatometer,
      w.week_of,
      s.league_id
    from films f
    join weeks w   on w.id = f.week_id
    join seasons s on s.id = w.season_id
    where f.tmdb_id = p_tmdb_id
      and f.status = 'active'
      and w.status = 'scored'
      and f.captured_at is not null
      and f.score is not null
  )
  select jsonb_build_object(
    'times_played',    count(*),
    'league_count',    count(distinct league_id),
    'avg_score',       round(avg(score), 2),
    'best_score',      max(score),
    'worst_score',     min(score),
    'avg_box_office_m', round(avg(box_office_m), 2),
    'avg_tomatometer', round(avg(tomatometer)),
    'first_played',    min(week_of),
    'last_played',     max(week_of)
  )
  from played;
$$;

comment on function public.get_film_pool_stats(integer) is
  'Cross-league PERFORMANCE stats for a film (score, box office, Tomatometer) over scored weeks only. Deliberately returns no bid or ownership data — that is player data and stays behind RLS (ADR-022).';

revoke all on function public.get_film_pool_stats(integer) from public, anon;
grant execute on function public.get_film_pool_stats(integer) to authenticated;
