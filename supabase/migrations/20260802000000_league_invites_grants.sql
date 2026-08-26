-- Grants the league_invites migration forgot.
--
-- The table was created with RLS enabled and a SELECT policy, but no table
-- GRANT — and in Postgres those are two independent gates. A policy without a
-- grant is dead code: `authenticated` was denied at the privilege check before
-- RLS was ever consulted, so the commissioner's "Outstanding invitations" list
-- silently returned nothing. Every RPC kept working throughout, because
-- SECURITY DEFINER functions run as their owner and never touch the caller's
-- privileges — which is exactly why the spike did not catch this and a browser
-- click did.
--
-- Matches the phase-11 convention: SELECT for authenticated (RLS then decides
-- which rows), full DML for service_role (which bypasses RLS and is what
-- admin scripts and spikes use). Writes for ordinary users still go only
-- through the RPCs — there is deliberately no INSERT/UPDATE/DELETE policy for
-- authenticated, so the grant below cannot be used to forge an invitation.

grant select on public.league_invites to authenticated;
grant select, insert, update, delete on public.league_invites to service_role;
