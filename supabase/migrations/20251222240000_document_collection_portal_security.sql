-- ============================================================================
-- DOCUMENT COLLECTION PORTAL SECURITY ENHANCEMENTS
-- Adds allowed_actions, improves token security, and portal branding defaults
-- ============================================================================

-- ============================================================================
-- 1. ENHANCE COLLECTION_ACCESS_TOKENS
-- ============================================================================

ALTER TABLE public.collection_access_tokens
  ADD COLUMN IF NOT EXISTS allowed_actions JSONB DEFAULT '{"upload": true, "view_status": true}'::JSONB,
  ADD COLUMN IF NOT EXISTS client_name TEXT, -- Client name to display in portal
  ADD COLUMN IF NOT EXISTS custom_message TEXT; -- Custom message from agent

COMMENT ON COLUMN public.collection_access_tokens.allowed_actions IS 
  'Scoped actions: {"upload": true, "view_status": true, "delete": false}';

-- ============================================================================
-- 2. ADD TOKEN AUDIT TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.collection_token_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID REFERENCES collection_access_tokens(id) ON DELETE CASCADE,
  
  action TEXT NOT NULL CHECK (action IN ('created', 'used', 'revoked', 'expired_access_attempt')),
  ip_address INET,
  user_agent TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_audit_token ON collection_token_audit(token_id);
CREATE INDEX IF NOT EXISTS idx_token_audit_action ON collection_token_audit(action);

-- ============================================================================
-- 3. ENHANCED TOKEN VALIDATION FUNCTION
-- Returns full token metadata for security checks
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_portal_token(
  p_token TEXT,
  p_ip INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token_hash TEXT;
  v_token_record RECORD;
  v_result JSONB;
BEGIN
  -- Hash the provided token
  v_token_hash := encode(sha256(p_token::bytea), 'hex');
  
  -- Find the token record
  SELECT * INTO v_token_record
  FROM collection_access_tokens
  WHERE token_hash = v_token_hash;
  
  -- Token not found
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'TOKEN_NOT_FOUND'
    );
  END IF;
  
  -- Token is revoked
  IF v_token_record.is_revoked = TRUE THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'TOKEN_REVOKED'
    );
  END IF;
  
  -- Token is expired
  IF v_token_record.expires_at < NOW() THEN
    -- Log expired access attempt
    INSERT INTO collection_token_audit (token_id, action, ip_address, user_agent)
    VALUES (v_token_record.id, 'expired_access_attempt', p_ip, p_user_agent);
    
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'TOKEN_EXPIRED'
    );
  END IF;
  
  -- Token has exceeded max uses
  IF v_token_record.max_uses IS NOT NULL AND v_token_record.use_count >= v_token_record.max_uses THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'TOKEN_MAX_USES_EXCEEDED'
    );
  END IF;
  
  -- Token is valid - update usage stats
  UPDATE collection_access_tokens
  SET use_count = use_count + 1,
      last_accessed_at = NOW(),
      last_accessed_ip = p_ip
  WHERE id = v_token_record.id;
  
  -- Log successful use
  INSERT INTO collection_token_audit (token_id, action, ip_address, user_agent)
  VALUES (v_token_record.id, 'used', p_ip, p_user_agent);
  
  -- Return valid token metadata
  RETURN jsonb_build_object(
    'valid', true,
    'token_id', v_token_record.id,
    'workspace_id', v_token_record.workspace_id,
    'account_id', v_token_record.account_id,
    'allowed_actions', COALESCE(v_token_record.allowed_actions, '{"upload": true, "view_status": true}'::JSONB),
    'recipient_email', v_token_record.recipient_email,
    'recipient_name', v_token_record.recipient_name,
    'client_name', v_token_record.client_name,
    'custom_message', v_token_record.custom_message,
    'expires_at', v_token_record.expires_at
  );
END;
$$;

