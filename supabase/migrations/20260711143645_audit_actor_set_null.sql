-- audit_log.actor: audit records must outlive the people they mention.
-- Deleting a profile previously failed with a foreign-key violation if the
-- person had audit entries (found by the phase-1 RLS spike's cleanup);
-- now the entry is kept and the actor reference is blanked.

alter table public.audit_log
  drop constraint audit_log_actor_fkey;

alter table public.audit_log
  add constraint audit_log_actor_fkey
  foreign key (actor) references public.profiles (id) on delete set null;
