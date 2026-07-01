-- ============================================================================
-- THE FLOOR — Spine C: resolve_account RPC
-- Mirrors src/floor/spine/resolveAccount.ts identity ladder.
-- Staged only. Do not apply to prod until Brian clears Phase 0 blockers.
-- AUTO threshold: 0.9 (RESOLVE_ACCOUNT_AUTO_THRESHOLD)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.floor_normalize_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN length(digits) = 11 AND left(digits, 1) = '1' THEN substr(digits, 2)
    ELSE digits
  END
  FROM (
    SELECT regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') AS digits
  ) normalized;
$$;

CREATE OR REPLACE FUNCTION public.resolve_account(
  p_agency_workspace_id UUID,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_name TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_email TEXT := NULLIF(lower(trim(coalesce(p_email, ''))), '');
  v_phone TEXT := public.floor_normalize_phone(p_phone);
  v_name TEXT := NULLIF(trim(coalesce(p_name, '')), '');
  v_local_part TEXT;
  v_domain TEXT;
  v_candidates JSONB := '[]'::JSONB;
  v_top JSONB := NULL;
  v_auto_threshold CONSTANT NUMERIC := 0.9;
BEGIN
  IF auth.role() <> 'service_role' AND NOT EXISTS (
    SELECT 1
    FROM public.agency_workspace_memberships m
    WHERE m.agency_workspace_id = p_agency_workspace_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'forbidden: resolve_account requires active agency membership'
      USING ERRCODE = '42501';
  END IF;

  IF v_email IS NOT NULL THEN
    v_local_part := split_part(v_email, '@', 1);
    v_domain := NULLIF(split_part(v_email, '@', 2), '');

    -- email exact on accounts.email
    SELECT coalesce(
      v_candidates,
      '[]'::JSONB
    ) || coalesce(
      (
        SELECT jsonb_agg(jsonb_build_object(
          'account_id', a.id,
          'match_basis', 'email_exact',
          'confidence', 1.0
        ))
        FROM public.accounts a
        WHERE a.agency_workspace_id = p_agency_workspace_id
          AND a.deleted_at IS NULL
          AND a.merged_into_id IS NULL
          AND lower(coalesce(a.email, '')) = v_email
      ),
      '[]'::JSONB
    )
    INTO v_candidates;

    -- insured_emails exact
    SELECT coalesce(v_candidates, '[]'::JSONB) || coalesce(
      (
        SELECT jsonb_agg(jsonb_build_object(
          'account_id', ie.account_id,
          'match_basis', 'email_exact',
          'confidence', 0.98
        ))
        FROM public.insured_emails ie
        JOIN public.accounts a ON a.id = ie.account_id
        WHERE a.agency_workspace_id = p_agency_workspace_id
          AND a.deleted_at IS NULL
          AND a.merged_into_id IS NULL
          AND lower(ie.email) = v_email
      ),
      '[]'::JSONB
    )
    INTO v_candidates;

    -- alias match on email local-part (optional table — may not exist on all branches)
    IF to_regclass('public.account_aliases') IS NOT NULL THEN
      SELECT coalesce(v_candidates, '[]'::JSONB) || coalesce(
        (
          SELECT jsonb_agg(jsonb_build_object(
            'account_id', aa.account_id,
            'match_basis', 'alias',
            'confidence', 0.92
          ))
          FROM public.account_aliases aa
          JOIN public.accounts a ON a.id = aa.account_id
          WHERE a.agency_workspace_id = p_agency_workspace_id
            AND a.deleted_at IS NULL
            AND a.merged_into_id IS NULL
            AND lower(aa.alias) = v_local_part
        ),
        '[]'::JSONB
      )
      INTO v_candidates;
    END IF;

    -- reverse email domain (top 3)
    IF v_domain IS NOT NULL THEN
      SELECT coalesce(v_candidates, '[]'::JSONB) || coalesce(
        (
          SELECT jsonb_agg(jsonb_build_object(
            'account_id', ranked.id,
            'match_basis', 'reverse_domain',
            'confidence', 0.75
          ))
          FROM (
            SELECT a.id
            FROM public.accounts a
            WHERE a.agency_workspace_id = p_agency_workspace_id
              AND a.deleted_at IS NULL
              AND a.merged_into_id IS NULL
              AND a.email IS NOT NULL
              AND lower(split_part(a.email, '@', 2)) = v_domain
            ORDER BY a.updated_at DESC
            LIMIT 3
          ) ranked
        ),
        '[]'::JSONB
      )
      INTO v_candidates;
    END IF;
  END IF;

  IF v_name IS NOT NULL THEN
    SELECT coalesce(v_candidates, '[]'::JSONB) || coalesce(
      (
        SELECT jsonb_agg(jsonb_build_object(
          'account_id', ranked.id,
          'match_basis', 'trgm_name',
          'confidence', ranked.confidence
        ))
        FROM (
          SELECT
            a.id,
            LEAST(0.89, GREATEST(0.4, similarity(lower(a.name), lower(v_name)))) AS confidence
          FROM public.accounts a
          WHERE a.agency_workspace_id = p_agency_workspace_id
            AND a.deleted_at IS NULL
            AND a.merged_into_id IS NULL
            AND similarity(lower(a.name), lower(v_name)) > 0.2
          ORDER BY confidence DESC
          LIMIT 5
        ) ranked
      ),
      '[]'::JSONB
    )
    INTO v_candidates;
  END IF;

  IF v_phone IS NOT NULL AND length(v_phone) >= 10 THEN
    SELECT coalesce(v_candidates, '[]'::JSONB) || coalesce(
      (
        SELECT jsonb_agg(jsonb_build_object(
          'account_id', a.id,
          'match_basis', 'phone',
          'confidence', 0.88
        ))
        FROM public.accounts a
        WHERE a.agency_workspace_id = p_agency_workspace_id
          AND a.deleted_at IS NULL
          AND a.merged_into_id IS NULL
          AND (
            public.floor_normalize_phone(a.phone) = v_phone
            OR public.floor_normalize_phone(a.phone_e164) = v_phone
            OR public.floor_normalize_phone(a.phone_secondary) = v_phone
          )
      ),
      '[]'::JSONB
    )
    INTO v_candidates;
  END IF;

  WITH expanded AS (
    SELECT
      (elem->>'account_id')::UUID AS account_id,
      elem->>'match_basis' AS match_basis,
      (elem->>'confidence')::NUMERIC AS confidence
    FROM jsonb_array_elements(coalesce(v_candidates, '[]'::JSONB)) elem
    WHERE elem ? 'account_id'
  ),
  deduped AS (
    SELECT DISTINCT ON (account_id)
      account_id,
      match_basis,
      confidence
    FROM expanded
    ORDER BY account_id, confidence DESC
  ),
  ranked AS (
    SELECT account_id, match_basis, confidence
    FROM deduped
    ORDER BY confidence DESC
  )
  SELECT
    coalesce(
      (
        SELECT jsonb_agg(jsonb_build_object(
          'account_id', r.account_id,
          'match_basis', r.match_basis,
          'confidence', r.confidence
        ) ORDER BY r.confidence DESC)
        FROM ranked r
      ),
      '[]'::JSONB
    ),
    (
      SELECT CASE
        WHEN r.confidence >= v_auto_threshold THEN jsonb_build_object(
          'account_id', r.account_id,
          'confidence', r.confidence
        )
        ELSE NULL
      END
      FROM ranked r
      ORDER BY r.confidence DESC
      LIMIT 1
    )
  INTO v_candidates, v_top;

  RETURN json_build_object(
    'candidates', coalesce(v_candidates, '[]'::JSONB),
    'top', v_top
  );
END;
$$;

COMMENT ON FUNCTION public.resolve_account(UUID, TEXT, TEXT, TEXT) IS
  'Floor identity ladder: email-exact → alias → reverse-domain → pg_trgm name → phone. '
  'Auto top when confidence >= 0.9. Staff-gated SECURITY DEFINER RPC.';

GRANT EXECUTE ON FUNCTION public.resolve_account(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_account(UUID, TEXT, TEXT, TEXT) TO service_role;
