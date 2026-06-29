-- Safety net: never let an account be created without an agency_workspace_id.
-- The accounts RLS INSERT policy permits staff to insert a row with a null
-- workspace, which orphans the account and breaks workspace-scoped features
-- (payments, etc.). This BEFORE INSERT trigger stamps the creating user's
-- workspace when the caller did not provide one. It only acts when the value
-- is null, so explicit inserts (migrations, imports, cross-workspace) are
-- untouched, and service-role inserts where auth.uid() is null are left as-is.
CREATE OR REPLACE FUNCTION public.ensure_account_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.agency_workspace_id IS NULL THEN
    NEW.agency_workspace_id := COALESCE(
      (SELECT p.default_agency_workspace_id FROM public.profiles p WHERE p.id = auth.uid()),
      public.get_user_org_id()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_ensure_account_workspace ON public.accounts;
CREATE TRIGGER tr_ensure_account_workspace
  BEFORE INSERT ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.ensure_account_workspace();
