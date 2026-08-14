-- Security audit: harden rollback_import_batch, enqueue_outbox_event, cancel_outbox_events

-- ============================================================================
-- rollback_import_batch: staff + workspace membership guards
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rollback_import_batch(p_batch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_accounts_deleted INTEGER := 0;
  v_contacts_deleted INTEGER := 0;
  v_policies_deleted INTEGER := 0;
  v_workspace_id UUID;
  v_batch_exists BOOLEAN;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Staff access required' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM import_batches WHERE id = p_batch_id
  ) INTO v_batch_exists;

  IF NOT v_batch_exists THEN
    RAISE EXCEPTION 'Import batch not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT workspace_id
  INTO v_workspace_id
  FROM (
    SELECT a.agency_workspace_id AS workspace_id
    FROM accounts a
    WHERE a.import_batch_id = p_batch_id
      AND a.deleted_at IS NULL

    UNION

    SELECT a.agency_workspace_id
    FROM contacts c
    JOIN accounts a ON a.id = c.account_id
    WHERE c.import_batch_id = p_batch_id
      AND c.deleted_at IS NULL
      AND a.deleted_at IS NULL

    UNION

    SELECT a.agency_workspace_id
    FROM policies p
    JOIN accounts a ON a.id = p.account_id
    WHERE p.import_batch_id = p_batch_id
      AND p.deleted_at IS NULL
      AND a.deleted_at IS NULL
  ) batch_workspaces
  WHERE workspace_id IS NOT NULL
  LIMIT 1;

  IF v_workspace_id IS NOT NULL AND NOT public.is_agency_member(v_workspace_id) THEN
    RAISE EXCEPTION 'Forbidden - workspace membership required' USING ERRCODE = '42501';
  END IF;

  IF v_workspace_id IS NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM import_batches
      WHERE id = p_batch_id
        AND imported_by = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Forbidden - staging-only batch access denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Soft delete accounts from this batch
  UPDATE accounts
  SET deleted_at = now()
  WHERE import_batch_id = p_batch_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_accounts_deleted = ROW_COUNT;

  -- Soft delete contacts from this batch
  UPDATE contacts
  SET deleted_at = now()
  WHERE import_batch_id = p_batch_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_contacts_deleted = ROW_COUNT;

  -- Soft delete policies from this batch
  UPDATE policies
  SET deleted_at = now()
  WHERE import_batch_id = p_batch_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_policies_deleted = ROW_COUNT;

  -- Update batch status
  UPDATE import_batches
  SET status = 'rolled_back'
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'batch_id', p_batch_id,
    'accounts_deleted', v_accounts_deleted,
    'contacts_deleted', v_contacts_deleted,
    'policies_deleted', v_policies_deleted,
    'rolled_back_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rollback_import_batch(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rollback_import_batch(UUID) TO authenticated, service_role;

-- ============================================================================
-- enqueue_outbox_event: service_role or agency member; trigger-only execute
-- ============================================================================

CREATE OR REPLACE FUNCTION enqueue_outbox_event(
    p_workspace_id UUID,
    p_event_type TEXT,
    p_entity_type TEXT,
    p_entity_id UUID,
    p_payload JSONB DEFAULT '{}',
    p_idempotency_key TEXT DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
    v_idempotency_key TEXT;
    v_event_id BIGINT;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role'
       AND NOT (public.is_agency_member(p_workspace_id) OR public.is_staff()) THEN
        RAISE EXCEPTION 'Forbidden - workspace membership required' USING ERRCODE = '42501';
    END IF;

    -- Generate idempotency key if not provided
    v_idempotency_key := COALESCE(
        p_idempotency_key,
        p_event_type || ':' || p_entity_type || ':' || p_entity_id || ':' ||
        TO_CHAR(NOW(), 'YYYY-MM-DD-HH24')  -- Hour-level dedup by default
    );

    -- Insert with conflict handling (idempotent)
    INSERT INTO automation_event_outbox (
        agency_workspace_id,
        event_type,
        entity_type,
        entity_id,
        payload,
        idempotency_key
    ) VALUES (
        p_workspace_id,
        p_event_type,
        p_entity_type,
        p_entity_id,
        p_payload,
        v_idempotency_key
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_event_id;

    RETURN v_event_id;  -- NULL if duplicate
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION enqueue_outbox_event(UUID, TEXT, TEXT, UUID, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION enqueue_outbox_event(UUID, TEXT, TEXT, UUID, JSONB, TEXT) TO service_role;

-- ============================================================================
-- cancel_outbox_events: block global cancel for non-service_role; admin for workspace
-- ============================================================================

CREATE OR REPLACE FUNCTION cancel_outbox_events(
    p_workspace_id UUID DEFAULT NULL,
    p_event_type TEXT DEFAULT NULL,
    p_reason TEXT DEFAULT 'Manual cancellation'
) RETURNS INT AS $$
DECLARE
    v_count INT;
BEGIN
    IF p_workspace_id IS NULL AND auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Forbidden - global outbox cancellation requires service role' USING ERRCODE = '42501';
    END IF;

    IF p_workspace_id IS NOT NULL AND auth.role() IS DISTINCT FROM 'service_role' THEN
        IF NOT public.is_staff() OR NOT public.is_agency_admin(p_workspace_id) THEN
            RAISE EXCEPTION 'Forbidden - agency admin access required' USING ERRCODE = '42501';
        END IF;
    END IF;

    UPDATE automation_event_outbox
    SET
        status = 'cancelled',
        cancelled_at = NOW(),
        cancelled_by = auth.uid(),
        cancel_reason = p_reason
    WHERE status IN ('pending', 'failed')
      AND (p_workspace_id IS NULL OR agency_workspace_id = p_workspace_id)
      AND (p_event_type IS NULL OR event_type = p_event_type);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION cancel_outbox_events(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancel_outbox_events(UUID, TEXT, TEXT) TO authenticated, service_role;
