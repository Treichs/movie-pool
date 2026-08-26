-- bid_sheets had RLS but no GRANTs, which is not the same thing.
--
-- Caught by the phase-4 spike: reading the table as the SERVICE ROLE failed
-- with "permission denied for table bid_sheets", which is a table-privilege
-- error, not a policy one. RLS filters rows a role is already allowed to
-- touch; it cannot grant the touching. A new table starts with privileges for
-- its owner and nobody else, so the policy written in 20260805010000 was
-- guarding a door no role could reach in the first place.
--
-- Matched to what `bids` carries, deliberately, because the two are read
-- together and by the same people:
--
--   authenticated  SELECT only. Every write goes through a SECURITY DEFINER
--                  RPC (ADR-004), which is what stops a player forging a
--                  state on their own sheet.
--   service_role   full, for the spikes and the seed scripts.
--   anon           nothing. Signed-out visitors have no business here.
--
-- The reason this was not caught by the migration itself: `supabase db push`
-- applies DDL as the owner, and the owner always has privileges — so the table
-- and its policy both applied cleanly and the gap only appeared when a
-- different role read it.

grant select on table public.bid_sheets to authenticated;
grant select, insert, update, delete on table public.bid_sheets to service_role;
