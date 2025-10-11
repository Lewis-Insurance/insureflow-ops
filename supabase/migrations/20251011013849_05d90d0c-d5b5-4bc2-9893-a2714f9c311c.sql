-- Create COI templates table
CREATE TABLE IF NOT EXISTS public.coi_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  coverage_defaults jsonb NOT NULL DEFAULT '{}'::jsonb,
  special_provisions_template text,
  created_by uuid REFERENCES auth.users(id),
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create COI audit log table
CREATE TABLE IF NOT EXISTS public.coi_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coi_id uuid REFERENCES public.certificates_of_insurance(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('generated', 'downloaded', 'emailed', 'previewed', 'revised', 'cancelled')),
  user_id uuid REFERENCES auth.users(id),
  metadata jsonb DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.coi_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coi_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS policies for templates
CREATE POLICY "Staff can manage COI templates"
  ON public.coi_templates
  FOR ALL
  USING (is_staff());

CREATE POLICY "Users can view active templates"
  ON public.coi_templates
  FOR SELECT
  USING (is_active = true);

-- RLS policies for audit log
CREATE POLICY "Staff can view audit logs"
  ON public.coi_audit_log
  FOR SELECT
  USING (is_staff());

CREATE POLICY "System can insert audit logs"
  ON public.coi_audit_log
  FOR INSERT
  WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_coi_audit_log_coi_id ON public.coi_audit_log(coi_id);
CREATE INDEX IF NOT EXISTS idx_coi_audit_log_user_id ON public.coi_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_coi_audit_log_created_at ON public.coi_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coi_templates_is_default ON public.coi_templates(is_default) WHERE is_default = true;

-- Trigger for updated_at
CREATE TRIGGER update_coi_templates_updated_at
  BEFORE UPDATE ON public.coi_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();