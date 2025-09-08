-- Add tags and sources to accounts and contacts
CREATE TABLE public.account_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  tag_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(account_id, tag_name)
);

CREATE TABLE public.contact_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(contact_id, tag_name)
);

-- Add source tracking
ALTER TABLE public.accounts ADD COLUMN source TEXT;
ALTER TABLE public.contacts ADD COLUMN source TEXT;

-- Create saved views table
CREATE TABLE public.saved_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  filters JSONB NOT NULL DEFAULT '{}',
  view_type TEXT NOT NULL DEFAULT 'accounts', -- accounts, contacts, policies, etc
  created_by UUID NOT NULL REFERENCES auth.users(id),
  organization_shared BOOLEAN NOT NULL DEFAULT false,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create bulk actions tracking
CREATE TABLE public.bulk_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action_type TEXT NOT NULL, -- assign_owner, add_tags, create_tasks, etc
  entity_type TEXT NOT NULL, -- accounts, contacts, etc
  entity_ids UUID[] NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, completed, failed
  progress INTEGER DEFAULT 0, -- 0-100
  total_count INTEGER NOT NULL,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]',
  created_by UUID NOT NULL REFERENCES auth.users(id),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.account_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_actions ENABLE ROW LEVEL SECURITY;

-- RLS policies for tags
CREATE POLICY "Staff can manage account tags" ON public.account_tags
FOR ALL USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can manage contact tags" ON public.contact_tags
FOR ALL USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

-- RLS policies for saved views
CREATE POLICY "Users can manage their own saved views" ON public.saved_views
FOR ALL USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

CREATE POLICY "Staff can view organization shared views" ON public.saved_views
FOR SELECT USING (organization_shared = true AND is_staff(auth.uid()));

CREATE POLICY "Admin can manage all saved views" ON public.saved_views
FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- RLS policies for bulk actions
CREATE POLICY "Users can view their own bulk actions" ON public.bulk_actions
FOR SELECT USING (created_by = auth.uid());

CREATE POLICY "Staff can create bulk actions" ON public.bulk_actions
FOR INSERT WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can update their own bulk actions" ON public.bulk_actions
FOR UPDATE USING (created_by = auth.uid() AND is_staff(auth.uid()));

-- Add indexes for performance
CREATE INDEX idx_account_tags_account_id ON public.account_tags(account_id);
CREATE INDEX idx_account_tags_tag_name ON public.account_tags(tag_name);
CREATE INDEX idx_contact_tags_contact_id ON public.contact_tags(contact_id);
CREATE INDEX idx_contact_tags_tag_name ON public.contact_tags(tag_name);
CREATE INDEX idx_saved_views_created_by ON public.saved_views(created_by);
CREATE INDEX idx_saved_views_organization_shared ON public.saved_views(organization_shared);
CREATE INDEX idx_bulk_actions_created_by ON public.bulk_actions(created_by);
CREATE INDEX idx_bulk_actions_status ON public.bulk_actions(status);

-- Add trigger for updated_at
CREATE TRIGGER update_saved_views_updated_at
BEFORE UPDATE ON public.saved_views
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Add common source values as check constraint suggestions (optional)
COMMENT ON COLUMN public.accounts.source IS 'Common values: web_form, referral, walk_in, phone_call, email, marketing_campaign, existing_client';
COMMENT ON COLUMN public.contacts.source IS 'Common values: primary_account, referral, walk_in, phone_call, email, existing_contact';