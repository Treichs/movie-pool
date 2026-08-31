-- ============================================================================
-- `films.tmdb_id` becomes NOT NULL: every film is a real film.
--
-- A film with no catalog row is UNREACHABLE. Both film routes are addressed by
-- tmdb id — `/films/[tmdbId]` and `/leagues/[leagueId]/films/[tmdbId]` — so an
-- unlinked film has no page, cannot be linked to, cannot be searched for, and
-- cannot be recognised as the same film in another league. It exists only
-- inside its own week, permanently.
--
-- `add_film` was the only thing that made one, and 20260831180000 dropped it.
-- The dev fixtures moved to the catalog path in the same change. What remained
-- were two rows from the 2026-08-12 replica ingest, which matched titles
-- exactly and left the two it could not match unlinked.
--
-- ── THE TWO ROWS, AND WHY THEY ARE DELETED RATHER THAN MATCHED ────────────
-- Neither resolves against TMDB. Searched by title, by title and year, and
-- against every real US wide release on both weekends:
--
--   "Finding Familty"  2026-08-28, 0 bids, unscored. A typo, and correcting it
--                      does not help — there is no "Finding Family" released in
--                      2026 at all.
--   "The Resurrected"  2026-04-17, week FINAL, scored 6.21, three owners. No
--                      2026 film carries that name; that weekend's real wide
--                      releases were Lee Cronin's The Mummy, Normal, Mother
--                      Mary and eight smaller titles, none of them a match.
--
-- A guessed match is worse than a deletion: it would bind the wrong film's
-- poster, cast and cross-league identity to a film three people bid on, and it
-- would be invisible afterwards. Deleting is honest and, unlike a guess, it is
-- recoverable — which is what the block below is for.
--
-- ── THE FULL ROWS, SO THIS IS REVERSIBLE ──────────────────────────────────
-- Captured immediately before the delete. `bids` cascades from `films`, so the
-- three winning bids go with "The Resurrected" and are recorded here too. Note
-- the cost this carries in the replica's standings: Jenny Boisvert ($26),
-- Craig Martin ($23) and Cheryl Meyer ($23) each lose 6.21 points and get
-- their spend back, in a week that had already gone final.
--
-- {
--   "films": [
--     { "id": "69feef50-ea69-4602-9837-00daaaca8baa",
--       "week_id": "64fea661-196a-41b2-b29c-fd58e0ec3202",
--       "title": "Finding Familty", "status": "active", "eligible": true,
--       "imdb_id": null, "tmdb_id": null, "score": null, "tomatometer": null,
--       "box_office_m": null, "release_date": null, "captured_at": null,
--       "removed_reason": null, "release_calendar_week_id": null,
--       "created_at": "2026-08-12T19:54:08.999004+00:00" },
--     { "id": "7c13a117-d9c8-4212-b717-53ec194b428c",
--       "week_id": "cbd62afe-6964-4132-b6da-e9dbc6cbe977",
--       "title": "The Resurrected", "status": "active", "eligible": true,
--       "imdb_id": null, "tmdb_id": null, "score": 6.21, "tomatometer": 46,
--       "box_office_m": 13.51, "release_date": null,
--       "captured_at": "2026-08-12T19:53:38.440516+00:00",
--       "removed_reason": null, "release_calendar_week_id": null,
--       "created_at": "2026-08-12T19:53:37.827622+00:00" }
--   ],
--   "bids": [
--     { "id": "6e0fbbeb-a21b-410a-a530-3eab5327a83e", "amount": 26,
--       "film_id": "7c13a117-d9c8-4212-b717-53ec194b428c", "is_winning": true,
--       "season_member_id": "a56eb976-4258-452a-af9f-ed54467149c6",
--       "created_at": "2026-08-12T19:53:38.107981+00:00" },
--     { "id": "7ee58496-c3f8-47e5-9fe4-b7e747a034c6", "amount": 23,
--       "film_id": "7c13a117-d9c8-4212-b717-53ec194b428c", "is_winning": true,
--       "season_member_id": "4f2c53ea-ca53-4d40-b3be-84103802a1fa",
--       "created_at": "2026-08-12T19:53:38.148208+00:00" },
--     { "id": "bc763093-e472-4a53-8607-52de71d18bdf", "amount": 23,
--       "film_id": "7c13a117-d9c8-4212-b717-53ec194b428c", "is_winning": true,
--       "season_member_id": "62c7c299-d56f-434f-8ff3-b3837d64b55a",
--       "created_at": "2026-08-12T19:53:38.196855+00:00" }
--   ]
-- }
--
-- BY ID, NOT BY `tmdb_id IS NULL`. A predicate delete would silently take
-- whatever else happened to be unlinked when this ran; these two rows are the
-- ones that were looked at, and they are the only ones this is allowed to
-- remove. On any database that does not hold them it deletes nothing and the
-- constraint below still applies.
-- ============================================================================

delete from films
where id in (
  '69feef50-ea69-4602-9837-00daaaca8baa',  -- Finding Familty
  '7c13a117-d9c8-4212-b717-53ec194b428c'   -- The Resurrected
);

alter table films alter column tmdb_id set not null;

comment on column films.tmdb_id is
  'Required. Every film is a film_catalog row — both film routes are addressed '
  'by tmdb id, so a film without one would have no page and no cross-league '
  'identity. Set only by add_films_from_catalog, which re-fetches from TMDB '
  'before it writes.';
