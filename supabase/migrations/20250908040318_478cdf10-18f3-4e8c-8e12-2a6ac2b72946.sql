-- Add de-duplication and merge tracking
CREATE TABLE public.duplicate_detection_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL, -- 'account' or 'contact'
  rule_name TEXT NOT NULL,
  match_fields JSONB NOT NULL, -- fields to match on (email, phone, name+address, etc)
  threshold DECIMAL DEFAULT 0.8, -- similarity threshold
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.duplicate_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_ids UUID[] NOT NULL,
  match_score DECIMAL NOT NULL,
  rule_id UUID REFERENCES duplicate_detection_rules(id),
  status TEXT DEFAULT 'pending', -- pending, reviewed, merged, dismissed
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.merge_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL,
  survivor_id UUID NOT NULL, -- the record that remains
  merged_ids UUID[] NOT NULL, -- records that were merged
  merge_data JSONB NOT NULL, -- what data was merged from each record
  merged_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- CSV Import staging and tracking
CREATE TABLE public.import_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  import_type TEXT NOT NULL, -- 'accounts', 'contacts', etc
  filename TEXT NOT NULL,
  total_rows INTEGER NOT NULL,
  processed_rows INTEGER DEFAULT 0,
  successful_rows INTEGER DEFAULT 0,
  error_rows INTEGER DEFAULT 0,
  status TEXT DEFAULT 'staging', -- staging, processing, completed, failed
  field_mapping JSONB, -- CSV column to DB field mapping
  validation_errors JSONB DEFAULT '[]',
  imported_by UUID NOT NULL REFERENCES auth.users(id),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.import_staging (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  raw_data JSONB NOT NULL, -- original CSV row data
  mapped_data JSONB, -- data after field mapping
  validation_status TEXT DEFAULT 'pending', -- pending, valid, invalid
  validation_errors JSONB DEFAULT '[]',
  entity_id UUID, -- set after successful import
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enhanced consent tracking with evidence
CREATE TABLE public.consent_evidence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL, -- 'sms', 'voice', 'email', 'data_processing'
  method TEXT NOT NULL, -- 'verbal', 'written', 'web_form', 'sms_keyword', 'api'
  status TEXT NOT NULL, -- 'granted', 'revoked'
  evidence_ref TEXT, -- reference to recording, form submission, etc
  ip_address INET,
  user_agent TEXT,
  location_data JSONB, -- geolocation if available
  notes TEXT,
  granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enhanced audit logging with detailed change tracking
CREATE TABLE public.detailed_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL, -- CREATE, UPDATE, DELETE, MERGE, etc
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT, -- stored for historical reference
  session_id TEXT,
  ip_address INET,
  user_agent TEXT,
  changed_fields JSONB, -- field-by-field changes with before/after values
  metadata JSONB, -- additional context (import batch, merge operation, etc)
  occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.duplicate_detection_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duplicate_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merge_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detailed_audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Staff can manage duplicate detection" ON public.duplicate_detection_rules
FOR ALL USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can view duplicate groups" ON public.duplicate_groups
FOR ALL USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can view merge history" ON public.merge_history
FOR SELECT USING (is_staff(auth.uid()));

CREATE POLICY "Staff can manage imports" ON public.import_batches
FOR ALL USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can view import staging" ON public.import_staging
FOR ALL USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can manage consent evidence" ON public.consent_evidence
FOR ALL USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can view audit logs" ON public.detailed_audit_logs
FOR SELECT USING (is_staff(auth.uid()));

-- Indexes for performance
CREATE INDEX idx_duplicate_groups_entity_type ON public.duplicate_groups(entity_type);
CREATE INDEX idx_duplicate_groups_status ON public.duplicate_groups(status);
CREATE INDEX idx_import_batches_status ON public.import_batches(status);
CREATE INDEX idx_import_staging_batch_id ON public.import_staging(batch_id);
CREATE INDEX idx_consent_evidence_contact_id ON public.consent_evidence(contact_id);
CREATE INDEX idx_consent_evidence_type ON public.consent_evidence(consent_type);
CREATE INDEX idx_detailed_audit_logs_entity ON public.detailed_audit_logs(entity_type, entity_id);
CREATE INDEX idx_detailed_audit_logs_occurred_at ON public.detailed_audit_logs(occurred_at);

-- Trigger for updated_at
CREATE TRIGGER update_duplicate_detection_rules_updated_at
BEFORE UPDATE ON public.duplicate_detection_rules
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Function to create detailed audit log entries
CREATE OR REPLACE FUNCTION public.create_detailed_audit_log(
  p_entity_type TEXT,
  p_entity_id UUID,
  p_action TEXT,
  p_changed_fields JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  audit_id UUID;
  current_user_id UUID;
  current_user_name TEXT;
BEGIN
  -- Get current user info
  current_user_id := auth.uid();
  
  SELECT full_name INTO current_user_name 
  FROM profiles 
  WHERE id = current_user_id;
  
  INSERT INTO detailed_audit_logs (
    entity_type,
    entity_id,
    action,
    user_id,
    user_name,
    changed_fields,
    metadata
  ) VALUES (
    p_entity_type,
    p_entity_id,
    p_action,
    current_user_id,
    COALESCE(current_user_name, 'Unknown User'),
    p_changed_fields,
    p_metadata
  ) RETURNING id INTO audit_id;
  
  RETURN audit_id;
END;
$$;