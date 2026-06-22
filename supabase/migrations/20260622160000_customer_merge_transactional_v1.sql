-- Phase 1 safe customer/account merge foundation
--
-- This migration intentionally treats the app's merge target as public.accounts.
-- The current MergeCustomersPage/useCustomerMerge flow passes account IDs as
-- "customer" IDs. Rows in public.customers are account children and are moved
-- to the survivor account; customer_id references remain valid through that move.

-- -----------------------------------------------------------------------------
-- Minimal supporting schema for auditability and pair review state
-- -----------------------------------------------------------------------------

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_at timestamptz,
  ADD COLUMN IF NOT EXISTS merged_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_accounts_merged_into_id ON public.accounts(merged_into_id);

CREATE TABLE IF NOT EXISTS public.duplicate_pair_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_a_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  customer_b_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'not_duplicate', 'confirmed_duplicate', 'merged', 'review_later')),
  reason text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (customer_a_id < customer_b_id),
  UNIQUE (customer_a_id, customer_b_id)
);

ALTER TABLE public.duplicate_pair_reviews ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'duplicate_pair_reviews'
      AND policyname = 'Staff can manage duplicate pair reviews'
  ) THEN
    CREATE POLICY "Staff can manage duplicate pair reviews"
      ON public.duplicate_pair_reviews
      FOR ALL
      USING (public.is_staff())
      WITH CHECK (public.is_staff());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_duplicate_pair_reviews_status
  ON public.duplicate_pair_reviews(status);
CREATE INDEX IF NOT EXISTS idx_duplicate_pair_reviews_customer_a
  ON public.duplicate_pair_reviews(customer_a_id);
CREATE INDEX IF NOT EXISTS idx_duplicate_pair_reviews_customer_b
  ON public.duplicate_pair_reviews(customer_b_id);

DO $$
BEGIN
  IF to_regclass('public.duplicate_flags') IS NOT NULL THEN
    ALTER TABLE public.duplicate_flags
      ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
      ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id),
      ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
      ADD COLUMN IF NOT EXISTS resolution text;

    CREATE INDEX IF NOT EXISTS idx_duplicate_flags_status
      ON public.duplicate_flags(status);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Helpers used only by the Phase 1 RPCs
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._customer_merge_column_exists(
  p_table_name text,
  p_column_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table_name
      AND column_name = p_column_name
  );
$$;

