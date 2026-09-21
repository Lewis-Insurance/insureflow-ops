-- Haven policy feed — the provider half of the InsureFlow → Haven agency summary link.
--
-- Haven's receiver (Circle-of-Life, src/lib/insurance/insureflow/) was built,
-- independently reviewed and merged against a provider that never existed: its
-- contract records that the provider source was uncommitted working-tree files on
-- a sandbox. This is that provider, written to the contract the receiver actually
-- enforces in validateFeedPage().
--
-- THE CONTROL THAT SHAPES EVERYTHING
-- ----------------------------------
-- The receiver requires that every 'released' event in a page also appear in that
-- page's current_authorized_releases manifest, and that every 'withdrawn' event be
-- absent from it. A superseded release therefore can never be streamed again — so
-- the feed is not the raw log. It is the *latest event per policy*, carrying its
-- original sequence. Re-releasing a policy retires its earlier release from the
-- stream; the log below keeps every version, the feed exposes only the current one.
--
-- Nothing here publishes on its own. No trigger watches policies. A release only
-- exists because somebody called haven_feed_publish for an approved account on an
-- enabled integration, and an integration is disabled until explicitly turned on.

BEGIN;

-- ---------------------------------------------------------------------------
-- Integrations: one per consuming system, credential stored only as a hash.
-- ---------------------------------------------------------------------------
CREATE TABLE public.haven_feed_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  -- SHA-256 of the bearer token. The token itself is shown once at creation and
  -- never stored, so a database disclosure does not yield a working credential.
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  -- Only policies on these accounts may be released. An empty array publishes nothing.
  approved_account_ids uuid[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  revoked_at timestamptz
);

COMMENT ON TABLE public.haven_feed_integrations IS
  'Consumers of the Haven policy feed. Disabled until explicitly enabled; token stored as SHA-256 only.';

-- ---------------------------------------------------------------------------
-- Append-only event log. An event id IS the release_id the receiver matches on:
-- validateFeedPage looks the manifest up by event id, so they must be the same value.
-- ---------------------------------------------------------------------------
CREATE SEQUENCE public.haven_feed_event_sequence AS bigint START 1;

CREATE TABLE public.haven_feed_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.haven_feed_integrations(id),
  policy_id uuid NOT NULL REFERENCES public.policies(id),
  -- Decimal cursor. Strictly increasing, gaps allowed; the receiver requires
  -- increasing order, never contiguity, and reads it as a string.
  sequence bigint NOT NULL DEFAULT nextval('public.haven_feed_event_sequence')
    CHECK (sequence BETWEEN 1 AND 9223372036854775807),
  kind text NOT NULL CHECK (kind IN ('released', 'withdrawn')),
  -- Exactly the eleven provider fields of snapshot schema 1, or NULL on withdrawal.
  snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, sequence),
  CONSTRAINT haven_feed_events_body_matches_kind
    CHECK ((kind = 'withdrawn') = (snapshot IS NULL))
);

CREATE INDEX idx_haven_feed_events_integration_sequence
  ON public.haven_feed_events (integration_id, sequence);
CREATE INDEX idx_haven_feed_events_integration_policy_sequence
  ON public.haven_feed_events (integration_id, policy_id, sequence DESC);

COMMENT ON COLUMN public.haven_feed_events.id IS
  'Also the release_id. Haven matches manifest entries by event id; they cannot differ.';

-- History is evidence. A released body must stay exactly as it was released,
-- because the receiver pins the first non-null body hash per event forever and
-- treats a second, different body for the same id as a sticky integrity conflict.
CREATE FUNCTION public.haven_feed_events_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Haven feed events are append-only'
    USING ERRCODE = '42501';
END $$;

CREATE TRIGGER haven_feed_events_immutable
  BEFORE UPDATE OR DELETE ON public.haven_feed_events
  FOR EACH ROW EXECUTE FUNCTION public.haven_feed_events_immutable();

-- ---------------------------------------------------------------------------
-- Snapshot schema 1 — exactly eleven fields, source values unconverted.
-- No currency conversion, no cents, no period maths, no status normalisation.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.haven_feed_snapshot(p_policy_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'schema_version',   1,
    'policy_id',        p.id,
    'account_id',       p.account_id,
    'policy_number',    p.policy_number,
    'carrier',          p.carrier,
    'line_of_business', p.line_of_business,
    'named_insured',    p.named_insured,
    'effective_date',   p.effective_date,
    'expiration_date',  p.expiration_date,
    'premium',          p.premium,
    'status',           p.status
  )
  FROM public.policies AS p
  WHERE p.id = p_policy_id
$$;

