-- intake-v4 migration M3b: sixteen leads policies down to five, and close the anonymous insert.
--
-- ledger version: pending
--
-- NEEDS LANDEN APPROVAL BEFORE PROD APPLY, AND BRIAN MUST FIRST ANSWER WHAT THE
-- PUBLIC SITE'S /api/lead ROUTE DOES WITH A SUBMISSION. Apply through the Supabase
-- management API (MCP apply_migration) only. Never run a CLI push against production.
--
-- Why this needs Brian first
--   lewisinsurance.com is a Next.js site with two quote forms that post to its own
--   server route /api/lead. That route is live and returns an id. Its server code is
--   not in this repo, so where it writes is unverified. Everything measurable says it
--   does not reach this table: no lead in production carries a website marker, the
--   intake and portal quote request tables are empty, and the last 24 hours of
--   gateway logs show no anonymous write to leads. If the route did insert through
--   the public key it would already have been failing since April, when
--   agency_workspace_id became NOT NULL. That is strong evidence, not proof, and the
--   cost of being wrong is silently dropping real prospects. One question, one
--   answer, then this runs.
--
-- What changes
--   Sixteen overlapping policies become five. The current set has four different
--   ideas of who staff are (profiles.is_staff, is_staff(), account_memberships roles,
--   agency_workspace_memberships) layered on top of each other, plus a PUBLIC role
--   policy that lets any authenticated user act on a lead they are assigned to, plus
--   an INSERT policy whose check is literally true, granted to PUBLIC. Because RLS
--   policies are OR'd together, the widest one wins every time. The widest one here
--   is "Anyone can submit leads".
--
-- The target matrix (report section 10.5)
--   Staff with an active workspace membership   read, insert, update. No delete.
--   Authenticated non staff                     nothing
--   Portal member of a linked account           nothing; leads are internal
--   Anonymous                                   nothing
--   service_role                                everything
--
--   Soft delete stays the only delete: staff set deleted_at with an UPDATE, and the
--   prevent_hard_delete_leads trigger (kept in M2) still refuses a real DELETE. The
--   explicit deny policy below is written out rather than left implicit so that the
--   intent is visible in the catalogue, not inferred from an absence.
--
-- Why the read policy does not say "deleted_at is null"
--   The first draft of this migration did say it, copying the current
--   leads_select_policy. Testing on the branch proved that draft could not soft delete
--   at all: PostgreSQL applies SELECT policies to the NEW row of an UPDATE, so setting
--   deleted_at made the row invisible to the very policy being checked and the update
--   was refused with "new row violates row-level security policy". Today's sixteen
--   policy set hides that, because the wide "Staff can manage leads" ALL policy has no
--   WITH CHECK and therefore passes anything; tighten the set and the trap springs.
--
--   So the read policy checks workspace membership only, and hiding soft deleted rows
--   is the application's job. That is already the convention everywhere in this
--   codebase: 72 hook queries filter .is('deleted_at', null), and the search_leads RPC
--   filters too. The trade is deliberate and worth stating plainly: a staff user who
--   writes a raw query with no filter can now see tombstoned prospects. They are staff,
--   in their own workspace, looking at their own agency's records, and a tombstone is
--   an errors and omissions trail rather than a secret. The alternative, keeping the
--   filter and moving soft delete into a definer function, would have broken the
--   existing delete button on the Leads page, which writes the tombstone directly.
--
-- The anonymous grant
--   Separately from policies, the anon role holds a plain INSERT grant on the table.
--   A grant and a policy are two different gates and both have to close.
--   Production today: anon = INSERT. Target: anon = nothing.
--
-- Who still writes leads after this
--   The New Lead page and the older Contacts form, both signed in staff, both already
--   sending agency_workspace_id (verified in code). At the edge, lead-capture-webhook
--   and the two Canopy functions, all using the service role, which policies do not
--   restrict. The webhook is API key gated, was last deployed 2026-01-07, was not
--   called in the last 24 hours, and has its own separate bug: it never sets
--   agency_workspace_id, so its insert branch cannot succeed today regardless.
--
-- Smoke test after apply (the seven tests from report 10.5)
--   1. staff create      expect success
--   2. staff read        expect the row
--   3. staff update      expect success
--   4. staff soft delete expect success (update deleted_at); the row then disappears
--                        from every application read, which filters deleted_at
--   5. anonymous insert  expect refused, at the grant and at the policy
--   6. non staff profile expect refused on read, insert and update
--   7. portal membership expect refused on read

