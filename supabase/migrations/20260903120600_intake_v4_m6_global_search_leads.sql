-- intake-v4 migration M6: put prospects into global search, take the dead contacts branch out.
--
-- ledger version: pending
--
-- NEEDS LANDEN APPROVAL BEFORE PROD APPLY. Apply through the Supabase management API
-- (MCP apply_migration) only. Never run a CLI push against production.
--
-- Why
--   The command palette is how the office finds anything. Today it searches customers,
--   contacts, businesses and policies, and it cannot find a prospect at all. Once
--   prospects are being typed in every day, a name that is in the system but
--   unfindable is worse than one that was never entered: staff re-enter it and the
--   book grows duplicates.
--
-- The contacts branch
--   public.contacts is the deprecated table (665 rows, superseded by accounts and
--   insured_profiles). It is not droppable yet: eight database functions and two
--   deployed edge functions still read it, and automation_workflow_executions holds a
--   foreign key to it (report section 10.8 item 3). This migration removes only the
--   search branch, which is one of those eight readers. The table and everything else
--   stay exactly where they are. Removing the branch here is what makes the eventual
--   drop smaller, and it stops the palette showing a contact row that leads nowhere
--   useful.
--
-- Everything else about the function is unchanged, including its workspace scoping,
-- its early return when there is no signed in user, and its result shape
-- (entity_type, id, label, subtitle, email, phone). The signature is identical, so
-- this is a CREATE OR REPLACE and existing grants survive; they are re-asserted below
-- anyway so the end state does not depend on M3a having run first.
--
-- Smoke test after apply
--   1. search a prospect's last name from the command palette: the prospect appears,
--      labelled as a prospect with its current stage
--   2. search a prospect's phone number: same
--   3. search a customer, a business and a policy number: unchanged results
--   4. confirm no row of type contact comes back for a term that used to return one
--   5. as the anonymous role, call global_search_v1: refused

