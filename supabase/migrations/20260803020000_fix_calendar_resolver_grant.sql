-- Grant 20260803010000 forgot: service_role could not execute calendar_week_id_for.
--
-- The anchor triggers on weeks and films are plain (invoker-rights) trigger
-- functions, so the resolver they call is executed AS THE WRITER. Revoking it
-- from PUBLIC and granting only to `authenticated` therefore broke every
-- service_role write — which is what admin scripts, seeders and the spikes
-- use — with `permission denied for function calendar_week_id_for`.
--
-- Not caught by the migration (it pushed clean), by the backfill (that runs as
-- the owner), or by any read. Caught by spike:catalog on its first
-- service_role INSERT into films. Same family as the league_invites
-- policy-without-a-grant bug: EXECUTE is a privilege check that happens before
-- anything else, and SECURITY DEFINER does not exempt the CALLER from needing
-- it — it only changes who the function runs as once the call is allowed.

grant execute on function public.calendar_week_id_for(date) to service_role;
