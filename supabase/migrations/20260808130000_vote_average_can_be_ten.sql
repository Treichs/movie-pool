-- tmdb_vote_average can legally be ten, and its column couldn't hold it
-- (2026-08-08).
--
-- numeric(4,3) stores at most 9.999 — one digit before the point — but 10.0
-- is a value TMDB actually serves: an upcoming film with a couple of early
-- perfect votes averages exactly 10, and those are precisely the films the
-- release calendar and the mock-season fixture discover. The insert then dies
-- with "numeric field overflow", which is how the re-based mock:season found
-- this: its dynamically discovered slate included one, where the old
-- hand-picked ids never happened to.
--
-- numeric(5,3) fits 10.000 exactly; the CHECK keeps the semantic range, so
-- nothing above ten sneaks in through the widened type.
alter table public.film_catalog
  alter column tmdb_vote_average type numeric(5, 3);

comment on column public.film_catalog.tmdb_vote_average is
  'TMDB vote average, 0-10 inclusive. numeric(5,3) because a legitimate 10.0 '
  'needs two digits before the point — numeric(4,3) rejected it.';