-- ---------------------------------------------------------------------------
-- Publish. Refuses rather than emitting a body the receiver would quarantine.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.haven_feed_publish(p_integration_id uuid, p_policy_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_integration public.haven_feed_integrations;
  v_policy public.policies;
  v_snapshot jsonb;
  v_release_id uuid;
BEGIN
  SELECT * INTO v_integration FROM public.haven_feed_integrations
    WHERE id = p_integration_id AND enabled AND revoked_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No enabled Haven feed integration %', p_integration_id USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_policy FROM public.policies WHERE id = p_policy_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Policy % is not available to publish', p_policy_id USING ERRCODE = '22023';
  END IF;

  IF v_policy.account_id IS NULL OR NOT (v_policy.account_id = ANY (v_integration.approved_account_ids)) THEN
    RAISE EXCEPTION 'Policy % is not on an approved account for this integration', p_policy_id
      USING ERRCODE = '42501';
  END IF;

  -- The receiver rejects a body whose policy_number is not a string, so refuse
  -- here instead of shipping something that lands as a quarantine receipt.
  IF nullif(btrim(coalesce(v_policy.policy_number, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Policy % has no policy number to publish', p_policy_id USING ERRCODE = '22023';
  END IF;

  v_snapshot := public.haven_feed_snapshot(p_policy_id);

  INSERT INTO public.haven_feed_events (integration_id, policy_id, kind, snapshot)
  VALUES (p_integration_id, p_policy_id, 'released', v_snapshot)
  RETURNING id INTO v_release_id;

  RETURN v_release_id;
END $$;

-- Withdrawal removes disclosure. It does not cancel anything in InsureFlow and
-- says nothing about the policy itself.
CREATE FUNCTION public.haven_feed_withdraw(p_integration_id uuid, p_policy_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_event_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.haven_feed_integrations
    WHERE id = p_integration_id AND enabled AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'No enabled Haven feed integration %', p_integration_id USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.haven_feed_events
    WHERE integration_id = p_integration_id AND policy_id = p_policy_id
  ) THEN
    RAISE EXCEPTION 'Policy % was never released to this integration', p_policy_id USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.haven_feed_events (integration_id, policy_id, kind, snapshot)
  VALUES (p_integration_id, p_policy_id, 'withdrawn', NULL)
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END $$;

-- ---------------------------------------------------------------------------
-- The feed page.
--
-- current_feed = the latest event per policy. A superseded release is retired
-- from the stream entirely, which is what lets every streamed 'released' event
-- be selected by the manifest and every 'withdrawn' event be absent from it.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.haven_policy_feed(
  p_integration_id uuid,
  p_after bigint DEFAULT 0,
  p_limit integer DEFAULT 100
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_next_cursor bigint;
  v_payload jsonb;
BEGIN
  IF p_after IS NULL OR p_after < 0 OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Invalid feed request' USING ERRCODE = '22023';
  END IF;

  -- No temporary table on purpose. A prior Haven worker was broken in production
  -- by PostgREST refusing an unconditional DELETE against a temp table, and this
  -- reads the same data with plain CTEs.
  WITH current_feed AS (
    SELECT DISTINCT ON (e.policy_id)
      e.id, e.policy_id, e.sequence, e.kind, e.snapshot, e.created_at
    FROM public.haven_feed_events AS e
    WHERE e.integration_id = p_integration_id
    ORDER BY e.policy_id, e.sequence DESC
  ),
  page AS (
    SELECT * FROM current_feed WHERE sequence > p_after ORDER BY sequence LIMIT p_limit
  ),
  cursor_value AS (
    SELECT coalesce((SELECT max(sequence) FROM page), p_after) AS next_cursor
  )
  SELECT
    cursor_value.next_cursor,
    jsonb_build_object(
      'schema_version', 1,
      'integration_id', p_integration_id,
      'as_of', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      -- Membership is bounded by what has actually been streamed, so a page that
      -- reports has_more = false never names a release the reader has not seen.
      'current_authorized_releases', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'policy_id', c.policy_id,
                 'release_id', c.id,
                 'sequence', c.sequence::text
               ) ORDER BY c.sequence)
        FROM current_feed AS c
        WHERE c.kind = 'released' AND c.sequence <= cursor_value.next_cursor
      ), '[]'::jsonb),
      'events', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', pg.id,
                 'policy_id', pg.policy_id,
                 'sequence', pg.sequence::text,
                 'kind', pg.kind,
                 -- A withdrawn event carries an explicit null body: the receiver
                 -- requires the key present and null, never absent.
                 'snapshot', pg.snapshot,
                 'created_at', to_char(pg.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
               ) ORDER BY pg.sequence)
        FROM page AS pg
      ), '[]'::jsonb),
      'next_cursor', cursor_value.next_cursor::text,
      'has_more', EXISTS (
        SELECT 1 FROM current_feed WHERE sequence > cursor_value.next_cursor
      )
    )
  INTO v_next_cursor, v_payload
  FROM cursor_value;

  -- The receiver refuses anything over 3 MiB. Fail below that so a page is never
  -- truncated into something that still parses but means something else.
  IF octet_length(v_payload::text) > 2 * 1024 * 1024 THEN
    RAISE EXCEPTION 'Haven feed page exceeds the 2 MB provider guard; request a smaller limit'
      USING ERRCODE = '54000';
  END IF;

  RETURN v_payload;
END $$;

-- ---------------------------------------------------------------------------
-- Exposure. Browser roles get nothing: the feed is read by a server holding a
-- scoped bearer token, never by a signed-in user session.
-- ---------------------------------------------------------------------------
ALTER TABLE public.haven_feed_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.haven_feed_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.haven_feed_integrations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.haven_feed_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.haven_policy_feed(uuid, bigint, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.haven_feed_publish(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.haven_feed_withdraw(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.haven_feed_snapshot(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.haven_policy_feed(uuid, bigint, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.haven_feed_publish(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.haven_feed_withdraw(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
