-- ============================================================================
-- Drop get_film_pool_stats — ADR-408 supersedes ADR-047.
--
-- The function averaged score, box office and Tomatometer ACROSS leagues, on
-- ADR-047's premise that those numbers describe the film identically wherever
-- it is recorded. They do not: commissioners enter box office and the
-- Tomatometer BY HAND per league-season (ADR-091's Monday capture), so two
-- leagues legitimately hold different values for the same film, and a
-- cross-league average is a number no league recognises as its own.
--
-- The film page now shows ONE scope of play data — the context league's own
-- record — loaded through the caller's session with RLS as the only gate
-- (?league= on /films/[tmdbId]; see lib/film-page.ts). No definer function
-- remains on this surface, so ADR-047's spike guard against bid-shaped keys
-- growing into the payload retires with the hazard it guarded.
-- ============================================================================

drop function if exists public.get_film_pool_stats(integer);
