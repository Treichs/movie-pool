-- SITTING A WEEK OUT IS A SAVED SLATE OF ZEROS (ADR-109).
--
-- pass_week existed to answer one question no per-film amount could: has this
-- player NOT GOT ROUND TO IT, or have they DECIDED NOT TO PLAY? The migration
-- that introduced it (20260805010000) is explicit that "NO value stored in
-- bids.amount disambiguates it — including zero", and that was true of a table
-- where a player only ever had rows for films they had actively bid on.
--
-- The bid page now writes a row for EVERY film on the slate when a player
-- saves, $0 where they left it blank. A saved sheet of all zeros IS the
-- decision not to play, expressed per film, in the same data as every other
-- decision. The distinction pass_week carried is carried by the bids now.
--
-- WHAT MAKES THIS SAFE rather than merely tidy is the deadline reminder.
-- src/lib/notifications.ts's getMembersWhoBid asks which members have ANY bid
-- row for the week — it does not look at amounts. Under save-writes-zeros that
-- stays exactly right: a player who saved all zeros has rows and is correctly
-- not nagged, and one who never opened the page has none and is. That is the
-- behaviour pass_week was providing, obtained for free.
--
-- It also removes the only path by which a player could delete their own bids,
-- which always sat awkwardly beside the rulebook's rule that a bid may be
-- changed but never withdrawn.
--
-- DROPPED, NOT LEFT UNGRANTED, following the precedent set when
-- get_week_bidders was withdrawn in 20260805010000: "An exposed RPC nobody
-- calls is still an endpoint; a dropped one cannot be re-granted by accident."

drop function if exists public.pass_week(uuid);
drop function if exists public.resume_bidding(uuid);

-- WHAT IS DELIBERATELY KEPT:
--
-- 1. bid_sheets, and its 'passed' enum value. close_week still writes 'closed'
--    to every open sheet, RLS still seals the table, and rows already carrying
--    'passed' are a historical fact about weeks that have been played — they
--    are not rewritten. Nothing can CREATE a 'passed' sheet any more. Whether
--    the table still earns its place once its states are (no row) / open /
--    closed is a live question, deliberately left open rather than answered
--    with a drop nobody asked for.
--
-- 2. touch_bid_sheet, which place_bid and place_bids both call. It is the only
--    remaining writer of an 'open' sheet.

comment on type public.bid_sheet_status is
  'open | passed | closed. ADR-109 retired the writer of ''passed'' — sitting a '
  'week out is a saved slate of $0 bids — so the value survives only on rows '
  'written before 2026-08-12 and cannot be produced again.';
