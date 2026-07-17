-- Guard against orphaned policies.
--
-- A policy with a null account_id belongs to no customer: it renders nowhere in
-- the app and is effectively lost data, while payments/documents can still FK to
-- it. The unified Add Policy page wrote exactly one such row when a concurrent
-- double-run reset the shared save context mid-flight, so the policy step read
-- an accountId of null and inserted anyway.
--
-- The app-side fixes are a synchronous re-entrancy guard in useUnifiedIntakeSave
-- plus an explicit accountId invariant before the insert. This is the
-- database-level backstop so no future writer can recreate the condition.
--
-- Verified 0 violating rows before applying (the single orphan was re-linked to
-- its customer first).

alter table public.policies
  alter column account_id set not null;
