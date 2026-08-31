-- ============================================================================
-- `add_film` goes. It was dead code with a live grant.
--
-- It creates a film from a TYPED TITLE and never sets `tmdb_id`, which is the
-- only way a film ever ended up with no catalog row. A film with no catalog
-- row is not merely poster-less: BOTH film routes are addressed by tmdb id
-- (`/films/[tmdbId]` and `/leagues/[leagueId]/films/[tmdbId]`), so such a film
-- is unreachable — it cannot be linked to, searched for, or seen across
-- leagues. It exists only inside its own week, permanently.
--
-- IT HAS NO CALLERS. The application's only film-creation path is
-- `add_films_from_catalog`, which re-fetches every film from TMDB before it
-- writes and therefore always sets the link. `add_film` was reachable only by
-- calling the RPC directly — it was granted to `authenticated` — and by the
-- dev seeder, which moved to the catalog path in the same change as this.
--
-- So this does not close an escape hatch a commissioner had. It closes one the
-- schema still advertised after the product stopped offering it.
--
-- WHAT THIS DELIBERATELY DOES NOT DO: `films.tmdb_id` stays NULLABLE for now.
-- Two rows in the replica league still carry no link — one of them scored and
-- owned — and a NOT NULL added over real data nobody has resolved would either
-- fail outright or invite a guessed match. The constraint is a separate
-- migration, and it comes after those two are answered.
-- ============================================================================

revoke all on function public.add_film(uuid, text, text) from public, anon, authenticated, service_role;
drop function if exists public.add_film(uuid, text, text);