CREATE OR REPLACE FUNCTION public._customer_merge_table_exists(p_table_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_regclass('public.' || p_table_name) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public._customer_merge_user_can_access_account(p_account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.accounts a
    WHERE a.id = p_account_id
      AND (
        a.agency_workspace_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.agency_workspace_memberships awm
          WHERE awm.agency_workspace_id = a.agency_workspace_id
            AND awm.user_id = auth.uid()
            AND awm.status = 'active'
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public._customer_merge_column_exists(text, text) FROM public;
REVOKE ALL ON FUNCTION public._customer_merge_table_exists(text) FROM public;
REVOKE ALL ON FUNCTION public._customer_merge_user_can_access_account(uuid) FROM public;

-- -----------------------------------------------------------------------------
-- Read-only preview RPC
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.preview_customer_merge_v1(
  p_master_customer_id uuid,
  p_duplicate_customer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_master public.accounts%ROWTYPE;
  v_duplicate public.accounts%ROWTYPE;
  v_warnings jsonb := '[]'::jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_transferable jsonb := '[]'::jsonb;
  v_scalar_conflicts jsonb := '[]'::jsonb;
  v_confirmation_phrase text;
  v_static jsonb;
  v_spec record;
  v_fk record;
  v_count bigint;
  v_row_blockers jsonb;
  v_supported_keys text[] := ARRAY[
    'customers.account_id',
    'contacts.account_id',
    'policies.account_id',
    'quotes.account_id',
    'documents.account_id',
    'tasks.account_id',
    'communications.account_id',
    'leads.account_id',
    'leads.converted_account_id',
    'renewals.account_id',
    'ao_renewals.account_id',
    'canopy_pulls.account_id',
    'account_tags.account_id',
    'tags.account_id',
    'notes.account_id',
    'call_sessions.account_id',
    'sms_messages.account_id',
    'duplicate_flags.account_id',
    'duplicate_pair_reviews.customer_a_id',
    'duplicate_pair_reviews.customer_b_id'
  ];
  v_field text;
  v_master_value jsonb;
  v_duplicate_value jsonb;
  v_master_text text;
  v_duplicate_text text;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Not authorized to preview customer merges';
  END IF;

  IF p_master_customer_id IS NULL OR p_duplicate_customer_id IS NULL THEN
    v_blockers := v_blockers || jsonb_build_array('Both master and duplicate account IDs are required');
  ELSIF p_master_customer_id = p_duplicate_customer_id THEN
    v_blockers := v_blockers || jsonb_build_array('Cannot merge an account into itself');
  END IF;

  SELECT * INTO v_master
  FROM public.accounts
  WHERE id = p_master_customer_id;

  SELECT * INTO v_duplicate
  FROM public.accounts
  WHERE id = p_duplicate_customer_id;

  IF NOT FOUND OR v_duplicate.id IS NULL THEN
    v_blockers := v_blockers || jsonb_build_array('Duplicate account not found');
  END IF;

  IF v_master.id IS NULL THEN
    v_blockers := v_blockers || jsonb_build_array('Master account not found');
  END IF;

  IF v_master.id IS NOT NULL AND NOT public._customer_merge_user_can_access_account(v_master.id) THEN
    RAISE EXCEPTION 'Not authorized to access master account';
  END IF;

  IF v_duplicate.id IS NOT NULL AND NOT public._customer_merge_user_can_access_account(v_duplicate.id) THEN
    RAISE EXCEPTION 'Not authorized to access duplicate account';
  END IF;

  IF v_master.id IS NOT NULL AND v_duplicate.id IS NOT NULL THEN
    IF (to_jsonb(v_master)->>'org_id') IS NOT NULL
       AND (to_jsonb(v_duplicate)->>'org_id') IS NOT NULL
       AND (to_jsonb(v_master)->>'org_id') IS DISTINCT FROM (to_jsonb(v_duplicate)->>'org_id') THEN
      v_blockers := v_blockers || jsonb_build_array('Master and duplicate belong to different org_id values');
    END IF;

    IF v_master.agency_workspace_id IS DISTINCT FROM v_duplicate.agency_workspace_id THEN
      v_blockers := v_blockers || jsonb_build_array('Master and duplicate belong to different agency workspaces');
    END IF;
  END IF;

  IF v_master.id IS NOT NULL AND v_master.deleted_at IS NOT NULL THEN
    v_blockers := v_blockers || jsonb_build_array('Master account is archived/deleted');
  END IF;

  IF v_duplicate.id IS NOT NULL THEN
    IF v_duplicate.deleted_at IS NOT NULL THEN
      v_blockers := v_blockers || jsonb_build_array('Duplicate account is already archived/deleted');
    END IF;

    IF public._customer_merge_column_exists('accounts', 'merged_into_id') THEN
      IF (to_jsonb(v_duplicate)->>'merged_into_id') IS NOT NULL THEN
        v_blockers := v_blockers || jsonb_build_array('Duplicate account is already marked as merged into another account');
      END IF;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.merge_history mh
    WHERE mh.entity_type IN ('account', 'accounts')
      AND mh.merged_ids @> ARRAY[p_duplicate_customer_id]
  ) THEN
    v_warnings := v_warnings || jsonb_build_array('Duplicate account appears in prior merge history');
  END IF;

  IF v_master.id IS NOT NULL AND v_duplicate.id IS NOT NULL THEN
    FOREACH v_field IN ARRAY ARRAY[
      'name', 'email', 'phone', 'address_line1', 'address_line2', 'city', 'state',
      'zip_code', 'tin_last4', 'source', 'lead_source_detail', 'spouse_name',
      'date_of_birth', 'spouse_date_of_birth', 'phone_secondary', 'primary_entity_name',
      'secondary_entity_name', 'trustee_name'
    ] LOOP
      IF public._customer_merge_column_exists('accounts', v_field) THEN
        v_master_value := to_jsonb(v_master)->v_field;
        v_duplicate_value := to_jsonb(v_duplicate)->v_field;
        v_master_text := NULLIF(btrim(COALESCE(v_master_value #>> '{}', '')), '');
        v_duplicate_text := NULLIF(btrim(COALESCE(v_duplicate_value #>> '{}', '')), '');

        IF v_duplicate_text IS NOT NULL
           AND (v_master_text IS NULL OR v_master_value IS DISTINCT FROM v_duplicate_value) THEN
          v_scalar_conflicts := v_scalar_conflicts || jsonb_build_array(
            jsonb_build_object(
              'field', v_field,
              'masterValue', v_master_value,
              'duplicateValue', v_duplicate_value,
              'phase1Resolution', CASE WHEN v_master_text IS NULL THEN 'fill_master_if_blank' ELSE 'master_wins' END
            )
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  v_static := jsonb_build_array(
    jsonb_build_object('table', 'customers', 'foreignKeyColumn', 'account_id', 'strategy', 'reassign_fk'),
    jsonb_build_object('table', 'contacts', 'foreignKeyColumn', 'account_id', 'strategy', 'reassign_fk'),
    jsonb_build_object('table', 'policies', 'foreignKeyColumn', 'account_id', 'strategy', 'reassign_fk'),
    jsonb_build_object('table', 'quotes', 'foreignKeyColumn', 'account_id', 'strategy', 'reassign_fk'),
    jsonb_build_object('table', 'documents', 'foreignKeyColumn', 'account_id', 'strategy', 'reassign_fk'),
    jsonb_build_object('table', 'tasks', 'foreignKeyColumn', 'account_id', 'strategy', 'reassign_fk'),
    jsonb_build_object('table', 'communications', 'foreignKeyColumn', 'account_id', 'strategy', 'reassign_fk'),
    jsonb_build_object('table', 'leads', 'foreignKeyColumn', 'account_id', 'strategy', 'reassign_fk'),
    jsonb_build_object('table', 'leads', 'foreignKeyColumn', 'converted_account_id', 'strategy', 'reassign_fk'),
    jsonb_build_object('table', 'renewals', 'foreignKeyColumn', 'account_id', 'strategy', 'reassign_fk'),
    jsonb_build_object('table', 'ao_renewals', 'foreignKeyColumn', 'account_id', 'strategy', 'reassign_fk'),
    jsonb_build_object('table', 'canopy_pulls', 'foreignKeyColumn', 'account_id', 'strategy', 'reassign_fk'),
    jsonb_build_object('table', 'account_tags', 'foreignKeyColumn', 'account_id', 'strategy', 'dedupe_then_reassign'),
    jsonb_build_object('table', 'tags', 'foreignKeyColumn', 'account_id', 'strategy', 'dedupe_then_reassign'),
    jsonb_build_object('table', 'notes', 'foreignKeyColumn', 'account_id', 'strategy', 'reassign_fk'),
    jsonb_build_object('table', 'call_sessions', 'foreignKeyColumn', 'account_id', 'strategy', 'reassign_fk'),
    jsonb_build_object('table', 'sms_messages', 'foreignKeyColumn', 'account_id', 'strategy', 'reassign_fk'),
    jsonb_build_object('table', 'duplicate_flags', 'foreignKeyColumn', 'account_id', 'strategy', 'append_history_only')
  );

  FOR v_spec IN
    SELECT *
    FROM jsonb_to_recordset(v_static) AS x("table" text, "foreignKeyColumn" text, strategy text)
  LOOP
    IF public._customer_merge_column_exists(v_spec."table", v_spec."foreignKeyColumn") THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', v_spec."table", v_spec."foreignKeyColumn")
      INTO v_count
      USING p_duplicate_customer_id;

      v_transferable := v_transferable || jsonb_build_array(
        jsonb_build_object(
          'table', v_spec."table",
          'foreignKeyColumn', v_spec."foreignKeyColumn",
          'count', v_count,
          'strategy', v_spec.strategy,
          'blockers', '[]'::jsonb
        )
      );
    END IF;
  END LOOP;

  IF public._customer_merge_table_exists('duplicate_groups') THEN
    SELECT count(*) INTO v_count
    FROM public.duplicate_groups dg
    WHERE dg.entity_type IN ('account', 'accounts')
      AND dg.entity_ids @> ARRAY[p_master_customer_id, p_duplicate_customer_id];

    v_transferable := v_transferable || jsonb_build_array(
      jsonb_build_object(
        'table', 'duplicate_groups',
        'foreignKeyColumn', 'entity_ids',
        'count', v_count,
        'strategy', 'append_history_only',
        'blockers', '[]'::jsonb
      )
    );
  END IF;

  IF public._customer_merge_table_exists('duplicate_pair_reviews') THEN
    SELECT count(*) INTO v_count
    FROM public.duplicate_pair_reviews dpr
    WHERE dpr.customer_a_id = LEAST(p_master_customer_id, p_duplicate_customer_id)
      AND dpr.customer_b_id = GREATEST(p_master_customer_id, p_duplicate_customer_id);

    v_transferable := v_transferable || jsonb_build_array(
      jsonb_build_object(
        'table', 'duplicate_pair_reviews',
        'foreignKeyColumn', 'customer_a_id/customer_b_id',
        'count', v_count,
        'strategy', 'append_history_only',
        'blockers', '[]'::jsonb
      )
    );
  END IF;

  -- Authoritative live-schema inventory: any account/customer FK not explicitly
  -- handled above is surfaced. Account-linked rows block execution; customer_id
  -- rows are preserved because public.customers rows move to the master account.
  FOR v_fk IN
    SELECT DISTINCT
      kcu.table_name,
      kcu.column_name,
      ccu.table_name AS referenced_table
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_schema = 'public'
      AND ccu.table_name IN ('accounts', 'customers')
  LOOP
    IF array_position(v_supported_keys, v_fk.table_name || '.' || v_fk.column_name) IS NOT NULL THEN
      CONTINUE;
    END IF;

    IF v_fk.referenced_table = 'accounts' THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', v_fk.table_name, v_fk.column_name)
      INTO v_count
      USING p_duplicate_customer_id;

      v_row_blockers := '[]'::jsonb;
      IF v_count > 0 THEN
        v_row_blockers := v_row_blockers || jsonb_build_array('Phase 1 RPC does not transfer this account foreign key; manual review required before merge');
        v_blockers := v_blockers || jsonb_build_array(format('%s.%s has %s duplicate-linked row(s) outside Phase 1 transfer coverage', v_fk.table_name, v_fk.column_name, v_count));
      END IF;

      v_transferable := v_transferable || jsonb_build_array(
        jsonb_build_object(
          'table', v_fk.table_name,
          'foreignKeyColumn', v_fk.column_name,
          'count', v_count,
          'strategy', 'manual_review',
          'blockers', v_row_blockers
        )
      );
    ELSE
      EXECUTE format(
        'SELECT count(*) FROM public.%I t JOIN public.customers c ON c.id = t.%I WHERE c.account_id = $1',
        v_fk.table_name,
        v_fk.column_name
      )
      INTO v_count
      USING p_duplicate_customer_id;

      v_transferable := v_transferable || jsonb_build_array(
        jsonb_build_object(
          'table', v_fk.table_name,
          'foreignKeyColumn', v_fk.column_name,
          'count', v_count,
          'strategy', 'preserve_via_customer_account_reassignment',
          'blockers', '[]'::jsonb
        )
      );
    END IF;
  END LOOP;

  -- Non-FK inventory safety net for account/customer-like UUID columns.
  -- Any duplicate-linked rows outside the explicit supported set block execution.
  FOR v_fk IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.data_type = 'uuid'
      AND c.column_name IN ('account_id', 'customer_id', 'client_id', 'insured_id', 'primary_customer_id', 'converted_account_id', 'to_account_id', 'referring_account_id', 'converted_to_account_id')
      AND array_position(v_supported_keys, c.table_name || '.' || c.column_name) IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
          AND kcu.table_name = c.table_name
          AND kcu.column_name = c.column_name
      )
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', v_fk.table_name, v_fk.column_name)
    INTO v_count
    USING p_duplicate_customer_id;

    v_row_blockers := '[]'::jsonb;
    IF v_count > 0 THEN
      v_row_blockers := v_row_blockers || jsonb_build_array('Phase 1 RPC does not transfer this non-FK account/customer-like column; manual review required before merge');
      v_blockers := v_blockers || jsonb_build_array(format('%s.%s has %s duplicate-linked non-FK row(s) outside Phase 1 transfer coverage', v_fk.table_name, v_fk.column_name, v_count));
    END IF;

    v_transferable := v_transferable || jsonb_build_array(
      jsonb_build_object(
        'table', v_fk.table_name,
        'foreignKeyColumn', v_fk.column_name,
        'count', v_count,
        'strategy', 'manual_review',
        'blockers', v_row_blockers
      )
    );
  END LOOP;

  v_confirmation_phrase := format('MERGE %s INTO %s', COALESCE(v_duplicate.name, p_duplicate_customer_id::text), COALESCE(v_master.name, p_master_customer_id::text));

  RETURN jsonb_build_object(
    'master', CASE WHEN v_master.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_master.id,
      'name', v_master.name,
      'email', v_master.email,
      'phone', v_master.phone,
      'accountStatus', v_master.account_status,
      'deletedAt', v_master.deleted_at
    ) END,
    'duplicate', CASE WHEN v_duplicate.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_duplicate.id,
      'name', v_duplicate.name,
      'email', v_duplicate.email,
      'phone', v_duplicate.phone,
      'accountStatus', v_duplicate.account_status,
      'deletedAt', v_duplicate.deleted_at
    ) END,
    'transferableTables', v_transferable,
    'scalarConflicts', v_scalar_conflicts,
    'warnings', v_warnings,
    'blockers', v_blockers,
    'confirmationPhrase', v_confirmation_phrase
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Transactional merge RPC
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.merge_customers_transactional_v1(
  p_master_customer_id uuid,
  p_duplicate_customer_id uuid,
  p_confirmation_phrase text,
  p_options jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_preview jsonb;
  v_master public.accounts%ROWTYPE;
  v_duplicate public.accounts%ROWTYPE;
  v_merge_id uuid := gen_random_uuid();
  v_current_user_id uuid := auth.uid();
  v_fill_blank boolean := COALESCE((p_options->>'fillBlankMasterFields')::boolean, true);
  v_append_notes boolean := COALESCE((p_options->>'appendDuplicateNotes')::boolean, true);
  v_source text := COALESCE(NULLIF(p_options->>'source', ''), 'rpc');
  v_transferred_counts jsonb := '{}'::jsonb;
  v_transferred_rows jsonb := '{}'::jsonb;
  v_deduped_counts jsonb := '{}'::jsonb;
  v_deduped_rows jsonb := '{}'::jsonb;
  v_scalar_changes jsonb := '[]'::jsonb;
  v_ids jsonb;
  v_count integer;
  v_direct record;
  v_field text;
  v_report jsonb;
BEGIN
  IF v_current_user_id IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'Not authorized to merge customers';
  END IF;

  IF p_master_customer_id IS NULL OR p_duplicate_customer_id IS NULL THEN
    RAISE EXCEPTION 'Both master and duplicate account IDs are required';
  END IF;

  IF p_master_customer_id = p_duplicate_customer_id THEN
    RAISE EXCEPTION 'Cannot merge an account into itself';
  END IF;

  -- Lock first, then preview/validate while holding the ordered transaction locks.
  PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(p_master_customer_id::text, p_duplicate_customer_id::text), 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(GREATEST(p_master_customer_id::text, p_duplicate_customer_id::text), 0));

  SELECT * INTO v_master
  FROM public.accounts
  WHERE id = p_master_customer_id
  FOR UPDATE;

  SELECT * INTO v_duplicate
  FROM public.accounts
  WHERE id = p_duplicate_customer_id
  FOR UPDATE;

  IF v_master.id IS NULL OR v_duplicate.id IS NULL THEN
    RAISE EXCEPTION 'Master or duplicate account disappeared before merge';
  END IF;

  v_preview := public.preview_customer_merge_v1(p_master_customer_id, p_duplicate_customer_id);

  IF jsonb_array_length(v_preview->'blockers') > 0 THEN
    RAISE EXCEPTION 'Merge blocked: %', v_preview->'blockers';
  END IF;

  IF p_confirmation_phrase IS DISTINCT FROM (v_preview->>'confirmationPhrase') THEN
    RAISE EXCEPTION 'Confirmation phrase does not match';
  END IF;

  -- Dedupe legacy account_tags by case-insensitive tag name, then move the rest.
  IF public._customer_merge_column_exists('account_tags', 'account_id') THEN
    SELECT COALESCE(jsonb_agg(d.id), '[]'::jsonb)
    INTO v_ids
    FROM public.account_tags d
    WHERE d.account_id = p_duplicate_customer_id
      AND EXISTS (
        SELECT 1 FROM public.account_tags m
        WHERE m.account_id = p_master_customer_id
          AND lower(m.tag_name) = lower(d.tag_name)
      );

    DELETE FROM public.account_tags d
    WHERE d.account_id = p_duplicate_customer_id
      AND EXISTS (
        SELECT 1 FROM public.account_tags m
        WHERE m.account_id = p_master_customer_id
          AND lower(m.tag_name) = lower(d.tag_name)
      );
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deduped_counts := v_deduped_counts || jsonb_build_object('account_tags.account_id', v_count);
    v_deduped_rows := v_deduped_rows || jsonb_build_object('account_tags.account_id', v_ids);

    SELECT COALESCE(jsonb_agg(id), '[]'::jsonb)
    INTO v_ids
    FROM public.account_tags
    WHERE account_id = p_duplicate_customer_id;

    UPDATE public.account_tags
    SET account_id = p_master_customer_id
    WHERE account_id = p_duplicate_customer_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_transferred_counts := v_transferred_counts || jsonb_build_object('account_tags.account_id', v_count);
    v_transferred_rows := v_transferred_rows || jsonb_build_object('account_tags.account_id', v_ids);
  END IF;

  -- Dedupe CRM tags by case-insensitive name and repoint customer_tags to the
  -- survivor tag before deleting duplicate tag rows.
  IF public._customer_merge_column_exists('tags', 'account_id') THEN
    IF public._customer_merge_table_exists('customer_tags') THEN
      WITH tag_pairs AS (
        SELECT d.id AS duplicate_tag_id, m.id AS master_tag_id
        FROM public.tags d
        JOIN public.tags m
          ON m.account_id = p_master_customer_id
         AND lower(m.name) = lower(d.name)
        WHERE d.account_id = p_duplicate_customer_id
      )
      INSERT INTO public.customer_tags(customer_id, tag_id, created_at)
      SELECT ct.customer_id, tp.master_tag_id, MIN(ct.created_at)
      FROM public.customer_tags ct
      JOIN tag_pairs tp ON tp.duplicate_tag_id = ct.tag_id
      GROUP BY ct.customer_id, tp.master_tag_id
      ON CONFLICT DO NOTHING;

      WITH tag_pairs AS (
        SELECT d.id AS duplicate_tag_id, m.id AS master_tag_id
        FROM public.tags d
        JOIN public.tags m
          ON m.account_id = p_master_customer_id
         AND lower(m.name) = lower(d.name)
        WHERE d.account_id = p_duplicate_customer_id
      )
      DELETE FROM public.customer_tags ct
      USING tag_pairs tp
      WHERE ct.tag_id = tp.duplicate_tag_id;
    END IF;

    SELECT COALESCE(jsonb_agg(d.id), '[]'::jsonb)
    INTO v_ids
    FROM public.tags d
    WHERE d.account_id = p_duplicate_customer_id
      AND EXISTS (
        SELECT 1 FROM public.tags m
        WHERE m.account_id = p_master_customer_id
          AND lower(m.name) = lower(d.name)
      );

    DELETE FROM public.tags d
    WHERE d.account_id = p_duplicate_customer_id
      AND EXISTS (
        SELECT 1 FROM public.tags m
        WHERE m.account_id = p_master_customer_id
          AND lower(m.name) = lower(d.name)
      );
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deduped_counts := v_deduped_counts || jsonb_build_object('tags.account_id', v_count);
    v_deduped_rows := v_deduped_rows || jsonb_build_object('tags.account_id', v_ids);

    SELECT COALESCE(jsonb_agg(id), '[]'::jsonb)
    INTO v_ids
    FROM public.tags
    WHERE account_id = p_duplicate_customer_id;

    UPDATE public.tags
    SET account_id = p_master_customer_id,
        updated_at = CASE WHEN public._customer_merge_column_exists('tags', 'updated_at') THEN now() ELSE updated_at END
    WHERE account_id = p_duplicate_customer_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_transferred_counts := v_transferred_counts || jsonb_build_object('tags.account_id', v_count);
    v_transferred_rows := v_transferred_rows || jsonb_build_object('tags.account_id', v_ids);
  END IF;

  FOR v_direct IN
    SELECT * FROM (VALUES
      ('customers', 'account_id'),
      ('contacts', 'account_id'),
      ('policies', 'account_id'),
      ('quotes', 'account_id'),
      ('documents', 'account_id'),
      ('tasks', 'account_id'),
      ('communications', 'account_id'),
      ('renewals', 'account_id'),
      ('ao_renewals', 'account_id'),
      ('canopy_pulls', 'account_id'),
      ('notes', 'account_id'),
      ('call_sessions', 'account_id'),
      ('sms_messages', 'account_id')
    ) AS t(table_name, column_name)
  LOOP
    IF public._customer_merge_column_exists(v_direct.table_name, v_direct.column_name) THEN
      EXECUTE format('SELECT COALESCE(jsonb_agg(id), ''[]''::jsonb) FROM public.%I WHERE %I = $1', v_direct.table_name, v_direct.column_name)
      INTO v_ids
      USING p_duplicate_customer_id;

      IF public._customer_merge_column_exists(v_direct.table_name, 'updated_at') THEN
        EXECUTE format('UPDATE public.%I SET %I = $1, updated_at = now() WHERE %I = $2', v_direct.table_name, v_direct.column_name, v_direct.column_name)
        USING p_master_customer_id, p_duplicate_customer_id;
      ELSE
        EXECUTE format('UPDATE public.%I SET %I = $1 WHERE %I = $2', v_direct.table_name, v_direct.column_name, v_direct.column_name)
        USING p_master_customer_id, p_duplicate_customer_id;
      END IF;
      GET DIAGNOSTICS v_count = ROW_COUNT;

      v_transferred_counts := v_transferred_counts || jsonb_build_object(v_direct.table_name || '.' || v_direct.column_name, v_count);
      v_transferred_rows := v_transferred_rows || jsonb_build_object(v_direct.table_name || '.' || v_direct.column_name, v_ids);
    END IF;
  END LOOP;

  IF public._customer_merge_column_exists('leads', 'account_id') THEN
    SELECT COALESCE(jsonb_agg(id), '[]'::jsonb)
    INTO v_ids
    FROM public.leads
    WHERE account_id = p_duplicate_customer_id;

    UPDATE public.leads
    SET account_id = p_master_customer_id,
        updated_at = CASE WHEN public._customer_merge_column_exists('leads', 'updated_at') THEN now() ELSE updated_at END
    WHERE account_id = p_duplicate_customer_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_transferred_counts := v_transferred_counts || jsonb_build_object('leads.account_id', v_count);
    v_transferred_rows := v_transferred_rows || jsonb_build_object('leads.account_id', v_ids);
  END IF;

  IF public._customer_merge_column_exists('leads', 'converted_account_id') THEN
    SELECT COALESCE(jsonb_agg(id), '[]'::jsonb)
    INTO v_ids
    FROM public.leads
    WHERE converted_account_id = p_duplicate_customer_id;

    UPDATE public.leads
    SET converted_account_id = p_master_customer_id,
        updated_at = CASE WHEN public._customer_merge_column_exists('leads', 'updated_at') THEN now() ELSE updated_at END
    WHERE converted_account_id = p_duplicate_customer_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_transferred_counts := v_transferred_counts || jsonb_build_object('leads.converted_account_id', v_count);
    v_transferred_rows := v_transferred_rows || jsonb_build_object('leads.converted_account_id', v_ids);
  END IF;

  IF public._customer_merge_column_exists('duplicate_flags', 'status') THEN
    SELECT COALESCE(jsonb_agg(id), '[]'::jsonb)
    INTO v_ids
    FROM public.duplicate_flags
    WHERE account_id = p_duplicate_customer_id
      AND status = 'open';

    UPDATE public.duplicate_flags
    SET status = 'merged',
        resolved_by = v_current_user_id,
        resolved_at = now(),
        resolution = format('Merged into account %s by merge_customers_transactional_v1', p_master_customer_id)
    WHERE account_id = p_duplicate_customer_id
      AND status = 'open';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_transferred_counts := v_transferred_counts || jsonb_build_object('duplicate_flags.account_id', v_count);
    v_transferred_rows := v_transferred_rows || jsonb_build_object('duplicate_flags.account_id', v_ids);
  END IF;

  IF v_fill_blank THEN
    FOREACH v_field IN ARRAY ARRAY[
      'email', 'phone', 'phone_secondary', 'address_line1', 'address_line2', 'city',
      'state', 'zip_code', 'tin_last4', 'source', 'lead_source_detail', 'spouse_name',
      'date_of_birth', 'spouse_date_of_birth', 'primary_entity_name', 'secondary_entity_name',
      'trustee_name'
    ] LOOP
      IF public._customer_merge_column_exists('accounts', v_field) THEN
        EXECUTE format(
          'UPDATE public.accounts m
             SET %1$I = d.%1$I,
                 updated_at = now()
            FROM public.accounts d
           WHERE m.id = $1
             AND d.id = $2
             AND (m.%1$I IS NULL OR NULLIF(btrim(m.%1$I::text), '''') IS NULL)
             AND d.%1$I IS NOT NULL
             AND NULLIF(btrim(d.%1$I::text), '''') IS NOT NULL',
          v_field
        )
        USING p_master_customer_id, p_duplicate_customer_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;

        IF v_count > 0 THEN
          v_scalar_changes := v_scalar_changes || jsonb_build_array(
            jsonb_build_object('field', v_field, 'resolution', 'fill_master_if_blank', 'source', 'duplicate')
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF v_append_notes AND NULLIF(btrim(COALESCE(v_duplicate.notes, '')), '') IS NOT NULL THEN
    UPDATE public.accounts m
    SET notes = concat_ws(E'\n\n', NULLIF(m.notes, ''), format('--- Merged from %s (%s) ---', v_duplicate.name, now()::date), v_duplicate.notes),
        updated_at = now()
    WHERE m.id = p_master_customer_id;

    v_scalar_changes := v_scalar_changes || jsonb_build_array(
      jsonb_build_object('field', 'notes', 'resolution', 'append_duplicate_notes', 'source', 'duplicate')
    );
  END IF;

  UPDATE public.accounts
  SET deleted_at = COALESCE(deleted_at, now()),
      merged_into_id = p_master_customer_id,
      merged_at = now(),
      merged_by = v_current_user_id,
      updated_at = now()
  WHERE id = p_duplicate_customer_id;

  IF public._customer_merge_table_exists('duplicate_groups') THEN
    UPDATE public.duplicate_groups
    SET status = 'merged',
        reviewed_by = v_current_user_id,
        reviewed_at = now()
    WHERE entity_type IN ('account', 'accounts')
      AND entity_ids @> ARRAY[p_master_customer_id, p_duplicate_customer_id]
      AND COALESCE(status, 'pending') <> 'merged';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_transferred_counts := v_transferred_counts || jsonb_build_object('duplicate_groups.entity_ids', v_count);
  END IF;

  UPDATE public.duplicate_pair_reviews
  SET status = 'merged',
      reviewed_by = v_current_user_id,
      reviewed_at = now(),
      updated_at = now(),
      reason = COALESCE(reason, format('Merged by merge_customers_transactional_v1 into %s', p_master_customer_id))
  WHERE customer_a_id = LEAST(p_master_customer_id, p_duplicate_customer_id)
    AND customer_b_id = GREATEST(p_master_customer_id, p_duplicate_customer_id)
    AND status <> 'merged';

  v_report := jsonb_build_object(
    'mergeId', v_merge_id,
    'masterCustomerId', p_master_customer_id,
    'duplicateCustomerId', p_duplicate_customer_id,
    'source', v_source,
    'transferredCounts', v_transferred_counts,
    'dedupedCounts', v_deduped_counts,
    'transferredRows', v_transferred_rows,
    'dedupedRows', v_deduped_rows,
    'scalarFieldChanges', v_scalar_changes,
    'warnings', v_preview->'warnings',
    'preview', v_preview,
    'completedAt', now(),
    'mergedBy', v_current_user_id,
    'softDeletedDuplicate', true
  );

  INSERT INTO public.merge_history (
    id,
    entity_type,
    survivor_id,
    merged_ids,
    merge_data,
    merged_by,
    created_at
  ) VALUES (
    v_merge_id,
    'account',
    p_master_customer_id,
    ARRAY[p_duplicate_customer_id],
    v_report || jsonb_build_object(
      'before', jsonb_build_object(
        'master', to_jsonb(v_master),
        'duplicate', to_jsonb(v_duplicate)
      )
    ),
    v_current_user_id,
    now()
  );

  RETURN v_report;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_customer_merge_v1(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.preview_customer_merge_v1(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.merge_customers_transactional_v1(uuid, uuid, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.merge_customers_transactional_v1(uuid, uuid, text, jsonb) TO authenticated;
