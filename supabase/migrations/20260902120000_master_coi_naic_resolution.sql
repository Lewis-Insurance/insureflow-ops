-- =============================================================================
-- Master COI: NAIC resolution fix + carriers.naic hygiene
-- 2026-09-02
--
-- !! NEEDS LANDEN APPROVAL BEFORE PROD APPLY !!
--
-- Reported: "NAIC is not generating when creating a COI for Donald Roberts
-- Masonry LLC. The carrier is correct on the Carriers page."
--
-- Reproduced against prod (read-only, impersonated staff, rolled back):
--   account  Donald Roberts Masonry Llc  979f1c4f-c04b-4538-a997-ddd7b6f286da
--   policy   SES1835826 00 (GL, active)  051927a2-846e-4ec2-b749-196fea150caf
--     policies.carrier      = 'Security National Insurance Company'
--     policies.carrier_naic = null
--     policies.carrier_id   -> carriers 'Bass Underwriting'  (the wholesaler)
--   carriers 'Bass Underwriting'                naic = ''      (empty string)
--   carriers 'Security National Insurance Company' naic = '19879'
--
--   get_master_coi returned insurer A:
--     name = "Security National Insurance Company" (src manual)
--     naic = ""                                    (src reference)
--
-- Two independent defects produced that empty string:
--
--   1. The NAIC coalesce in get_master_coi nullif'd only the two policy-level
--      sources. The two reference sources (carriers row via carrier_id, then
--      the name-resolved carrier) were used raw, so carriers.naic = '' won the
--      coalesce and stopped the fallback. '' is not a NAIC: the cell rendered
--      as a blank box labelled "reference", which reads as resolved rather than
--      missing, and the ACORD 25 insurer table printed nothing.
--      8 of 40 carriers rows carry naic = '' (the Carriers form writes blank
--      inputs as empty strings, not null).
--
--   2. NAIC was always taken from the carrier_id link even when the printed
--      insurer name came from policies.carrier and named a different carrier.
--      Here the policy is linked to the wholesaler (Bass Underwriting) while
--      the certificate prints the issuing carrier (Security National), whose
--      carriers row holds the correct NAIC 19879.
--
-- This migration:
--   A. Normalizes blank carriers.naic / policies.carrier_naic to null and adds
--      a before-insert/update trigger on carriers so the Carriers form (and any
--      other writer) can never store '' again.
--   B. Replaces get_master_coi with the same body plus:
--        - btrim/nullif on every NAIC source, reference sources included
--        - reference NAIC preferred from the carriers row whose name matches
--          the printed insurer name (link first, then the name-resolved row),
--          falling back to the previous link-first order
--        - naic_missing warning now names the insurer and says where to fix it
--      Nothing else in the function changes. The body was taken from the live
--      prod definition, which is byte-identical to
--      20260702172000_master_coi_rpcs.sql (md5 9a6be5f2f8de7935cd3ef41443d48dd0).
--
-- Measured blast radius over all 2352 non-deleted policies (prod, read-only):
--     114 active + 1 cancelled: naic '' -> null, so the cell now honestly reads
--                               "Missing" instead of showing a blank box
--       1 active               : naic '' -> '19879' (the reported policy)
--       0                      : any other change
--   Alias links (for example policies.carrier 'Foremost Insurance Company Grand
--   Rapids, Michigan' against carriers.name 'Foremost') do not name-match either
--   reference row, so they fall through to the unchanged link-first order.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A. carriers.naic / policies.carrier_naic hygiene
-- -----------------------------------------------------------------------------

-- Blank is not a NAIC. Storing '' makes "no NAIC on file" indistinguishable from
-- "NAIC on file" for every coalesce in the module.
update public.carriers
   set naic = null
 where naic is not null
   and btrim(naic) = '';

update public.policies
   set carrier_naic = null
 where carrier_naic is not null
   and btrim(carrier_naic) = '';

-- Trim non-blank values too, so ' 19879' and '19879' are the same NAIC.
update public.carriers
   set naic = btrim(naic)
 where naic is not null
   and naic <> btrim(naic);

create or replace function public.carriers_normalize_naic()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  new.naic := nullif(btrim(new.naic), '');
  return new;
end;
$fn$;

drop trigger if exists carriers_normalize_naic_tg on public.carriers;
create trigger carriers_normalize_naic_tg
  before insert or update of naic on public.carriers
  for each row execute function public.carriers_normalize_naic();

comment on trigger carriers_normalize_naic_tg on public.carriers is
  'Blank NAIC is stored as null, never as an empty string. An empty string used to short-circuit the NAIC coalesce in get_master_coi and print a blank NAIC box on the ACORD 25 insurer table.';

-- -----------------------------------------------------------------------------
-- B. get_master_coi with the corrected NAIC resolution
-- -----------------------------------------------------------------------------

create or replace function public.get_master_coi(
  p_account_id uuid,
  p_policy_ids uuid[] default null   -- null = auto-select per line (§2.4); else exact set
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, cleanup, extensions
as $$
declare
  c_stale_days constant int := 90;          -- 07 §6 named staleness constant (adjustable)
  c_expiring_soon_days constant int := 30;   -- §2.7 the only date warning window

  v_account          public.accounts%rowtype;
  v_ws_id            uuid;
  v_ws               public.agency_workspaces%rowtype;
  v_producer         jsonb;
  v_dba              text;
  v_named_insured    jsonb;

  v_insurers         jsonb := '[]'::jsonb;
  v_insurer_overflow jsonb := '[]'::jsonb;
  v_lines            jsonb := '{}'::jsonb;
  v_other            jsonb := '[]'::jsonb;
  v_blockers         jsonb := '[]'::jsonb;
  v_warnings         jsonb := '[]'::jsonb;

  v_ops              jsonb;
  v_ops_text         text;
  v_ops_source       text;
  v_ops_prefill      jsonb := '[]'::jsonb;
  v_review           jsonb;
  v_last_reviewed    timestamptz;
  v_last_reviewed_by uuid;
  v_prof_updated     timestamptz;
  v_max_touch        timestamptz;
  v_stale_review     boolean;

  v_letter_map       jsonb := '{}'::jsonb;   -- group_key -> letter (A..F)
  v_selected_ids     uuid[] := array[]::uuid[];   -- all selected-line policy ids (deduped)
  v_ni_mismatch      boolean := false;
  v_rec              record;
  v_line             text;
  v_line_obj         jsonb;
  v_sel_policy_id    uuid;
  v_letter           text;
begin
  -- -------------------------------------------------------------------------
  -- 0) Gate + p_policy_ids validation (§2.2).
  -- -------------------------------------------------------------------------
  if auth.role() is distinct from 'service_role' and not public.is_staff() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  select * into v_account from public.accounts
  where id = p_account_id and deleted_at is null;
  if not found then
    raise exception 'account % not found', p_account_id using errcode = 'P0002';
  end if;

  if p_policy_ids is not null then
    if exists (
      select 1 from unnest(p_policy_ids) pid
      left join public.policies p
             on p.id = pid and p.account_id = p_account_id and p.deleted_at is null
      where p.id is null
    ) then
      raise exception 'policy list contains ids not belonging to account % (or deleted)', p_account_id
        using errcode = '22023';
    end if;
  end if;

  -- -------------------------------------------------------------------------
  -- 1) Workspace + producer block (§6).
  -- -------------------------------------------------------------------------
  v_ws_id := coalesce(
    v_account.agency_workspace_id,
    (select pr.default_agency_workspace_id from public.profiles pr where pr.id = auth.uid()),
    (select id from public.agency_workspaces order by created_at limit 1)
  );
  select * into v_ws from public.agency_workspaces where id = v_ws_id;

  v_producer := (
    with s as (select coalesce(v_ws.settings -> 'coi_producer', '{}'::jsonb) as cp)
    select jsonb_build_object(
      'name',           public.coi_fixed_cell(to_jsonb(coalesce(s.cp ->> 'producer_name', v_ws.name)),
                          case when coalesce(s.cp ->> 'producer_name', v_ws.name) is not null then 'workspace' else 'missing' end),
      'contact_name',   public.coi_fixed_cell(to_jsonb(s.cp ->> 'contact_name'),
                          case when nullif(s.cp ->> 'contact_name','') is not null then 'workspace' else 'missing' end),
      'phone',          public.coi_fixed_cell(to_jsonb(coalesce(s.cp ->> 'phone', v_ws.phone)),
                          case when coalesce(s.cp ->> 'phone', v_ws.phone) is not null then 'workspace' else 'missing' end),
      'fax',            public.coi_fixed_cell(to_jsonb(s.cp ->> 'fax'),
                          case when nullif(s.cp ->> 'fax','') is not null then 'workspace' else 'missing' end),
      'email',          public.coi_fixed_cell(to_jsonb(coalesce(s.cp ->> 'email', v_ws.email)),
                          case when coalesce(s.cp ->> 'email', v_ws.email) is not null then 'workspace' else 'missing' end),
      'address_line1',  public.coi_fixed_cell(to_jsonb(coalesce(s.cp ->> 'address_line1', v_ws.address)),
                          case when coalesce(s.cp ->> 'address_line1', v_ws.address) is not null then 'workspace' else 'missing' end),
      'address_line2',  public.coi_fixed_cell(to_jsonb(s.cp ->> 'address_line2'),
                          case when nullif(s.cp ->> 'address_line2','') is not null then 'workspace' else 'missing' end),
      'city',           public.coi_fixed_cell(to_jsonb(s.cp ->> 'city'),
                          case when nullif(s.cp ->> 'city','') is not null then 'workspace' else 'missing' end),
      'state',          public.coi_fixed_cell(to_jsonb(s.cp ->> 'state'),
                          case when nullif(s.cp ->> 'state','') is not null then 'workspace' else 'missing' end),
      'zip',            public.coi_fixed_cell(to_jsonb(s.cp ->> 'zip'),
                          case when nullif(s.cp ->> 'zip','') is not null then 'workspace' else 'missing' end),
      'license_number', public.coi_fixed_cell(to_jsonb(s.cp ->> 'license_number'),
                          case when nullif(s.cp ->> 'license_number','') is not null then 'workspace' else 'missing' end)
    )
    from s
  );

  if coalesce((v_producer #>> '{name,v}'), '') = '' or coalesce((v_producer #>> '{phone,v}'), '') = '' then
    v_warnings := v_warnings || jsonb_build_object('code','producer_incomplete',
      'message','Producer name or phone is missing');
  end if;

  -- -------------------------------------------------------------------------
  -- 2) Named insured block (§2.6). accounts base + businesses.dba via business_id.
  -- -------------------------------------------------------------------------
  select b.dba into v_dba from public.businesses b where b.id = v_account.business_id;

  v_named_insured := jsonb_build_object(
    'name',          public.coi_fixed_cell(to_jsonb(v_account.name),          case when v_account.name is not null then 'account' else 'missing' end),
    'dba',           public.coi_fixed_cell(to_jsonb(v_dba),                   case when v_dba is not null then 'account' else 'missing' end),
    'address_line1', public.coi_fixed_cell(to_jsonb(v_account.address_line1), case when v_account.address_line1 is not null then 'account' else 'missing' end),
    'address_line2', public.coi_fixed_cell(to_jsonb(v_account.address_line2), case when v_account.address_line2 is not null then 'account' else 'missing' end),
    'city',          public.coi_fixed_cell(to_jsonb(v_account.city),          case when v_account.city is not null then 'account' else 'missing' end),
    'state',         public.coi_fixed_cell(to_jsonb(v_account.state),         case when v_account.state is not null then 'account' else 'missing' end),
    'zip',           public.coi_fixed_cell(to_jsonb(v_account.zip_code),      case when v_account.zip_code is not null then 'account' else 'missing' end),
    'policy_named_insured_mismatch', to_jsonb(false)   -- overwritten below if a selected policy disagrees
  );

  -- -------------------------------------------------------------------------
  -- 3) Candidate + selection + insurer resolution + letter groups, in ONE pass.
  --    Materialized into a TEMP table (ON COMMIT DROP) so the per-line loop and the
  --    readiness pass can both read it. Named uniquely-per-call is unnecessary: the
  --    function runs to completion within one statement's snapshot; if generate-cert
  --    calls twice in one txn, the second create replaces cleanly after drop.
  -- -------------------------------------------------------------------------
  drop table if exists _mc_sel;
  create temporary table _mc_sel on commit drop as
  with expanded as (
    -- Every (line, policy) candidate among the 5 canonical lines. When p_policy_ids
    -- is given, restrict candidates to that set (each matches on every line it feeds).
    select
      ln.line,
      p.id as policy_id,
      p.status,
      p.policy_number,
      p.carrier,
      p.carrier_id,
      p.carrier_naic,
      p.effective_date,
      p.expiration_date,
      p.created_at,
      p.updated_at,
      (p.expiration_date is not null and p.expiration_date < current_date) as expired,
      -- extraction identity from the line's blob (carrier_name/carrier_naic) for §5.2
      case ln.line
        when 'gl'       then p.cgl_details
        when 'auto'     then p.bap_details
        when 'umbrella' then p.umbrella_details
        when 'wc'       then p.wc_details
        when 'property' then p.property_details
      end as blob
    from public.policies p
    cross join lateral unnest(public.master_coi_lines(p)) as ln(line)
    where p.account_id = p_account_id
      and p.deleted_at is null
      and ln.line = any(array['gl','auto','umbrella','wc','property'])
      and (p_policy_ids is null or p.id = any(p_policy_ids))
  ),
  ranked as (
    -- §2.4 selection order: active first, latest expiration (nulls last), latest created.
    select e.*,
      row_number() over (
        partition by e.line
        order by (e.status = 'active') desc,
                 e.expiration_date desc nulls last,
                 e.created_at desc
      ) as sel_rank
    from expanded e
  ),
  selected as (
    -- When p_policy_ids is given every candidate is selected (§2.4); else rank 1 only.
    select r.*
    from ranked r
    where (p_policy_ids is not null) or r.sel_rank = 1
  ),
  resolved as (
    -- Carrier resolution + §5.2 name/NAIC precedence per selected (line,policy).
    select
      s.*,
      rc.carrier_id  as rc_carrier_id,
      rc.carrier_name as rc_name,
      rc.naic        as rc_naic,
      rc.match_type  as rc_match_type,
      cc.name        as cid_name,
      cc.naic        as cid_naic
    from selected s
    left join lateral public.resolve_carrier(s.carrier) rc on true
    left join public.carriers cc on cc.id = s.carrier_id
  ),
  named as (
    -- Display name on its own first, so the NAIC rules below can compare each
    -- reference carrier against the name the certificate will actually print.
    select
      r.*,
      -- display name precedence: blob identity.carrier_name -> policies.carrier -> carriers.name
      coalesce(
        nullif(btrim(r.blob #>> '{identity,carrier_name}'), ''),
        nullif(btrim(r.carrier), ''),
        nullif(btrim(r.cid_name), ''),
        nullif(btrim(r.rc_name), '')
      ) as display_name,
      case
        when nullif(btrim(r.blob #>> '{identity,carrier_name}'),'') is not null then 'extracted'
        when nullif(btrim(r.carrier),'') is not null then 'manual'
        else 'reference'
      end as name_src
    from resolved r
  ),
  identified as (
    select
      n.*,
      -- NAIC precedence (2026-09-02):
      --   1. policies.carrier_naic          (a human typed it on the policy)
      --   2. the line blob's extracted identity.carrier_naic
      --   3. the reference carrier whose NAME matches the printed insurer name,
      --      the carriers.id link first, then the name-resolved carrier
      --   4. whatever reference NAIC is left, link first
      -- Two changes vs the original coalesce, both required by the Donald Roberts
      -- Masonry LLC case:
      --   * Every reference value is btrim/nullif'd. carriers.naic is nullable
      --     text and the Carriers form wrote blanks as '', which is not a NAIC.
      --     An '' short-circuited the coalesce, so the insurer table printed an
      --     empty NAIC box labelled "reference" instead of falling through to a
      --     carrier that does have one.
      --   * A policy can be linked (carrier_id) to the wholesaler while
      --     policies.carrier names the issuing carrier. The certificate prints
      --     the issuing carrier, so that carriers row is the one that owns the
      --     NAIC. Name-matched reference wins; everything else keeps the old
      --     link-first order, so alias links (policies.carrier holding the long
      --     legal name against a short carriers.name) behave exactly as before.
      coalesce(
        nullif(btrim(n.carrier_naic), ''),
        nullif(btrim(n.blob #>> '{identity,carrier_naic}'), ''),
        case when public.normalize_entity_name(coalesce(n.cid_name, ''))
                = public.normalize_entity_name(coalesce(n.display_name, ''))
             then nullif(btrim(n.cid_naic), '') end,
        case when public.normalize_entity_name(coalesce(n.rc_name, ''))
                = public.normalize_entity_name(coalesce(n.display_name, ''))
             then nullif(btrim(n.rc_naic), '') end,
        nullif(btrim(n.cid_naic), ''),
        nullif(btrim(n.rc_naic), '')
      ) as naic,
      case
        when nullif(btrim(n.carrier_naic),'') is not null then 'manual'
        when nullif(btrim(n.blob #>> '{identity,carrier_naic}'),'') is not null then 'extracted'
        when coalesce(nullif(btrim(n.cid_naic),''), nullif(btrim(n.rc_naic),'')) is not null then 'reference'
        else 'missing'
      end as naic_src,
      -- naic mismatch flag: typed carrier_naic and extracted identity.carrier_naic both present and differ
      (nullif(btrim(n.carrier_naic),'') is not null
        and nullif(btrim(n.blob #>> '{identity,carrier_naic}'),'') is not null
        and nullif(btrim(n.carrier_naic),'') <> nullif(btrim(n.blob #>> '{identity,carrier_naic}'),'')) as naic_mismatch,
      -- resolution label for the insurer object
      case
        when n.carrier_id is not null then 'carrier_id'
        when n.rc_match_type is not null then n.rc_match_type
        else 'unresolved'
      end as resolution,
      -- Broken link cue: policies.carrier_id points at one carriers row while
      -- policies.carrier resolves to a different one (the wholesaler is on the
      -- link, the issuing carrier is in the text). The certificate prints the
      -- text, so this is a warning rather than a blocker, but staff must see it.
      (n.carrier_id is not null
        and n.rc_carrier_id is not null
        and n.rc_carrier_id <> n.carrier_id) as carrier_link_mismatch,
      -- carrier grouping id (carrier_id when present else null; letter split uses name+naic below)
      n.carrier_id as grp_carrier_id
    from named n
  ),
  keyed as (
    -- §5.4 group key part 1: carrier_id when present; else name-normalized. The NAIC
    -- split is applied in `grouped` using the per-name-group distinct-NAIC count below.
    select i.*,
      case when i.grp_carrier_id is not null
           then 'cid:' || i.grp_carrier_id::text
           else 'name:' || public.normalize_entity_name(coalesce(i.display_name,'')) end as name_key
    from identified i
  ),
  naic_counts as (
    -- Distinct non-null NAICs per name_key, computed with a real GROUP BY (Postgres
    -- forbids DISTINCT inside a window function, so this cannot be an OVER() count).
    select k.name_key, count(distinct k.naic) filter (where k.naic is not null) as distinct_naics_in_name
    from keyed k
    group by k.name_key
  ),
  grouped as (
    -- Final group key. For name-keyed rows with >=2 distinct non-null NAICs, split by
    -- NAIC (each distinct NAIC + a null-NAIC bucket). carrier_id groups are never split.
    select k.*,
      nc.distinct_naics_in_name,
      case
        when k.grp_carrier_id is not null then k.name_key
        when nc.distinct_naics_in_name >= 2 then k.name_key || '|naic:' || coalesce(k.naic, '_null_')
        else k.name_key
      end as group_key,
      -- canonical line order index for first-appearance ranking
      case k.line when 'gl' then 1 when 'auto' then 2 when 'umbrella' then 3
                  when 'wc' then 4 when 'property' then 5 else 6 end as line_ord
    from keyed k
    join naic_counts nc on nc.name_key = k.name_key
  ),
  with_group_order as (
    -- Per group, its first-appearance sort key = the minimal (line_ord, policy_number
    -- nulls-last-sentinel, policy_id) across the group's selected rows. Computed as a
    -- window min over a zero-padded composite text key so a single ordered comparison
    -- captures "canonical line order, then policy_number asc nulls last, then id asc".
    select g.*,
      min(
        lpad(g.line_ord::text, 2, '0')
        || '|' || coalesce(g.policy_number, chr(255))   -- chr(255) sorts after normal text -> nulls last
        || '|' || g.policy_id::text
      ) over (partition by g.group_key) as group_sort_key
    from grouped g
  )
  select
    w.line, w.policy_id, w.status, w.policy_number, w.expired,
    w.expiration_date, w.created_at, w.updated_at,
    w.display_name, w.name_src, w.naic, w.naic_src, w.naic_mismatch,
    w.carrier_link_mismatch, w.cid_name as link_name,
    w.resolution, w.grp_carrier_id, w.group_key, w.line_ord,
    -- first-appearance rank of each distinct group across the canonical iteration
    dense_rank() over (order by w.group_sort_key) as group_rank,
    (w.status = 'active') as is_active
  from with_group_order w;

  -- ALL candidates per line (not just the selected one) for the §2.4 candidates[]
  -- lists. Carrier resolution is unnecessary here, so this stays cheap.
  drop table if exists _mc_cand;
  create temporary table _mc_cand on commit drop as
  select
    ln.line,
    p.id as policy_id,
    p.status,
    p.policy_number,
    p.created_at,
    p.expiration_date,
    (p.expiration_date is not null and p.expiration_date < current_date) as expired
  from public.policies p
  cross join lateral unnest(public.master_coi_lines(p)) as ln(line)
  where p.account_id = p_account_id
    and p.deleted_at is null
    and ln.line = any(array['gl','auto','umbrella','wc','property'])
    and (p_policy_ids is null or p.id = any(p_policy_ids));

  -- -------------------------------------------------------------------------
  -- 4) Letter map + insurers[] + insurer_overflow[] (§5.4). One group == one letter.
  --    Groups with rank 1..6 -> A..F; rank >= 7 -> overflow (blocker).
  -- -------------------------------------------------------------------------
  select coalesce(jsonb_object_agg(gk.group_key, chr(64 + gk.group_rank::int)), '{}'::jsonb)
    into v_letter_map
  from (select distinct group_key, group_rank from _mc_sel where group_rank <= 6) gk;

  -- insurers A..F: one object per group (rank<=6), aggregating the group's lines + policy_ids.
  select coalesce(jsonb_agg(ins order by ins->>'letter'), '[]'::jsonb)
    into v_insurers
  from (
    select jsonb_build_object(
      'letter', chr(64 + s.group_rank::int),
      'name', public.coi_fixed_cell(to_jsonb(max(s.display_name)),
                case when max(s.display_name) is not null then max(s.name_src) else 'missing' end),
      'naic', public.coi_fixed_cell(to_jsonb(max(s.naic)),
                case when max(s.naic) is not null then max(s.naic_src) else 'missing' end,
                case when bool_or(s.naic_src = 'manual') then 'carrier_naic' else null end),
      -- grp_carrier_id is constant within a group; pick one (no max(uuid) in Postgres).
      'carrier_id', to_jsonb((array_agg(s.grp_carrier_id))[1]),
      'resolution', max(s.resolution),
      -- DISTINCT first (subquery), then aggregate in canonical line order. A single
      -- `jsonb_agg(distinct .. order by <case>)` is illegal (ORDER BY expr must be in
      -- the arg list when DISTINCT is present), hence the two-step.
      'lines', (select coalesce(jsonb_agg(dl.line order by dl.ord), '[]'::jsonb)
                from (select distinct sl.line,
                             case sl.line when 'gl' then 1 when 'auto' then 2 when 'umbrella' then 3
                                          when 'wc' then 4 when 'property' then 5 else 6 end as ord
                      from _mc_sel sl where sl.group_key = s.group_key) dl),
      'policy_ids', (select coalesce(jsonb_agg(distinct sp.policy_id), '[]'::jsonb)
                     from _mc_sel sp where sp.group_key = s.group_key)
    ) as ins
    from _mc_sel s
    where s.group_rank <= 6
    group by s.group_key, s.group_rank
  ) x;

  -- insurer_overflow[]: same shape minus letter, for the 7th+ distinct group.
  select coalesce(jsonb_agg(ovf order by ovf->>'name'), '[]'::jsonb)
    into v_insurer_overflow
  from (
    select jsonb_build_object(
      'name', public.coi_fixed_cell(to_jsonb(max(s.display_name)),
                case when max(s.display_name) is not null then max(s.name_src) else 'missing' end),
      'naic', public.coi_fixed_cell(to_jsonb(max(s.naic)),
                case when max(s.naic) is not null then max(s.naic_src) else 'missing' end),
      -- grp_carrier_id is constant within a group; pick one (no max(uuid) in Postgres).
      'carrier_id', to_jsonb((array_agg(s.grp_carrier_id))[1]),
      'resolution', max(s.resolution),
      'lines', (select coalesce(jsonb_agg(distinct sl.line), '[]'::jsonb) from _mc_sel sl where sl.group_key = s.group_key),
      'policy_ids', (select coalesce(jsonb_agg(distinct sp.policy_id), '[]'::jsonb) from _mc_sel sp where sp.group_key = s.group_key)
    ) as ovf
    from _mc_sel s
    where s.group_rank >= 7
    group by s.group_key
  ) y;

  if jsonb_array_length(v_insurer_overflow) > 0 then
    v_blockers := v_blockers || jsonb_build_object(
      'code','insurer_overflow',
      'message','More than six distinct insurers across the selected lines. ACORD 25 has six insurer rows; deselect a line or issue two certificates');
  end if;

  -- collect selected policy ids (deduped) for the review-staleness scan
  select coalesce(array_agg(distinct policy_id), array[]::uuid[]) into v_selected_ids from _mc_sel;

  -- -------------------------------------------------------------------------
  -- 5) Per-line objects (§2.6). For each canonical line: the selected policy (if any)
  --    -> coi_build_line + insurer_letter + candidates; else the full absent skeleton.
  --    Readiness blockers/warnings are accumulated here per selected line (§2.7).
  -- -------------------------------------------------------------------------
  foreach v_line in array array['gl','auto','umbrella','wc','property']
  loop
    -- The selected policy for this line (sel_rank=1 in ranked; here: the row for this
    -- line in _mc_sel with the best selection order). When p_policy_ids is passed there
    -- may be several selected on one line; pick the same canonical winner for the line
    -- header cells, but candidates lists them all.
    select s.* into v_rec
    from _mc_sel s
    where s.line = v_line
    order by (s.status = 'active') desc, s.expiration_date desc nulls last, s.created_at desc
    limit 1;

    if not found then
      -- absent line skeleton (present:false, missing cells). Shape mirrors coi_build_line
      -- for a line with no policy: the caller-side minimal skeleton.
      v_line_obj := jsonb_build_object(
        'present', false,
        'policy_id', null,
        'insurer_letter', null,
        'status', null,
        'expired', false,
        'policy_number',   public.coi_fixed_cell('null'::jsonb, 'missing', null),
        'effective_date',  public.coi_fixed_cell('null'::jsonb, 'missing', null),
        'expiration_date', public.coi_fixed_cell('null'::jsonb, 'missing', null),
        'candidates', '[]'::jsonb
      );
      -- attach an empty additional_insureds / subrogation_waivers per line kind so the
      -- panel grid is stable.
      if v_line = 'wc' then
        v_line_obj := v_line_obj || jsonb_build_object('subrogation_waivers', '[]'::jsonb);
      else
        v_line_obj := v_line_obj || jsonb_build_object('additional_insureds', '[]'::jsonb);
      end if;
      v_lines := v_lines || jsonb_build_object(v_line, v_line_obj);
      continue;
    end if;

    v_sel_policy_id := v_rec.policy_id;
    v_letter := v_letter_map ->> v_rec.group_key;   -- null if this group overflowed

    -- Build the coverage object for the selected policy, then inject letter + candidates.
    v_line_obj := public.coi_build_line(v_sel_policy_id, v_line);
    v_line_obj := v_line_obj
      || jsonb_build_object('insurer_letter', to_jsonb(v_letter))
      || jsonb_build_object('candidates', (
            select coalesce(jsonb_agg(jsonb_build_object(
                     'policy_id', c.policy_id,
                     'policy_number', c.policy_number,
                     'status', c.status,
                     'expiration_date', c.expiration_date,
                     'expired', c.expired,
                     'selected', exists (select 1 from _mc_sel s2 where s2.line = v_line and s2.policy_id = c.policy_id)
                   ) order by (c.status='active') desc, c.expiration_date desc nulls last, c.created_at desc),
                   '[]'::jsonb)
            from _mc_cand c where c.line = v_line
         ));

    v_lines := v_lines || jsonb_build_object(v_line, v_line_obj);
  end loop;

  -- -------------------------------------------------------------------------
  -- 6) Unclassified 'other' policies (§2.6 lines.other[]) so nothing disappears.
  -- -------------------------------------------------------------------------
  select coalesce(jsonb_agg(jsonb_build_object(
      'policy_id', p.id,
      'policy_number', p.policy_number,
      'line_of_business', p.line_of_business,
      'line_canonical', p.line_canonical,
      'carrier', p.carrier,
      'status', p.status,
      'effective_date', p.effective_date,
      'expiration_date', p.expiration_date
    ) order by p.created_at desc), '[]'::jsonb)
    into v_other
  from public.policies p
  where p.account_id = p_account_id
    and p.deleted_at is null
    and (p_policy_ids is null or p.id = any(p_policy_ids))
    and 'other' = any(public.master_coi_lines(p));

  -- -------------------------------------------------------------------------
  -- 7) Description of operations (§7) + read-only prefill candidates. NO tier reads
  --    certificates_of_insurance (R13); ops_source vocabulary has no 'legacy'.
  -- -------------------------------------------------------------------------
  select acp.description_of_operations, acp.ops_source, acp.last_reviewed_at, acp.last_reviewed_by, acp.updated_at
    into v_ops_text, v_ops_source, v_last_reviewed, v_last_reviewed_by, v_prof_updated
  from public.account_coi_profiles acp where acp.account_id = p_account_id;

  -- canopy prefill: newest non-empty canopy_business_operations.description_of_operations
  --   via canopy_business_operations.policy_id -> canopy_policies.pull_id -> canopy_pulls.account_id
  --   Each UNION ALL branch is parenthesized because each carries its own ORDER BY/LIMIT
  --   (a bare `... order by .. limit 1 union all ..` is a syntax error in Postgres).
  v_ops_prefill := (
    select coalesce(jsonb_agg(cand order by cand->>'source'), '[]'::jsonb)
    from (
      (
        select jsonb_build_object('source','canopy','text', cbo.description_of_operations) as cand
        from public.canopy_business_operations cbo
        join public.canopy_policies cp on cp.id = cbo.policy_id
        join public.canopy_pulls    cpull on cpull.id = cp.pull_id
        where cpull.account_id = p_account_id
          and nullif(btrim(coalesce(cbo.description_of_operations,'')),'') is not null
        order by coalesce(cbo.updated_at, cbo.created_at) desc
        limit 1
      )
      union all
      -- bap_risk_context: bap_details.risk_context.business_description from any auto policy
      (
        select jsonb_build_object('source','bap_risk_context','text', bd.business_description) as cand
        from (
          select nullif(btrim(p.bap_details #>> '{risk_context,business_description}'),'') as business_description
          from public.policies p
          where p.account_id = p_account_id and p.deleted_at is null
            and nullif(btrim(p.bap_details #>> '{risk_context,business_description}'),'') is not null
          order by p.updated_at desc
          limit 1
        ) bd
        where bd.business_description is not null
      )
    ) prefills
  );

  v_ops := jsonb_build_object(
    'v', v_ops_text,
    'src', coalesce(v_ops_source, 'missing'),
    'prefill_candidates', v_ops_prefill
  );

  if nullif(btrim(coalesce(v_ops_text,'')),'') is null then
    v_warnings := v_warnings || jsonb_build_object('code','ops_missing','message','Description of operations is empty');
  end if;

  -- -------------------------------------------------------------------------
  -- 8) Review stamp + staleness (§8.3). stale when any contributing updated_at
  --    (policies, the AI tables, wc waivers, the profile) is later than last_reviewed_at,
  --    or never reviewed.
  -- -------------------------------------------------------------------------
  select greatest(
           coalesce(max(p.updated_at), 'epoch'::timestamptz),
           coalesce((select max(r.updated_at) from public.policy_cgl_additional_insureds r where r.policy_id = any(v_selected_ids)), 'epoch'::timestamptz),
           coalesce((select max(r.updated_at) from public.policy_umbrella_additional_insureds r where r.policy_id = any(v_selected_ids)), 'epoch'::timestamptz),
           coalesce((select max(r.updated_at) from public.policy_bap_interests r where r.policy_id = any(v_selected_ids)), 'epoch'::timestamptz),
           coalesce((select max(r.updated_at) from public.policy_property_interests r where r.policy_id = any(v_selected_ids)), 'epoch'::timestamptz),
           coalesce((select max(r.updated_at) from public.policy_wc_subrogation_waivers r where r.policy_id = any(v_selected_ids)), 'epoch'::timestamptz),
           coalesce(v_prof_updated, 'epoch'::timestamptz)
         )
    into v_max_touch
  from public.policies p where p.id = any(v_selected_ids);

  v_stale_review := (v_last_reviewed is null) or (v_max_touch is not null and v_max_touch > v_last_reviewed);

  v_review := jsonb_build_object(
    'last_reviewed_at', v_last_reviewed,
    'last_reviewed_by', v_last_reviewed_by,
    'stale', v_stale_review
  );

  if v_stale_review then
    v_warnings := v_warnings || jsonb_build_object('code','review_stale','message','Policy data changed after the last Master COI review');
  end if;
  if jsonb_array_length(v_other) > 0 then
    v_warnings := v_warnings || jsonb_build_object('code','unclassified_policies','message', (jsonb_array_length(v_other))::text || ' policy(ies) are not classified into an ACORD 25 line');
  end if;

  -- -------------------------------------------------------------------------
  -- 9) Readiness blockers (§2.7). Computed over the SELECTED lines (_mc_sel) and the
  --    built v_lines cells. ready = (no blockers).
  -- -------------------------------------------------------------------------

  -- no_lines: nothing classified into any of the five lines.
  if not exists (select 1 from _mc_sel) then
    v_blockers := v_blockers || jsonb_build_object('code','no_lines','message','No policy is classified into any ACORD 25 line');
  end if;

  -- policy_core_missing + policy_expired + policy_expiring_soon over selected policies.
  for v_rec in
    select distinct s.line, s.policy_id, s.policy_number, s.status, s.expired, s.expiration_date
    from _mc_sel s
  loop
    -- core fields from the policy row
    if exists (
      select 1 from public.policies p
      where p.id = v_rec.policy_id
        and (nullif(btrim(coalesce(p.policy_number,'')),'') is null
             or p.effective_date is null or p.expiration_date is null)
    ) then
      v_blockers := v_blockers || jsonb_build_object('code','policy_core_missing','line', v_rec.line,
        'message','Policy ' || coalesce(v_rec.policy_number,'(no number)') || ' is missing policy number, effective date, or expiration date');
    end if;
    if v_rec.expired then
      v_blockers := v_blockers || jsonb_build_object('code','policy_expired','line', v_rec.line,
        'message', upper(v_rec.line) || ' policy ' || coalesce(v_rec.policy_number,'') || ' expired ' || coalesce(v_rec.expiration_date::text,''));
    elsif v_rec.expiration_date is not null and v_rec.expiration_date <= current_date + (c_expiring_soon_days || ' days')::interval then
      v_warnings := v_warnings || jsonb_build_object('code','policy_expiring_soon','line', v_rec.line,
        'message', upper(v_rec.line) || ' policy expires in ' || (v_rec.expiration_date - current_date)::text || ' days');
    end if;
  end loop;

  -- insurer_unresolved: a selected line's carrier resolves to NO name at all.
  if exists (select 1 from _mc_sel s where nullif(btrim(coalesce(s.display_name,'')),'') is null) then
    for v_rec in
      select distinct s.line, s.policy_number
      from _mc_sel s where nullif(btrim(coalesce(s.display_name,'')),'') is null
    loop
      v_blockers := v_blockers || jsonb_build_object('code','insurer_unresolved','line', v_rec.line,
        'message','Carrier for ' || upper(v_rec.line) || ' policy ' || coalesce(v_rec.policy_number,'') || ' does not resolve to an insurer name');
    end loop;
  end if;

  -- limit_missing (§2.7): a required registry path is null on a selected line. Auto is
  -- special: ready when csl present OR the full split set present.
  --   gl: each_occurrence AND general_aggregate
  --   umbrella: each_occurrence   |   wc: all three EL limits
  -- Read the built cell values from v_lines so this matches exactly what the panel shows.
  if (v_lines #> '{gl,present}') = to_jsonb(true) then
    if (v_lines #>> '{gl,limits,each_occurrence,v}') is null then
      v_blockers := v_blockers || jsonb_build_object('code','limit_missing','line','gl','path','cgl_details.limits.each_occurrence','message','GL Each Occurrence limit is empty');
    end if;
    if (v_lines #>> '{gl,limits,general_aggregate,v}') is null then
      v_blockers := v_blockers || jsonb_build_object('code','limit_missing','line','gl','path','cgl_details.limits.general_aggregate','message','GL General Aggregate limit is empty');
    end if;
  end if;
  if (v_lines #> '{auto,present}') = to_jsonb(true) then
    if (v_lines #>> '{auto,csl,v}') is null
       and not ((v_lines #>> '{auto,bi_per_person,v}') is not null
                and (v_lines #>> '{auto,bi_per_accident,v}') is not null
                and (v_lines #>> '{auto,pd_per_accident,v}') is not null) then
      v_blockers := v_blockers || jsonb_build_object('code','limit_missing','line','auto','path','bap_details.coverage.liability.csl_limit','message','Auto liability limit is empty (need CSL or the full split set)');
    end if;
  end if;
  if (v_lines #> '{umbrella,present}') = to_jsonb(true) then
    if (v_lines #>> '{umbrella,each_occurrence,v}') is null then
      v_blockers := v_blockers || jsonb_build_object('code','limit_missing','line','umbrella','path','umbrella_details.limits.per_occurrence','message','Umbrella Each Occurrence limit is empty');
    end if;
  end if;
  if (v_lines #> '{wc,present}') = to_jsonb(true) then
    if (v_lines #>> '{wc,el_each_accident,v}') is null then
      v_blockers := v_blockers || jsonb_build_object('code','limit_missing','line','wc','path','wc_details.coverage.part_two_employers_liability.each_accident','message','WC EL Each Accident limit is empty');
    end if;
    if (v_lines #>> '{wc,el_disease_each_employee,v}') is null then
      v_blockers := v_blockers || jsonb_build_object('code','limit_missing','line','wc','path','wc_details.coverage.part_two_employers_liability.disease_each_employee','message','WC EL Disease Each Employee limit is empty');
    end if;
    if (v_lines #>> '{wc,el_disease_policy_limit,v}') is null then
      v_blockers := v_blockers || jsonb_build_object('code','limit_missing','line','wc','path','wc_details.coverage.part_two_employers_liability.disease_policy_limit','message','WC EL Disease Policy Limit is empty');
    end if;
  end if;

  -- naic_missing / naic_mismatch warnings from the insurer table.
  for v_rec in
    select (ins->>'letter') as letter, (ins #>> '{naic,v}') as naic_v, (ins #>> '{naic,flag}') as naic_flag,
           (ins #>> '{name,v}') as insurer_name
    from jsonb_array_elements(v_insurers) ins
  loop
    if nullif(btrim(coalesce(v_rec.naic_v,'')),'') is null then
      -- Name the insurer and say where to fix it. A blank NAIC box on the ACORD
      -- preview is otherwise indistinguishable from a bug.
      v_warnings := v_warnings || jsonb_build_object('code','naic_missing','message',
        'Insurer ' || v_rec.letter
        || ' (' || coalesce(nullif(btrim(coalesce(v_rec.insurer_name,'')),''), 'unnamed') || ')'
        || ' has no NAIC code. Add it on the Carriers page.');
    end if;
    if v_rec.naic_flag = 'mismatch' then
      v_warnings := v_warnings || jsonb_build_object('code','naic_mismatch','message','Insurer ' || v_rec.letter || ' NAIC differs between the manual value and the extracted value');
    end if;
  end loop;

  -- carrier_link_mismatch: the policy's carrier_id row is a different carrier
  -- from the one the certificate prints. Harmless when it is the wholesaler on
  -- the link, wrong when the link is simply stale, and either way it explains
  -- why the NAIC comes from a carriers row other than the linked one.
  for v_rec in
    select distinct s.line, s.policy_number, s.display_name, s.link_name
    from _mc_sel s
    where s.carrier_link_mismatch
    order by s.line
  loop
    v_warnings := v_warnings || jsonb_build_object('code','carrier_link_mismatch','line', v_rec.line,
      'message', upper(v_rec.line) || ' policy ' || coalesce(v_rec.policy_number,'(no number)')
        || ' is linked to the carrier record ' || coalesce(nullif(btrim(coalesce(v_rec.link_name,'')),''),'(none)')
        || ' but names ' || coalesce(nullif(btrim(coalesce(v_rec.display_name,'')),''),'(none)')
        || '. The certificate prints ' || coalesce(nullif(btrim(coalesce(v_rec.display_name,'')),''),'(none)')
        || ' and takes its NAIC from that carrier record.');
  end loop;

  -- endorsement_requested + manual_overwritten by scanning the built lines.
  if exists (
    select 1 from jsonb_each(v_lines) le,
         lateral jsonb_array_elements(coalesce(le.value->'additional_insureds','[]'::jsonb)) ai
    where ai->>'endorsement_status' = 'requested'
  ) or exists (
    select 1 from jsonb_array_elements(coalesce(v_lines #> '{wc,subrogation_waivers}','[]'::jsonb)) w
    where w->>'endorsement_status' = 'requested'
  ) then
    v_warnings := v_warnings || jsonb_build_object('code','endorsement_requested','message','One or more additional insureds are requested but not yet endorsed');
  end if;

  if exists (
    select 1
    from jsonb_each(v_lines) le
    where jsonb_typeof(le.value) = 'object'
      and (
        exists (
          select 1 from jsonb_each(le.value) cell
          where jsonb_typeof(cell.value) = 'object' and (cell.value->>'flag') = 'overwritten_manual'
        )
        or exists (
          select 1 from jsonb_each(coalesce(le.value->'limits','{}'::jsonb)) lc
          where jsonb_typeof(lc.value) = 'object' and (lc.value->>'flag') = 'overwritten_manual'
        )
      )
  ) then
    v_warnings := v_warnings || jsonb_build_object('code','manual_overwritten','message','A manual value was overwritten by a later extraction; review and restore if needed');
  end if;

  -- named_insured_mismatch (§2.7): policies.named_insured or identity.named_insured
  -- disagrees with accounts.name (normalized compare).
  if exists (
    select 1 from public.policies p
    where p.id = any(v_selected_ids)
      and (
        (nullif(btrim(coalesce(p.named_insured,'')),'') is not null
          and public.normalize_entity_name(p.named_insured) <> public.normalize_entity_name(v_account.name))
        or (nullif(btrim(coalesce(p.cgl_details      #>> '{identity,named_insured}','')),'') is not null and public.normalize_entity_name(p.cgl_details      #>> '{identity,named_insured}') <> public.normalize_entity_name(v_account.name))
        or (nullif(btrim(coalesce(p.bap_details      #>> '{identity,named_insured}','')),'') is not null and public.normalize_entity_name(p.bap_details      #>> '{identity,named_insured}') <> public.normalize_entity_name(v_account.name))
        or (nullif(btrim(coalesce(p.umbrella_details #>> '{identity,named_insured}','')),'') is not null and public.normalize_entity_name(p.umbrella_details #>> '{identity,named_insured}') <> public.normalize_entity_name(v_account.name))
        or (nullif(btrim(coalesce(p.wc_details       #>> '{identity,named_insured}','')),'') is not null and public.normalize_entity_name(p.wc_details       #>> '{identity,named_insured}') <> public.normalize_entity_name(v_account.name))
        or (nullif(btrim(coalesce(p.property_details #>> '{identity,named_insured}','')),'') is not null and public.normalize_entity_name(p.property_details #>> '{identity,named_insured}') <> public.normalize_entity_name(v_account.name))
      )
  ) then
    v_ni_mismatch := true;
    v_warnings := v_warnings || jsonb_build_object('code','named_insured_mismatch','message','A policy named insured differs from the account name');
  end if;
  v_named_insured := jsonb_set(v_named_insured, array['policy_named_insured_mismatch'], to_jsonb(v_ni_mismatch));

  -- source_data_stale (07 §6): per selected line, EVERY load-bearing cell src='extracted'
  -- AND the newest extraction/Canopy-pull timestamp for that policy is older than 90 days.
  -- Load-bearing = that line's required_for_ready registry paths. property has none, so
  -- property never emits this warning. A manual edit to any load-bearing cell flips the
  -- line off (its src becomes 'manual').
  declare
    v_pol_id uuid;
    v_ts     timestamptz;
    v_all_ext boolean;
  begin
    -- GL: each_occurrence + general_aggregate
    if (v_lines #> '{gl,present}') = to_jsonb(true) then
      v_pol_id := (v_lines #>> '{gl,policy_id}')::uuid;
      v_all_ext := (v_lines #>> '{gl,limits,each_occurrence,src}') = 'extracted'
               and (v_lines #>> '{gl,limits,general_aggregate,src}') = 'extracted';
      if v_all_ext then
        select greatest(coalesce(p.updated_at,'epoch'::timestamptz),
                        coalesce((select max(cpull.completed_at) from public.canopy_business_operations cbo
                                    join public.canopy_policies cp on cp.id = cbo.policy_id
                                    join public.canopy_pulls cpull on cpull.id = cp.pull_id
                                   where cbo.policy_id = v_pol_id or cpull.account_id = p_account_id), 'epoch'::timestamptz))
          into v_ts from public.policies p where p.id = v_pol_id;
        if v_ts < now() - (c_stale_days || ' days')::interval then
          v_warnings := v_warnings || jsonb_build_object('code','source_data_stale','line','gl',
            'message','GL data is from an extraction ' || floor(extract(epoch from (now() - v_ts))/86400)::text || ' days old');
        end if;
      end if;
    end if;
    -- AUTO: csl (the required path)
    if (v_lines #> '{auto,present}') = to_jsonb(true) then
      v_pol_id := (v_lines #>> '{auto,policy_id}')::uuid;
      v_all_ext := (v_lines #>> '{auto,csl,src}') = 'extracted';
      if v_all_ext then
        select coalesce(p.updated_at,'epoch'::timestamptz) into v_ts from public.policies p where p.id = v_pol_id;
        if v_ts < now() - (c_stale_days || ' days')::interval then
          v_warnings := v_warnings || jsonb_build_object('code','source_data_stale','line','auto',
            'message','Auto data is from an extraction ' || floor(extract(epoch from (now() - v_ts))/86400)::text || ' days old');
        end if;
      end if;
    end if;
    -- UMBRELLA: each_occurrence
    if (v_lines #> '{umbrella,present}') = to_jsonb(true) then
      v_pol_id := (v_lines #>> '{umbrella,policy_id}')::uuid;
      v_all_ext := (v_lines #>> '{umbrella,each_occurrence,src}') = 'extracted';
      if v_all_ext then
        select coalesce(p.updated_at,'epoch'::timestamptz) into v_ts from public.policies p where p.id = v_pol_id;
        if v_ts < now() - (c_stale_days || ' days')::interval then
          v_warnings := v_warnings || jsonb_build_object('code','source_data_stale','line','umbrella',
            'message','Umbrella data is from an extraction ' || floor(extract(epoch from (now() - v_ts))/86400)::text || ' days old');
        end if;
      end if;
    end if;
    -- WC: all three EL limits
    if (v_lines #> '{wc,present}') = to_jsonb(true) then
      v_pol_id := (v_lines #>> '{wc,policy_id}')::uuid;
      v_all_ext := (v_lines #>> '{wc,el_each_accident,src}') = 'extracted'
               and (v_lines #>> '{wc,el_disease_each_employee,src}') = 'extracted'
               and (v_lines #>> '{wc,el_disease_policy_limit,src}') = 'extracted';
      if v_all_ext then
        select coalesce(p.updated_at,'epoch'::timestamptz) into v_ts from public.policies p where p.id = v_pol_id;
        if v_ts < now() - (c_stale_days || ' days')::interval then
          v_warnings := v_warnings || jsonb_build_object('code','source_data_stale','line','wc',
            'message','WC data is from an extraction ' || floor(extract(epoch from (now() - v_ts))/86400)::text || ' days old');
        end if;
      end if;
    end if;
  end;

  -- -------------------------------------------------------------------------
  -- 10) Final self-contained document (§2.6). Snapshot-ready.
  -- -------------------------------------------------------------------------
  return jsonb_build_object(
    'version', 1,
    'generated_at', now(),
    'account_id', p_account_id,
    'named_insured', v_named_insured,
    'producer', v_producer,
    'insurers', v_insurers,
    'insurer_overflow', v_insurer_overflow,
    'lines', v_lines || jsonb_build_object('other', v_other),
    'description_of_operations', v_ops,
    'review', v_review,
    'readiness', jsonb_build_object(
      'ready', (jsonb_array_length(v_blockers) = 0),
      'blockers', v_blockers,
      'warnings', v_warnings
    )
  );
end $$;


revoke execute on function public.get_master_coi(uuid, uuid[]) from anon, public;
grant  execute on function public.get_master_coi(uuid, uuid[]) to authenticated, service_role;