create or replace function public.global_search_v1(p_search_term text, p_limit integer default 50)
 returns table(entity_type text, id uuid, label text, subtitle text, email text, phone text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_search_pattern TEXT;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL OR p_search_term IS NULL OR trim(p_search_term) = '' THEN
    RETURN;
  END IF;
  v_search_pattern := '%' || trim(p_search_term) || '%';

  RETURN QUERY

  SELECT 'account'::TEXT, a.id,
    CASE WHEN a.goes_by IS NOT NULL AND a.goes_by <> ''
         THEN a.name || ' (' || a.goes_by || ')' ELSE COALESCE(a.name, 'Unnamed Account') END,
    CASE WHEN a.city IS NOT NULL AND a.state IS NOT NULL THEN a.city || ', ' || a.state ELSE NULL END,
    a.email, a.phone
  FROM accounts a
  LEFT JOIN agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
    AND awm.user_id = v_user_id AND awm.status = 'active'
  WHERE a.deleted_at IS NULL
    AND (a.agency_workspace_id IS NULL OR awm.id IS NOT NULL)
    AND (a.name ILIKE v_search_pattern OR a.email ILIKE v_search_pattern OR a.phone ILIKE v_search_pattern
      OR a.goes_by ILIKE v_search_pattern
      OR EXISTS (SELECT 1 FROM account_aliases al WHERE al.account_id = a.id AND al.alias ILIKE v_search_pattern))

  UNION ALL

  -- Prospects. Workspace scoping is an inner join because leads.agency_workspace_id
  -- has been NOT NULL since April, so there is no null workspace case to allow for.
  SELECT 'lead'::TEXT, l.id,
    COALESCE(
      NULLIF(trim(COALESCE(l.company_name, '')), ''),
      NULLIF(trim(COALESCE(l.first_name, '') || ' ' || COALESCE(l.last_name, '')), ''),
      'Unnamed prospect'),
    'Prospect, ' || COALESCE(l.status, 'new'),
    l.email, l.phone
  FROM leads l
  JOIN agency_workspace_memberships awm ON awm.agency_workspace_id = l.agency_workspace_id
    AND awm.user_id = v_user_id AND awm.status = 'active'
  WHERE l.deleted_at IS NULL
    AND (l.first_name ILIKE v_search_pattern OR l.last_name ILIKE v_search_pattern
      OR l.company_name ILIKE v_search_pattern
      OR l.email ILIKE v_search_pattern OR l.phone ILIKE v_search_pattern)

  UNION ALL

  SELECT 'business'::TEXT, b.id, COALESCE(b.legal_name, b.dba, 'Unnamed Business'),
    b.dba, NULL, NULL
  FROM businesses b
  INNER JOIN accounts a ON a.business_id = b.id
  LEFT JOIN agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
    AND awm.user_id = v_user_id AND awm.status = 'active'
  WHERE b.deleted_at IS NULL
    AND (a.agency_workspace_id IS NULL OR awm.id IS NOT NULL)
    AND (b.legal_name ILIKE v_search_pattern OR b.dba ILIKE v_search_pattern)

  UNION ALL

  SELECT 'policy'::TEXT, p.id,
    CASE WHEN p.policy_number IS NOT NULL THEN 'Policy #' || p.policy_number ELSE COALESCE(p.named_insured, 'Unnamed Policy') END,
    COALESCE(car.name, 'Unknown Carrier') || ' - ' || COALESCE(p.line_of_business, 'Unknown Line'),
    NULL, NULL
  FROM policies p
  LEFT JOIN carriers car ON car.id = p.carrier_id
  INNER JOIN accounts a ON a.id = p.account_id
  LEFT JOIN agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
    AND awm.user_id = v_user_id AND awm.status = 'active'
  WHERE p.deleted_at IS NULL
    AND (a.agency_workspace_id IS NULL OR awm.id IS NOT NULL)
    AND (p.policy_number ILIKE v_search_pattern OR p.named_insured ILIKE v_search_pattern
      OR p.line_of_business ILIKE v_search_pattern OR car.name ILIKE v_search_pattern)

  LIMIT p_limit;
END;
$function$;

revoke execute on function public.global_search_v1(text, integer) from public;
revoke execute on function public.global_search_v1(text, integer) from anon;
grant execute on function public.global_search_v1(text, integer) to authenticated;
grant execute on function public.global_search_v1(text, integer) to service_role;

-- >>> DOWN BEGIN
/*
-- Restores the production definition read on 2026-09-03: contacts branch present,
-- no prospects branch.
create or replace function public.global_search_v1(p_search_term text, p_limit integer default 50)
 returns table(entity_type text, id uuid, label text, subtitle text, email text, phone text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_search_pattern TEXT;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL OR p_search_term IS NULL OR trim(p_search_term) = '' THEN
    RETURN;
  END IF;
  v_search_pattern := '%' || trim(p_search_term) || '%';

  RETURN QUERY

  SELECT 'account'::TEXT, a.id,
    CASE WHEN a.goes_by IS NOT NULL AND a.goes_by <> ''
         THEN a.name || ' (' || a.goes_by || ')' ELSE COALESCE(a.name, 'Unnamed Account') END,
    CASE WHEN a.city IS NOT NULL AND a.state IS NOT NULL THEN a.city || ', ' || a.state ELSE NULL END,
    a.email, a.phone
  FROM accounts a
  LEFT JOIN agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
    AND awm.user_id = v_user_id AND awm.status = 'active'
  WHERE a.deleted_at IS NULL
    AND (a.agency_workspace_id IS NULL OR awm.id IS NOT NULL)
    AND (a.name ILIKE v_search_pattern OR a.email ILIKE v_search_pattern OR a.phone ILIKE v_search_pattern
      OR a.goes_by ILIKE v_search_pattern
      OR EXISTS (SELECT 1 FROM account_aliases al WHERE al.account_id = a.id AND al.alias ILIKE v_search_pattern))

  UNION ALL

  SELECT 'contact'::TEXT, c.id,
    COALESCE(NULLIF(trim(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), ''), 'Unnamed Contact'),
    NULL, c.email_primary, COALESCE(c.phone_mobile, c.phone_home, c.phone_work)
  FROM contacts c
  INNER JOIN accounts a ON a.id = c.account_id
  LEFT JOIN agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
    AND awm.user_id = v_user_id AND awm.status = 'active'
  WHERE c.deleted_at IS NULL
    AND (a.agency_workspace_id IS NULL OR awm.id IS NOT NULL)
    AND (c.first_name ILIKE v_search_pattern OR c.last_name ILIKE v_search_pattern
      OR c.email_primary ILIKE v_search_pattern OR c.phone_mobile ILIKE v_search_pattern)

  UNION ALL

  SELECT 'business'::TEXT, b.id, COALESCE(b.legal_name, b.dba, 'Unnamed Business'),
    b.dba, NULL, NULL
  FROM businesses b
  INNER JOIN accounts a ON a.business_id = b.id
  LEFT JOIN agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
    AND awm.user_id = v_user_id AND awm.status = 'active'
  WHERE b.deleted_at IS NULL
    AND (a.agency_workspace_id IS NULL OR awm.id IS NOT NULL)
    AND (b.legal_name ILIKE v_search_pattern OR b.dba ILIKE v_search_pattern)

  UNION ALL

  SELECT 'policy'::TEXT, p.id,
    CASE WHEN p.policy_number IS NOT NULL THEN 'Policy #' || p.policy_number ELSE COALESCE(p.named_insured, 'Unnamed Policy') END,
    COALESCE(car.name, 'Unknown Carrier') || ' - ' || COALESCE(p.line_of_business, 'Unknown Line'),
    NULL, NULL
  FROM policies p
  LEFT JOIN carriers car ON car.id = p.carrier_id
  INNER JOIN accounts a ON a.id = p.account_id
  LEFT JOIN agency_workspace_memberships awm ON awm.agency_workspace_id = a.agency_workspace_id
    AND awm.user_id = v_user_id AND awm.status = 'active'
  WHERE p.deleted_at IS NULL
    AND (a.agency_workspace_id IS NULL OR awm.id IS NOT NULL)
    AND (p.policy_number ILIKE v_search_pattern OR p.named_insured ILIKE v_search_pattern
      OR p.line_of_business ILIKE v_search_pattern OR car.name ILIKE v_search_pattern)

  LIMIT p_limit;
END;
$function$;
*/
-- >>> DOWN END