-- ============================================================================
-- 4. PORTAL-SAFE PACKET DATA FUNCTION
-- Returns only client-safe data (no internal notes, OCR, etc.)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_portal_packet_data(
  p_workspace_id UUID,
  p_token_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace RECORD;
  v_requirements JSONB;
  v_branding JSONB;
  v_token RECORD;
BEGIN
  -- Get workspace (packet) basic info
  SELECT 
    w.id,
    w.name,
    w.description,
    w.status,
    w.account_id,
    a.name as account_name
  INTO v_workspace
  FROM workspaces w
  LEFT JOIN accounts a ON a.id = w.account_id
  WHERE w.id = p_workspace_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'PACKET_NOT_FOUND');
  END IF;
  
  -- Get token custom message if provided
  IF p_token_id IS NOT NULL THEN
    SELECT * INTO v_token
    FROM collection_access_tokens
    WHERE id = p_token_id;
  END IF;
  
  -- Get requirements with CLIENT-SAFE upload info only
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'doc_type', r.doc_type,
      'label', r.label,
      'instructions', r.instructions,
      'is_required', r.is_required,
      'min_quantity', r.min_quantity,
      'max_quantity', r.max_quantity,
      'accepted_file_types', r.accepted_file_types,
      'max_file_size_mb', r.max_file_size_mb,
      'display_order', r.display_order,
      -- Client-safe status mapping
      'status', CASE r.status
        WHEN 'not_requested' THEN 'not_needed'
        WHEN 'requested' THEN 'upload_needed'
        WHEN 'uploaded' THEN 'under_review'
        WHEN 'processing' THEN 'processing'
        WHEN 'needs_review' THEN 'under_review'
        WHEN 'accepted' THEN 'received'
        WHEN 'rejected' THEN 'needs_replacement'
        WHEN 'expired' THEN 'expired'
        ELSE r.status
      END,
      -- Only show rejection reason and client feedback, not internal notes
      'rejection_reason', CASE 
        WHEN r.status = 'rejected' THEN (
          SELECT cu.rejection_reason 
          FROM collection_uploads cu 
          WHERE cu.requirement_id = r.id 
          AND cu.review_status = 'rejected'
          ORDER BY cu.created_at DESC 
          LIMIT 1
        )
        ELSE NULL
      END,
      'client_feedback', CASE 
        WHEN r.status = 'rejected' THEN (
          SELECT cu.client_feedback 
          FROM collection_uploads cu 
          WHERE cu.requirement_id = r.id 
          AND cu.review_status IN ('rejected', 'needs_changes')
          ORDER BY cu.created_at DESC 
          LIMIT 1
        )
        ELSE NULL
      END,
      -- Upload count (not file details for security)
      'files_received', (
        SELECT COUNT(*)::INT 
        FROM collection_uploads cu 
        WHERE cu.requirement_id = r.id
      ),
      -- Client-safe upload list (no internal paths or extraction data)
      'uploads', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', cu.id,
            'filename', cu.filename,
            'uploaded_at', cu.created_at,
            'status', CASE cu.review_status
              WHEN 'pending' THEN 'under_review'
              WHEN 'in_review' THEN 'under_review'
              WHEN 'accepted' THEN 'received'
              WHEN 'rejected' THEN 'needs_replacement'
              WHEN 'needs_changes' THEN 'needs_replacement'
              ELSE cu.review_status
            END
          ) ORDER BY cu.created_at DESC
        )
        FROM collection_uploads cu
        WHERE cu.requirement_id = r.id
      )
    ) ORDER BY r.display_order, r.created_at
  ) INTO v_requirements
  FROM collection_requirements r
  WHERE r.workspace_id = p_workspace_id;
  
  -- Get portal branding
  SELECT jsonb_build_object(
    'agency_name', COALESCE(pb.agency_name, 'Lewis Insurance'),
    'logo_url', pb.logo_url,
    'primary_color', COALESCE(pb.primary_color, '#1e40af'),
    'accent_color', pb.accent_color,
    'contact_phone', COALESCE(pb.contact_phone, '(386) 755-0050'),
    'contact_email', pb.contact_email,
    'footer_text', pb.footer_text
  ) INTO v_branding
  FROM portal_branding pb
  WHERE pb.account_id = v_workspace.account_id
    AND pb.is_default = TRUE;
  
  -- Default branding if none found
  IF v_branding IS NULL THEN
    v_branding := jsonb_build_object(
      'agency_name', 'Lewis Insurance',
      'primary_color', '#1e40af',
      'contact_phone', '(386) 755-0050'
    );
  END IF;
  
  -- Build final response
  RETURN jsonb_build_object(
    'packet', jsonb_build_object(
      'id', v_workspace.id,
      'title', v_workspace.name,
      'description', COALESCE(v_token.custom_message, v_workspace.description),
      'client_name', v_token.client_name,
      'account_name', v_workspace.account_name
    ),
    'requirements', COALESCE(v_requirements, '[]'::JSONB),
    'branding', v_branding,
    'progress', (
      SELECT jsonb_build_object(
        'total', COUNT(*)::INT,
        'required', COUNT(*) FILTER (WHERE is_required)::INT,
        'completed', COUNT(*) FILTER (WHERE status = 'accepted')::INT,
        'all_required_complete', NOT EXISTS (
          SELECT 1 FROM collection_requirements cr
          WHERE cr.workspace_id = p_workspace_id
            AND cr.is_required = TRUE
            AND cr.status NOT IN ('accepted')
        )
      )
      FROM collection_requirements
      WHERE workspace_id = p_workspace_id
    )
  );
END;
$$;

-- ============================================================================
-- 5. RLS AND GRANTS
-- ============================================================================

ALTER TABLE collection_token_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_view_token_audit" ON collection_token_audit;
CREATE POLICY "authenticated_view_token_audit" ON collection_token_audit
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "system_insert_token_audit" ON collection_token_audit;
CREATE POLICY "system_insert_token_audit" ON collection_token_audit
  FOR INSERT WITH CHECK (TRUE);

GRANT SELECT, INSERT ON collection_token_audit TO authenticated;
GRANT EXECUTE ON FUNCTION validate_portal_token TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_portal_packet_data TO anon, authenticated;

-- ============================================================================
-- 6. DEFAULT PORTAL BRANDING (if not exists)
-- ============================================================================

-- Create portal_branding table if it doesn't exist (from existing migration)
CREATE TABLE IF NOT EXISTS public.portal_branding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  
  agency_name TEXT DEFAULT 'Lewis Insurance',
  logo_url TEXT,
  primary_color TEXT DEFAULT '#1e40af',
  accent_color TEXT,
  
  contact_phone TEXT,
  contact_email TEXT,
  footer_text TEXT,
  
  is_default BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_branding_account ON portal_branding(account_id);

ALTER TABLE portal_branding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_manage_portal_branding" ON portal_branding;
CREATE POLICY "authenticated_manage_portal_branding" ON portal_branding
  FOR ALL USING (auth.uid() IS NOT NULL);

GRANT ALL ON portal_branding TO authenticated;