drop policy if exists "Anyone can submit leads" on public.leads;
drop policy if exists "Staff can create leads" on public.leads;
drop policy if exists "Staff can delete leads" on public.leads;
drop policy if exists "Staff can insert leads" on public.leads;
drop policy if exists "Staff can manage leads" on public.leads;
drop policy if exists "Staff can update leads" on public.leads;
drop policy if exists "Users can create leads" on public.leads;
drop policy if exists "Users can delete leads" on public.leads;
drop policy if exists "Users can manage leads they created or are assigned to" on public.leads;
drop policy if exists "Users can update leads" on public.leads;
drop policy if exists "Users can update their assigned leads" on public.leads;
drop policy if exists leads_delete_policy on public.leads;
drop policy if exists leads_insert_policy on public.leads;
drop policy if exists leads_select_policy on public.leads;
drop policy if exists leads_service_role_policy on public.leads;
drop policy if exists leads_update_policy on public.leads;

-- 1 of 5. Staff read, workspace scoped. Deliberately does NOT filter deleted_at; see
-- the note above. Every application read filters it.
create policy leads_select_staff on public.leads
  as permissive for select to authenticated
  using (
    exists (
      select 1 from public.agency_workspace_memberships awm
      where awm.agency_workspace_id = leads.agency_workspace_id
        and awm.user_id = auth.uid()
        and awm.status = 'active'
    )
  );

-- 2 of 5. Staff insert, workspace scoped. A lead cannot be filed into another
-- agency's workspace by changing the id in the request.
create policy leads_insert_staff on public.leads
  as permissive for insert to authenticated
  with check (
    exists (
      select 1 from public.agency_workspace_memberships awm
      where awm.agency_workspace_id = leads.agency_workspace_id
        and awm.user_id = auth.uid()
        and awm.status = 'active'
    )
  );

-- 3 of 5. Staff update, workspace scoped on both sides, so a row cannot be moved out
-- of the workspace by an update either. Soft delete happens here.
create policy leads_update_staff on public.leads
  as permissive for update to authenticated
  using (
    exists (
      select 1 from public.agency_workspace_memberships awm
      where awm.agency_workspace_id = leads.agency_workspace_id
        and awm.user_id = auth.uid()
        and awm.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.agency_workspace_memberships awm
      where awm.agency_workspace_id = leads.agency_workspace_id
        and awm.user_id = auth.uid()
        and awm.status = 'active'
    )
  );

-- 4 of 5. Nobody deletes. Written out rather than left implicit so the rule is
-- readable in the catalogue. The prevent_hard_delete_leads trigger is the second lock.
create policy leads_no_delete on public.leads
  as permissive for delete to authenticated
  using (false);

-- 5 of 5. The service role keeps everything, which is how the edge functions write.
create policy leads_service_role_all on public.leads
  as permissive for all to service_role
  using (true)
  with check (true);

-- The grant, which is a separate gate from the policies.
revoke insert on public.leads from anon;

