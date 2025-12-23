-- ============================================================
-- Workspace Entity Linking Migration
-- Adds FK relationships to accounts, leads, and policies
-- ============================================================

-- Add entity linking columns to workspaces table
ALTER TABLE public.workspaces
ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS policy_id UUID REFERENCES public.policies(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS linked_entity_type TEXT CHECK (linked_entity_type IN ('account', 'lead', 'policy'));

-- Create indexes for efficient filtering
CREATE INDEX IF NOT EXISTS idx_workspaces_account ON public.workspaces(account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workspaces_lead ON public.workspaces(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workspaces_policy ON public.workspaces(policy_id) WHERE policy_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workspaces_entity_type ON public.workspaces(linked_entity_type);

-- Function to auto-set linked_entity_type based on which FK is set
CREATE OR REPLACE FUNCTION set_workspace_entity_type()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.policy_id IS NOT NULL THEN
    NEW.linked_entity_type := 'policy';
  ELSIF NEW.lead_id IS NOT NULL THEN
    NEW.linked_entity_type := 'lead';
  ELSIF NEW.account_id IS NOT NULL THEN
    NEW.linked_entity_type := 'account';
  ELSE
    NEW.linked_entity_type := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists, then create
DROP TRIGGER IF EXISTS trigger_set_workspace_entity_type ON public.workspaces;
CREATE TRIGGER trigger_set_workspace_entity_type
BEFORE INSERT OR UPDATE ON public.workspaces
FOR EACH ROW
EXECUTE FUNCTION set_workspace_entity_type();

-- ============================================================
-- View: Workspaces with Entity Details (JOINed data)
-- ============================================================
DROP VIEW IF EXISTS public.workspaces_with_entities;
CREATE VIEW public.workspaces_with_entities AS
SELECT 
  w.id,
  w.name,
  w.description,
  w.task_type,
  w.status,
  w.notes,
  w.analysis_output,
  w.created_by,
  w.created_at,
  w.updated_at,
  w.client_name,
  -- Entity FKs
  w.account_id,
  w.lead_id,
  w.policy_id,
  w.linked_entity_type,
  -- Account details
  a.name AS account_name,
  a.email AS account_email,
  a.type AS account_type,
  -- Lead details
  CONCAT(l.first_name, ' ', l.last_name) AS lead_name,
  l.email AS lead_email,
  l.status AS lead_status,
  -- Policy details
  p.policy_number,
  c.name AS carrier_name,
  p.line_of_business AS policy_lob,
  p.status AS policy_status,
  p.effective_date,
  p.expiration_date,
  -- Creator details
  pr.full_name AS creator_name,
  pr.email AS creator_email
FROM public.workspaces w
LEFT JOIN public.accounts a ON w.account_id = a.id
LEFT JOIN public.leads l ON w.lead_id = l.id
LEFT JOIN public.policies p ON w.policy_id = p.id
LEFT JOIN public.carriers c ON p.carrier_id = c.id
LEFT JOIN public.profiles pr ON w.created_by = pr.id;

-- Grant access to authenticated users
GRANT SELECT ON public.workspaces_with_entities TO authenticated;

-- ============================================================
-- RLS Policies for workspaces (if not already set up properly)
-- ============================================================
-- Note: RLS should already be enabled on workspaces table
-- Adding policy to allow users to see workspaces they created or are linked to their accounts

-- Drop existing policy if it exists (to recreate with updated logic)
DROP POLICY IF EXISTS "Users can view own or linked workspaces" ON public.workspaces;

-- Create policy allowing users to view their own workspaces 
-- (account membership check can be added if account_memberships table exists)
CREATE POLICY "Users can view own or linked workspaces"
  ON public.workspaces FOR SELECT
  USING (created_by = auth.uid());

-- Ensure users can update their own workspaces
DROP POLICY IF EXISTS "Users can update own workspaces" ON public.workspaces;
CREATE POLICY "Users can update own workspaces"
  ON public.workspaces FOR UPDATE
  USING (created_by = auth.uid());

-- Ensure users can delete their own workspaces
DROP POLICY IF EXISTS "Users can delete own workspaces" ON public.workspaces;
CREATE POLICY "Users can delete own workspaces"
  ON public.workspaces FOR DELETE
  USING (created_by = auth.uid());