-- >>> DOWN BEGIN
/*
drop policy if exists leads_select_staff on public.leads;
drop policy if exists leads_insert_staff on public.leads;
drop policy if exists leads_update_staff on public.leads;
drop policy if exists leads_no_delete on public.leads;
drop policy if exists leads_service_role_all on public.leads;

grant insert on public.leads to anon;

create policy "Anyone can submit leads" on public.leads as permissive for insert to public with check (true);
create policy "Staff can create leads" on public.leads as permissive for insert to public with check ((account_id IN ( SELECT account_memberships.account_id FROM account_memberships WHERE ((account_memberships.user_id = auth.uid()) AND (account_memberships.role = ANY (ARRAY['owner'::text, 'staff'::text, 'admin'::text, 'producer'::text]))))));
create policy "Staff can delete leads" on public.leads as permissive for delete to public using ((account_id IN ( SELECT account_memberships.account_id FROM account_memberships WHERE ((account_memberships.user_id = auth.uid()) AND (account_memberships.role = ANY (ARRAY['owner'::text, 'staff'::text, 'admin'::text]))))));
create policy "Staff can insert leads" on public.leads as permissive for insert to authenticated with check ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_staff = true)))));
create policy "Staff can manage leads" on public.leads as permissive for all to authenticated using ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_staff = true)))));
create policy "Staff can update leads" on public.leads as permissive for update to public using ((account_id IN ( SELECT account_memberships.account_id FROM account_memberships WHERE ((account_memberships.user_id = auth.uid()) AND (account_memberships.role = ANY (ARRAY['owner'::text, 'staff'::text, 'admin'::text, 'producer'::text]))))));
create policy "Users can create leads" on public.leads as permissive for insert to authenticated with check (is_staff());
create policy "Users can delete leads" on public.leads as permissive for delete to authenticated using (is_staff());
create policy "Users can manage leads they created or are assigned to" on public.leads as permissive for all to public using (((created_by = auth.uid()) OR (assigned_to = auth.uid())));
create policy "Users can update leads" on public.leads as permissive for update to authenticated using (is_staff()) with check (is_staff());
create policy "Users can update their assigned leads" on public.leads as permissive for update to authenticated using (((assigned_to = auth.uid()) OR (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.is_staff = true))))));
create policy leads_delete_policy on public.leads as permissive for delete to authenticated using ((EXISTS ( SELECT 1 FROM agency_workspace_memberships awm WHERE ((awm.agency_workspace_id = leads.agency_workspace_id) AND (awm.user_id = auth.uid()) AND (awm.status = 'active'::text)))));
create policy leads_insert_policy on public.leads as permissive for insert to authenticated with check ((EXISTS ( SELECT 1 FROM agency_workspace_memberships awm WHERE ((awm.agency_workspace_id = leads.agency_workspace_id) AND (awm.user_id = auth.uid()) AND (awm.status = 'active'::text)))));
create policy leads_select_policy on public.leads as permissive for select to authenticated using (((deleted_at IS NULL) AND ((EXISTS ( SELECT 1 FROM agency_workspace_memberships awm WHERE ((awm.agency_workspace_id = leads.agency_workspace_id) AND (awm.user_id = auth.uid()) AND (awm.status = 'active'::text)))) OR ((account_id IS NOT NULL) AND (EXISTS ( SELECT 1 FROM account_memberships am WHERE ((am.account_id = leads.account_id) AND (am.user_id = auth.uid()))))) OR (assigned_to = auth.uid()))));
create policy leads_service_role_policy on public.leads as permissive for all to service_role using (true) with check (true);
create policy leads_update_policy on public.leads as permissive for update to authenticated using (((EXISTS ( SELECT 1 FROM agency_workspace_memberships awm WHERE ((awm.agency_workspace_id = leads.agency_workspace_id) AND (awm.user_id = auth.uid()) AND (awm.status = 'active'::text)))) OR (assigned_to = auth.uid()))) with check ((EXISTS ( SELECT 1 FROM agency_workspace_memberships awm WHERE ((awm.agency_workspace_id = leads.agency_workspace_id) AND (awm.user_id = auth.uid()) AND (awm.status = 'active'::text)))));
*/
-- >>> DOWN END
