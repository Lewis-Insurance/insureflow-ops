# 03. Additional Insureds Universal Directory + Duplicate Detection

Module: Master COI / Additional Insureds / ACORD 25, InsureFlow Ops
Area: Additional Insureds directory, search, resolve-or-create, duplicate suggestions, merge, cert-holder linkage, migration posture, and the /additional-insureds UI.
Resolves handoff open questions 5 (Certificate Holder as a first-class concept) and 7 (suggestions-table strategy). Implements the mechanics of locked Decision 3 (reuse the relationship-graph dedup patterns).
Date: 2026-07-02. All file:line citations verified against the repo at commit 7623856 and against live prod (project lrqajzwcmdwahnjyidgv) on 2026-07-02.

This is the FINAL reconciled version. It applies the binding orchestrator resolutions, in particular R4 (freeze trigger permits holder_id reparenting; merge and unmerge with issued certs are acceptance cases), R11 (canonical issued-cert names: `public.certificates`, `holder_id`, `issued_at`; no duplicate index), R12 (this design owns ONE wire-up migration adding FK constraints only, for all five per-policy link columns), R14 (uniform workspace scoping: `agency_workspace_id` derived server-side, `is_staff()` AND `is_agency_member()` RLS), and R19 (all generator cross-links use route /certificates). Sibling docs referenced by final filename: 01-disposition-and-roadmap.md, 02-master-coi-data-layer.md, 04-issuance-and-snapshots.md, 05-acord25-pipeline.md, 06-ui-surfaces.md (all in docs/coi-module/).

---

## 0. Summary of decisions made in this design

1. One new table, `public.additional_insureds`, is the universal directory of certificate holders and additional insureds. It is the answer to open question 5: the Certificate Holder concept lives here, not in `policy_cgl_additional_interests`.
2. Usage is DERIVED from the issued-certificate join (count of `public.certificates` rows whose `holder_id` points at the directory row), not stored as a counter. No `usage_count` column exists on the table. Rationale in Section 1.3.
3. Suggestions strategy (open question 7): NO new suggestions table and NO polymorphic rework of `account_relationship_suggestions`. Reuse `duplicate_groups` with `entity_type = 'additional_insureds'` plus a new generator RPC, a new reader RPC, and symmetric confirm/dismiss RPCs that both record `reviewed_by`.
4. Merge is a clone of the `_do_account_merge` FK-introspection engine, scoped to `additional_insureds`, with an entity-scoped `duplicate_groups` update (fixing a latent scoping gap in the account version), a kind-mismatch guard replacing `assert_mergeable`, and a single-loser unmerge shipped in v1. Per R4, the `certificates` freeze trigger permits the `holder_id` reparent the engine performs; merge-then-unmerge with issued certificates is an acceptance case (Section 9).
5. Migration posture: leave `policy_cgl_additional_interests` and all per-policy AI tables alone. Live prod verification (Section 7.1) shows every candidate seed source has ZERO rows, so no seed migration ships at all. Mortgagees and loss payees are never imported into the directory. Per R12, this design ships exactly ONE wire-up migration that adds FK CONSTRAINTS (no columns) from all five per-policy AI/interest tables to the directory (Section 7.3).
6. The issued-cert record (`public.certificates`, owned by 04-issuance-and-snapshots.md) carries both a live FK (`holder_id`) and a frozen snapshot of the holder block inside its snapshot JSONB. Merges reparent the FK automatically via the cloned engine, and the freeze trigger allows it because `holder_id`, `account_id`, and `agency_workspace_id` are reparentable navigation metadata, not frozen columns (R4). Issued certs always render from the snapshot, so Decision 4 immutability survives merges. Confirmed in Section 6.
7. Workspace scoping (R14): `additional_insureds` carries `agency_workspace_id NOT NULL`, derived server-side (resolve RPC plus a BEFORE INSERT trigger, sec005 pattern), with `is_staff() AND is_agency_member(agency_workspace_id)` RLS. No membership-only exception.
8. UI: a new `/additional-insureds` Index/List page (triage strip, filter row, dense table) plus a right-anchored Add/Edit drawer with a live 250ms-debounced duplicate typeahead forked from `LinkAccountDrawer.tsx`, and an in-page duplicate review view. Nav entry goes in `EXTRA_DESTINATIONS` in `navConfig.ts`. All cross-links to the certificate generator use route `/certificates` (R19).
9. Naming: SQL objects use the full words `additional_insured(s)`, never the prefix `ai_`, because this codebase is dense with artificial-intelligence features and `ai_` already means that elsewhere (`tasks.ai_generated`, `ai-assistant-chat`, etc.).

Naming collision warning for the implementer: three tables will now contain the phrase `additional_insureds`: the new `public.additional_insureds` (this design), plus the existing per-policy endorsement tables `policy_cgl_additional_insureds` (supabase/migrations/20251221190001_commercial_gl_details.sql:96-137) and `policy_umbrella_additional_insureds` (20251221210001_commercial_umbrella_details.sql:108-137). They are different concepts. The per-policy tables record endorsements on one policy; the new table is the reusable identity directory. Generated TypeScript types will contain all three; import carefully.

---

## 1. The `additional_insureds` table

### 1.1 DDL (migration file `supabase/migrations/<ts>_additional_insureds_directory.sql`)

Adopts the ground-truth sketch. `normalize_entity_name` is a verified drop-in reuse: it is pure SQL, IMMUTABLE, PARALLEL SAFE, with zero table references (supabase/migrations/20260629190000_import_resolve_account.sql:28-42), already proven to back a functional index (`idx_accounts_norm_name_active`, same file :48-50). Because the function is IMMUTABLE, a STORED generated column is legal.

```sql
create table public.additional_insureds (
  id                  uuid primary key default gen_random_uuid(),
  -- R14: NOT NULL, derived server-side when not passed (Section 1.6 trigger + Section 3 RPC)
  agency_workspace_id uuid not null references public.agency_workspaces(id),

  -- identity
  name            text not null,
  normalized_name text generated always as (public.normalize_entity_name(name)) stored,
  kind            text not null default 'business'
                  check (kind in ('business','individual','government','lender','other')),

  -- ACORD 25 certificate-holder block is name + address; this is the full print block
  address_line1 text,
  address_line2 text,
  city          text,
  state         text,
  zip_code      text,

  -- contact (used for individual-kind resolve matching and for COI delivery later)
  email text,
  phone text,

  notes text,

  -- tombstone triple: the exact contract the cloned merge engine writes together
  -- (pattern: 20260629240000_relgraph_v2_merge_consolidation.sql:223-224)
  deleted_at     timestamptz,
  merged_into_id uuid references public.additional_insureds(id),
  merged_at      timestamptz,

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.additional_insureds is
  'Universal agency-wide directory of certificate holders / additional insureds. One row per real-world entity; per-policy endorsement status lives on policy_* tables, never here.';

create trigger set_additional_insureds_updated_at
  before update on public.additional_insureds
  for each row execute function public.set_updated_at();
```

Column decisions, finalized:

- `agency_workspace_id`: NOT NULL per R14 (the uniform module posture; no nullable exception). Prod has exactly one workspace (verified live 2026-07-02: `agency_workspaces` count = 1, active memberships = 9), so derivation is unambiguous. The resolve RPC (Section 3) fills it from the caller's membership when not passed and raises if it cannot; the BEFORE INSERT trigger (Section 1.6) is defense in depth for any direct staff insert. NOT NULL is legal with a deriving BEFORE trigger because Postgres checks NOT NULL after BEFORE triggers run. The table is brand new with zero rows, so no backfill step is needed; this is the sec005 pattern (20260408100000_sec005_leads_workspace_isolation.sql) minus the backfill.
- No `dba`, no attention/contact-person line in v1. The ACORD 25 holder box is name plus address only. If a "care of" line is ever needed it goes in `address_line2` by convention; `notes` covers everything else. Adding columns later is additive and safe.
- No `usage_count`, no `last_used_at` columns. See 1.3.
- `state` and `zip_code` naming matches `accounts` (20250908032636 base schema: `address_line1/2, city, state, zip_code`) so the merge engine's field-union clone and any shared UI formatting code port cleanly. Note the per-policy tables use `street/zip` instead; do not copy those names.
- `kind` values per the ground-truth sketch. `lender` and `government` exist because holders like banks and municipalities behave differently in review UX (and future COI language), but resolve semantics only distinguish `individual` from everything else (Section 3).

### 1.2 Indexes

Clone the shape of the account trigram indexes (20260628200000_relgraph_phase0_aliases_and_search.sql:41-46) but index exactly what the RPC queries. Ground-truth correction internalized: the account RPC's fuzzy branch (`similarity(a.name, term) > 0.3`, 20260629250000:50) is NOT index-accelerated because pg_trgm GIN indexes accelerate operators only, never the `similarity()` function call. The new RPC therefore uses the `%` operator (Section 2), and these indexes actually serve it. pg_trgm lives in the `extensions` schema (moved at 20250908161228:14), so operator classes must be written `extensions.gin_trgm_ops`.

```sql
-- fuzzy name search (accelerates lower(name) % lower(term) and lower(name) ILIKE)
create index additional_insureds_name_trgm
  on public.additional_insureds using gin (lower(name) extensions.gin_trgm_ops)
  where deleted_at is null;

-- exact-key resolve and dedup generator; normalized_name is a stored column so a plain btree works
create index additional_insureds_norm_name_active
  on public.additional_insureds (kind, normalized_name)
  where deleted_at is null;

-- tombstone-following in the resolve RPC
create index additional_insureds_merged_into
  on public.additional_insureds (merged_into_id)
  where merged_into_id is not null;

-- workspace-scoped queries (sec005 precedent: idx_leads_agency_workspace_id)
create index additional_insureds_workspace
  on public.additional_insureds (agency_workspace_id);
```

No email/phone indexes in v1: `search_accounts` has none either and the directory will be orders of magnitude smaller than `accounts` (16k rows). The nightly generator is a batch job where sequential scans are fine.

This design creates NO index on `public.certificates`. The issuance migration creates `idx_certificates_holder` on `certificates(holder_id)` once (04-issuance-and-snapshots.md, per R11); do not duplicate it here.

### 1.3 Usage derivation: derive, do not count (validated)

The ground truth offered two options (increment a counter at cert issuance, or derive from the cert-holder join to avoid counter drift) and asked this design to validate. Validation result: DERIVE.

- A stored counter must be incremented at issuance, decremented at void, summed on merge, and un-summed on unmerge. Every one of those is a drift point; the account system's analogous derived counts (`policies_count` as a subselect inside `search_accounts`, 20260629250000:21-22, and inside `list_duplicate_groups_for_review`, 20260629162000:17-18) prove the derived pattern is the house style and performs fine at 16k accounts.
- Under the cloned merge engine, FK reparenting moves the issued-cert rows to the survivor automatically (Section 5), which means the derived count is correct after a merge with zero extra code: usage derivation follows the surviving holder (R4). A counter would require `usage_count = survivor + losers` arithmetic plus the reverse on unmerge. Deriving deletes that whole class of bug.

Contract with 04-issuance-and-snapshots.md (which owns the issued-cert table): `public.certificates` carries `holder_id uuid not null references public.additional_insureds(id)` and the issuance migration creates `idx_certificates_holder` on that column. Usage is then:

```sql
usage_count  = (select count(*)::int from public.certificates c where c.holder_id = ai.id),
last_used_at = (select max(c.issued_at) from public.certificates c where c.holder_id = ai.id)
```

Sequencing consequence: the two reader RPCs that expose usage (Sections 2 and 8.4) reference `public.certificates`. Section 9 orders the migrations so those RPC definitions land after the issuance table; if the directory must ship first standalone, ship the RPCs with `0::int as usage_count, null::timestamptz as last_used_at` placeholders and redefine them (drop + recreate, since a RETURNS TABLE change requires it, precedent at 20260629250000:7-10) in a wire-up migration once `certificates` exists. That wire-up creates no index (see 1.2).

### 1.4 RLS (R14: staff AND workspace member)

Per R14, the module-wide posture is uniform: every new module table carries `agency_workspace_id` and its RLS requires BOTH `public.is_staff()` AND `public.is_agency_member(agency_workspace_id)`. This deliberately tightens the earlier draft (which cloned the membership-only `account_aliases` policies); membership-only RLS was flagged as an invariant violation in review and is not shipped. `is_agency_member` already exists (defined at 20251228000000_m0_agency_workspace_foundation.sql:125: current user has an active membership in the given workspace); `is_staff` is the established staff predicate used by the relationship-graph RPCs.

```sql
alter table public.additional_insureds enable row level security;

create policy additional_insureds_select on public.additional_insureds
  for select to authenticated
  using (public.is_staff() and public.is_agency_member(agency_workspace_id));

create policy additional_insureds_insert on public.additional_insureds
  for insert to authenticated
  with check (public.is_staff() and public.is_agency_member(agency_workspace_id));

create policy additional_insureds_update on public.additional_insureds
  for update to authenticated
  using (public.is_staff() and public.is_agency_member(agency_workspace_id))
  with check (public.is_staff() and public.is_agency_member(agency_workspace_id));

create policy additional_insureds_delete on public.additional_insureds
  for delete to authenticated
  using (public.is_staff() and public.is_agency_member(agency_workspace_id));

grant select, insert, update, delete on public.additional_insureds to authenticated;
grant all on public.additional_insureds to service_role;
```

Notes:
- The INSERT WITH CHECK is evaluated against the row AFTER the BEFORE INSERT trigger (Section 1.6) has derived `agency_workspace_id`, so a staff insert that omits the column still passes when the derived workspace is one the caller belongs to.
- The raw DELETE grant exists for completeness, but the UI never hard-deletes (invariant 6, soft deletes only); the row-level delete path in the UI writes `deleted_at`. The `certificates.holder_id` FK is a plain FK (RESTRICT semantics), so a hard delete of a used holder fails at the constraint anyway.
- All mutating flows additionally go through staff-gated SECURITY DEFINER RPCs; the reader RPCs repeat the staff + workspace-membership predicate inline (Sections 2, 4.3, 8.4) because SECURITY DEFINER bypasses RLS.

### 1.5 Seed rule row for the dedup engine

`duplicate_detection_rules` is generic (`entity_type text, rule_name, match_fields jsonb, threshold`, 20250908040318_478cdf10-18f3-4e8c-8e12-2a6ac2b72946.sql:2-11). The same migration seeds one row the generator references:

```sql
insert into public.duplicate_detection_rules (entity_type, rule_name, match_fields, threshold)
values ('additional_insureds', 'additional_insureds_nightly',
        '{"signals":["same_normalized_name","name_trgm_city_state","address_key_name_trgm","shared_contact_name_trgm"]}'::jsonb,
        0.55);
```

### 1.6 Workspace derivation trigger (R14 server-side derivation)

```sql
create or replace function public.additional_insureds_derive_workspace()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.agency_workspace_id is null then
    select m.agency_workspace_id into new.agency_workspace_id
    from public.agency_workspace_memberships m
    where m.user_id = auth.uid() and m.status = 'active'
    limit 1;
  end if;
  if new.agency_workspace_id is null then
    raise exception 'additional_insureds: agency_workspace_id could not be derived; pass it explicitly';
  end if;
  return new;
end;
$function$;

create trigger additional_insureds_workspace_default
  before insert on public.additional_insureds
  for each row execute function public.additional_insureds_derive_workspace();
```

Service-role callers (edge functions, imports) have `auth.uid() = null` and must pass the workspace explicitly; the trigger refuses a null or underivable workspace, matching the importer-hardening posture (`import_resolve_account` refuses a null/ambiguous workspace, CLAUDE.md changelog 2026-06-29).

---

## 2. `search_additional_insureds` RPC

Clone of `search_accounts` (20260629250000_relgraph_v2_search_owned_rollup.sql:12-57) with the ground-truth performance fix: the fuzzy branch uses the `%` operator so `additional_insureds_name_trgm` is actually used, keeping `similarity()` only in the SELECT for the score column. The `%` operator threshold comes from the GUC `pg_trgm.similarity_threshold` (default 0.30, matching the account version's `> 0.3` behavior); pin it on the function so behavior never drifts with server config. Usage subselects target `public.certificates(holder_id, issued_at)` per R11.

```sql
create function public.search_additional_insureds(p_q text, p_limit integer default 20)
 returns table(
   additional_insured_id uuid,
   name text,
   kind text,
   city text,
   state text,
   email text,
   phone text,
   usage_count integer,
   last_used_at timestamptz,
   match_reason text,
   score real)
 language sql
 stable security definer
 set search_path to 'public', 'extensions'
 set pg_trgm.similarity_threshold = 0.3
as $function$
  with q as (select nullif(trim(coalesce(p_q, '')), '') as term)
  select
    ai.id, ai.name, ai.kind, ai.city, ai.state, ai.email, ai.phone,
    coalesce((select count(*)::int from public.certificates c
                where c.holder_id = ai.id), 0)                            as usage_count,
    (select max(c.issued_at) from public.certificates c
       where c.holder_id = ai.id)                                         as last_used_at,
    case
      when ai.normalized_name = public.normalize_entity_name((select term from q))
        then 'same normalized name'
      when ai.name  ilike '%' || (select term from q) || '%' then 'name'
      when ai.email ilike '%' || (select term from q) || '%' then 'email'
      when ai.phone ilike '%' || (select term from q) || '%' then 'phone'
      else 'fuzzy: ' || ai.name
    end as match_reason,
    similarity(ai.name, (select term from q)) as score
  from public.additional_insureds ai
  where ai.deleted_at is null
    and ai.merged_into_id is null
    and (select term from q) is not null
    and (auth.uid() is null or public.is_staff())
    and (auth.uid() is null or public.is_agency_member(ai.agency_workspace_id))
    and (
      ai.name  ilike '%' || (select term from q) || '%'
      or ai.email ilike '%' || (select term from q) || '%'
      or ai.phone ilike '%' || (select term from q) || '%'
      or ai.normalized_name = public.normalize_entity_name((select term from q))
      or (length((select term from q)) >= 3
          and lower(ai.name) % lower((select term from q)))
    )
  order by
    (case when ai.name ilike (select term from q) || '%' then 1 else 0 end) desc,
    score desc nulls last,
    ai.name asc
  limit p_limit;
$function$;

revoke execute on function public.search_additional_insureds(text, integer) from anon, public;
grant  execute on function public.search_additional_insureds(text, integer) to authenticated;
```

Conventions carried over from the account version and why: staff gate inline in WHERE (`auth.uid() is null or public.is_staff()`, 20260629250000:42, which also lets service-role callers through); `stable security definer set search_path to 'public','extensions'` (:15-16, required because pg_trgm lives in `extensions`); revoke anon/public then grant authenticated (:59-60); prefix-match-first ordering (:52-55); human-readable `match_reason` because the UI renders it inline in the result row (`LinkAccountDrawer.tsx:190` renders `r.match_reason`, and the ground truth confirms this column is the duplicate-warning UX contract).

Differences from the account version, each deliberate:
- `%` operator instead of bare `similarity() > 0.3` (index-accelerated; ground-truth discrepancy fix).
- `normalized_name = normalize_entity_name(term)` exact-key branch with its own match_reason, so "Enterprise Fleet Mgmt & Co" typed as "enterprise fleet mgmt and co" surfaces as a strong signal, not a fuzzy one. Left side is the stored column, so `additional_insureds_norm_name_active` serves it.
- `merged_into_id is null` predicate: tombstoned losers never appear in search (the account version relies on `deleted_at` alone; belt and suspenders here since both are written together).
- Workspace-membership predicate (R14): SECURITY DEFINER bypasses table RLS, so the RPC enforces the same `is_agency_member` scope inline, with the service-role passthrough.
- No goes_by/alias branches (no alias concept for holders in v1).

This RPC is the typeahead backend for BOTH the `/additional-insureds` drawer (Section 8.6) and the holder picker on the `/certificates` generator surface (06-ui-surfaces.md, R19).

---

## 3. `resolve_additional_insured` RPC (resolve-or-create)

Clone of `import_resolve_account`'s insert-race-safe pattern: advisory lock keyed on the identity, live exact match, tombstone-follow with a 10-hop guard, null-only backfill, insert on miss (20260629190000_import_resolve_account.sql:96-188). Every create path in the module (drawer save, inline create from the `/certificates` generation flow) MUST go through this RPC; raw inserts from the client are forbidden by convention (RLS still permits them for flexibility, but the hook layer in Section 8 only exposes the RPC).

Per R14, the RPC derives the workspace server-side from the caller's membership and REFUSES to proceed when the workspace is still null after derivation (this replaces the earlier nullable-workspace tolerance).

```sql
create or replace function public.resolve_additional_insured(
  p_name          text,
  p_kind          text default 'business',
  p_email         text default null,
  p_phone         text default null,
  p_address_line1 text default null,
  p_address_line2 text default null,
  p_city          text default null,
  p_state         text default null,
  p_zip           text default null,
  p_notes         text default null,
  p_agency_workspace_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key      text := public.normalize_entity_name(p_name);
  v_email    text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone    text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  v_ws       uuid := p_agency_workspace_id;
  v_match    uuid;
  v_basis    text;
  v_followed boolean := false;
  v_hops     int := 0;
  v_next     uuid;
  v_new      uuid;
begin
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'resolve_additional_insured: staff access required';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'resolve_additional_insured: name required';
  end if;
  if p_kind not in ('business','individual','government','lender','other') then
    raise exception 'resolve_additional_insured: invalid kind %', p_kind;
  end if;

  -- R14: derive the workspace from the caller's active membership; refuse null
  if v_ws is null and auth.uid() is not null then
    select m.agency_workspace_id into v_ws
    from public.agency_workspace_memberships m
    where m.user_id = auth.uid() and m.status = 'active'
    limit 1;
  end if;
  if v_ws is null then
    raise exception 'resolve_additional_insured: agency_workspace_id could not be derived; pass it explicitly';
  end if;
  if auth.uid() is not null and not public.is_agency_member(v_ws) then
    raise exception 'resolve_additional_insured: caller is not a member of workspace %', v_ws;
  end if;

  -- serialize concurrent resolves of the same identity
  -- ('addl_insured|' discriminator keeps the key space distinct from import_resolve_account's)
  perform pg_advisory_xact_lock(hashtextextended(
    'addl_insured|' || v_ws::text || '|' || p_kind || '|' || coalesce(v_key, ''), 0));

  if v_key is not null then
    -- (1) live exact match. Non-individual kinds: normalized name alone (a legal name
    --     is an identity). Individual: normalized name + shared email or phone, so two
    --     different "John Smith" holders never collapse.
    select ai.id into v_match
    from public.additional_insureds ai
    where ai.deleted_at is null
      and ai.normalized_name = v_key
      and ai.agency_workspace_id = v_ws
      and (
        p_kind <> 'individual'
        or (v_email is not null and lower(btrim(coalesce(ai.email, ''))) = v_email)
        or (v_phone is not null
            and nullif(regexp_replace(coalesce(ai.phone, ''), '\D', '', 'g'), '') = v_phone)
      )
    order by ai.updated_at desc nulls last, ai.created_at asc
    limit 1;

    if v_match is not null then
      v_basis := case when p_kind <> 'individual' then 'entity_name' else 'name_plus_identifier' end;
    else
      -- (2) tombstoned match: follow merged_into_id to the live survivor (max 10 hops)
      select ai.id into v_match
      from public.additional_insureds ai
      where ai.deleted_at is not null
        and ai.merged_into_id is not null
        and ai.normalized_name = v_key
        and ai.agency_workspace_id = v_ws
      order by ai.merged_at desc nulls last
      limit 1;

      if v_match is not null then
        v_next := v_match;
        loop
          v_hops := v_hops + 1;
          select merged_into_id into v_next from public.additional_insureds where id = v_next;
          exit when v_next is null or v_hops > 10;
          v_match := v_next;
        end loop;
        if exists (select 1 from public.additional_insureds
                    where id = v_match and deleted_at is null) then
          v_followed := true;
          v_basis := 'followed_merge';
        else
          v_match := null;
        end if;
      end if;
    end if;
  end if;

  if v_match is not null then
    -- null-only backfill; an existing value is never overwritten
    update public.additional_insureds ai set
      email         = coalesce(nullif(btrim(ai.email), ''),         nullif(btrim(p_email), '')),
      phone         = coalesce(nullif(btrim(ai.phone), ''),         nullif(btrim(p_phone), '')),
      address_line1 = coalesce(nullif(btrim(ai.address_line1), ''), nullif(btrim(p_address_line1), '')),
      address_line2 = coalesce(nullif(btrim(ai.address_line2), ''), nullif(btrim(p_address_line2), '')),
      city          = coalesce(nullif(btrim(ai.city), ''),          nullif(btrim(p_city), '')),
      state         = coalesce(nullif(btrim(ai.state), ''),         nullif(btrim(p_state), '')),
      zip_code      = coalesce(nullif(btrim(ai.zip_code), ''),      nullif(btrim(p_zip), '')),
      notes         = coalesce(nullif(btrim(ai.notes), ''),         nullif(btrim(p_notes), ''))
    where ai.id = v_match;

    return jsonb_build_object(
      'additional_insured_id', v_match, 'matched', true,
      'match_basis', v_basis, 'followed_merge', v_followed);
  end if;

  -- (3) no match: create
  insert into public.additional_insureds
    (agency_workspace_id, name, kind, email, phone,
     address_line1, address_line2, city, state, zip_code, notes, created_by)
  values
    (v_ws, btrim(p_name), p_kind, nullif(btrim(p_email), ''), nullif(btrim(p_phone), ''),
     nullif(btrim(p_address_line1), ''), nullif(btrim(p_address_line2), ''),
     nullif(btrim(p_city), ''), nullif(btrim(p_state), ''), nullif(btrim(p_zip), ''),
     nullif(btrim(p_notes), ''), auth.uid())
  returning id into v_new;

  return jsonb_build_object(
    'additional_insured_id', v_new, 'matched', false,
    'match_basis', 'created', 'followed_merge', false);
end;
$function$;

revoke execute on function public.resolve_additional_insured(text,text,text,text,text,text,text,text,text,text,uuid) from anon, public;
grant  execute on function public.resolve_additional_insured(text,text,text,text,text,text,text,text,text,text,uuid) to authenticated;
```

Deviations from `import_resolve_account`, each deliberate:
- Matching by kind: the source pattern matched businesses on name alone and households on name plus identifier (20260629190000:101-118). Here `individual` is the strict kind; `business`, `government`, `lender`, `other` all match on normalized name alone. Kind is NOT part of the match key: if "Enterprise Fleet Management" exists as kind `other` and a create comes in as kind `business`, they resolve to the same row (the name is the identity; kind is a descriptor). This is why the advisory-lock key including `p_kind` is fine for insert-race protection but the SELECT does not filter kind.
- No DOB parameter (directory rows are organizations in the overwhelming case; individuals disambiguate by email/phone).
- Workspace defaulting from membership instead of hard-failing on null for interactive callers, but refusing a workspace that cannot be derived at all (R14; imports and service-role callers pass it explicitly).

---

## 4. Duplicate suggestions

### 4.1 Storage: reuse `duplicate_groups` (open question 7 resolved)

Verified safe: `duplicate_groups` is generic in shape (`entity_type text, entity_ids uuid[], match_score, rule_id, status, reviewed_by, reviewed_at`, 20250908040318:13-23) with staff-only RLS (:114-115). Every existing account tool explicitly refuses other entity types: `relgraph_merge_duplicate_group` raises on `entity_type <> 'accounts'` (20260629160000_merge_ux_preview_and_shared_path.sql:69), the account reader hardcodes `entity_type = 'accounts'` (20260629162000:22), and the client count query filters `.eq('entity_type','accounts')` (src/hooks/useRelationshipGraph.ts:449-453). Live prod check 2026-07-02: zero non-account rows exist today, so we are first-in on the namespace.

Do NOT polymorphize `account_relationship_suggestions`: it has hard FKs to accounts with ON DELETE CASCADE, an account-vocabulary `rel_type` CHECK, and a symmetric unique index (20260628202000:8-30), and every reader joins accounts (20260629103000:162-191). A directory needs no typed edges, so `duplicate_groups.status` is sufficient review state. Only if per-pair review metadata beyond status ever becomes necessary does a dedicated table get built; nothing in this design needs it.

### 4.2 Generator RPC

Modeled on the v2 suggester's shape: one `cand` CTE with prioritized signal branches, `row_number()` over the symmetric pair keeping one best candidate, dedup against existing state, staff/service gate, jsonb count report (20260629230000_relgraph_v2_suggester_rebuild.sql:24-178). Signals per the ground truth, with one adjustment: the shared-contact signal is gated by mild name similarity because certificate holders legitimately share corporate phone lines and PO boxes across genuinely distinct entities (branch offices of different franchisees, shared registered agents).

Exact-name matches with 3 or more members produce one multi-member group (grouped by key, like the wave2 backfill's `GROUP BY nkey HAVING count(*) >= 2` pattern at 20260628150352_wave2_dup2_detection.sql:116-123 context); fuzzy signals produce 2-member groups. `cleanup.norm_addr` (street-suffix-normalizing address key, 20260628150352:20-39) is called as-is for the address-key signal, per the ground truth's literal-reuse list.

```sql
create or replace function public.generate_additional_insured_duplicates()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_rule_id uuid;
  v_result  jsonb;
begin
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'generate_additional_insured_duplicates: staff access required';
  end if;

  select id into v_rule_id from public.duplicate_detection_rules
  where entity_type = 'additional_insureds' and rule_name = 'additional_insureds_nightly'
  limit 1;

  with live as (
    select id, name, normalized_name, kind,
           lower(btrim(coalesce(city, '')))  as city_n,
           lower(btrim(coalesce(state, ''))) as state_n,
           cleanup.norm_addr(address_line1)  as addr_key,
           lower(nullif(btrim(coalesce(email, '')), '')) as email_n,
           nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), '') as phone_n
    from public.additional_insureds
    where deleted_at is null and merged_into_id is null
  ),
  -- Signal 1 (exact): same normalized_name, any kinds. Multi-member groups.
  exact_groups as (
    select normalized_name, array_agg(id order by id) as ids, 0.95::numeric as score
    from live
    where normalized_name is not null
    group by normalized_name
    having count(*) >= 2
  ),
  -- ids already covered by an exact group are excluded from the fuzzy pair signals
  covered as (select unnest(ids) as id from exact_groups),
  pairs as (
    -- Signal 2: name trigram > 0.55 AND same city+state
    select least(a.id, b.id) as a1, greatest(a.id, b.id) as a2,
           similarity(a.name, b.name)::numeric as score, 8 as prio
    from live a
    join live b on a.id < b.id
      and a.city_n <> '' and a.city_n = b.city_n and a.state_n = b.state_n
      and similarity(a.name, b.name) > 0.55
    where a.id not in (select id from covered) and b.id not in (select id from covered)

    union all
    -- Signal 3: same normalized address key AND name trigram > 0.4
    select least(a.id, b.id), greatest(a.id, b.id),
           similarity(a.name, b.name)::numeric, 7
    from live a
    join live b on a.id < b.id
      and a.addr_key <> '' and a.addr_key = b.addr_key
      and similarity(a.name, b.name) > 0.4
    where a.id not in (select id from covered) and b.id not in (select id from covered)

    union all
    -- Signal 4: shared email or phone AND name trigram > 0.3
    select least(a.id, b.id), greatest(a.id, b.id),
           similarity(a.name, b.name)::numeric, 6
    from live a
    join live b on a.id < b.id
      and ((a.email_n is not null and a.email_n = b.email_n)
        or (a.phone_n is not null and length(a.phone_n) >= 10 and a.phone_n = b.phone_n))
      and similarity(a.name, b.name) > 0.3
    where a.id not in (select id from covered) and b.id not in (select id from covered)
  ),
  ranked_pairs as (
    select a1, a2, score,
           row_number() over (partition by a1, a2 order by prio desc, score desc) as rn
    from pairs
  ),
  candidates as (
    select ids, score from exact_groups
    union all
    select array[a1, a2], score from ranked_pairs where rn = 1
  ),
  -- idempotency: never re-insert a group whose exact member set already exists
  -- for this entity_type in ANY status (pending, dismissed, merged, reviewed)
  fresh as (
    select c.ids, c.score
    from candidates c
    where not exists (
      select 1 from public.duplicate_groups g
      where g.entity_type = 'additional_insureds'
        and (select array_agg(x order by x) from unnest(g.entity_ids) x)
          = (select array_agg(y order by y) from unnest(c.ids) y)
    )
  ),
  ins as (
    insert into public.duplicate_groups (entity_type, entity_ids, match_score, rule_id, status)
    select 'additional_insureds', f.ids, f.score, v_rule_id, 'pending'
    from fresh f
    returning 1
  )
  select jsonb_build_object('inserted', count(*)) into v_result from ins;

  return coalesce(v_result, jsonb_build_object('inserted', 0));
end;
$function$;

revoke execute on function public.generate_additional_insured_duplicates() from anon, public;
grant  execute on function public.generate_additional_insured_duplicates() to authenticated;
```

Design notes: dismissed groups suppress regeneration of the identical member set forever (set-equality check against any status), but a superset group (a third duplicate appears later) is new information and inserts. Never auto-commits anything; every group is `pending` for human review, matching the account system's non-negotiable (20260629230000:18-20).

### 4.3 Reader RPC

Clone of `list_duplicate_groups_for_review` (20260629162000:5-26) swapping the accounts join for the directory and the member fields for holder-relevant ones. Ground-truth note internalized: the account reader shows `('pending','link_candidate')`; a clone must decide its statuses explicitly. Decision: `pending` only. The directory has no link-candidate concept (no cross-type edge alternative exists for holders). Usage subselect targets `public.certificates(holder_id)` per R11; the members subselect carries the R14 workspace predicate because SECURITY DEFINER bypasses RLS.

```sql
create or replace function public.list_additional_insured_duplicate_groups(
  p_limit integer default 50, p_offset integer default 0)
returns table(group_id uuid, match_score numeric, status text,
              created_at timestamptz, member_count integer, members jsonb)
language sql stable security definer set search_path to 'public'
as $function$
  select
    g.id, g.match_score, g.status, g.created_at,
    coalesce(array_length(g.entity_ids, 1), 0),
    (select jsonb_agg(jsonb_build_object(
        'additional_insured_id', ai.id, 'name', ai.name, 'kind', ai.kind,
        'address_line1', ai.address_line1, 'city', ai.city, 'state', ai.state,
        'email', ai.email, 'phone', ai.phone,
        'created_at', ai.created_at, 'deleted_at', ai.deleted_at,
        'usage_count', coalesce((select count(*)::int from public.certificates c
                                   where c.holder_id = ai.id), 0)
      ) order by ai.deleted_at nulls first, ai.created_at)
     from public.additional_insureds ai
     where ai.id = any(g.entity_ids)
       and (auth.uid() is null or public.is_agency_member(ai.agency_workspace_id))) as members
  from public.duplicate_groups g
  where g.entity_type = 'additional_insureds' and g.status = 'pending'
    and (auth.uid() is null or public.is_staff())
  order by g.match_score desc nulls last, g.created_at desc
  limit p_limit offset p_offset;
$function$;

revoke execute on function public.list_additional_insured_duplicate_groups(integer, integer) from anon, public;
grant  execute on function public.list_additional_insured_duplicate_groups(integer, integer) to authenticated;
```

(In the single-workspace prod, `member_count` always equals the members array length. If a second workspace ever exists, the generator should also be made workspace-partitioned; noted in Section 10.)

### 4.4 Confirm and dismiss: symmetric RPCs, both record reviewed_by

Do not inherit the account system's asymmetry: it has a confirm RPC (20260628202000:92-135) but dismisses via a raw table UPDATE that omits `reviewed_by` (src/hooks/useRelationshipGraph.ts:232-246 sets only `status` and `reviewed_at`). Here both paths are RPCs and both record the reviewer.

Confirm IS the merge: `merge_additional_insured_duplicate_group` (Section 5.3) validates the group, calls the engine, and the engine marks the group `merged` with `reviewed_by`/`reviewed_at` (entity-scoped, Section 5.2 item 4).

Dismiss:

```sql
create or replace function public.dismiss_additional_insured_duplicate_group(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare g record;
begin
  if not public.is_staff() then
    raise exception 'dismiss_additional_insured_duplicate_group: staff access required';
  end if;
  select * into g from public.duplicate_groups where id = p_group_id;
  if not found then raise exception 'Duplicate group % not found', p_group_id; end if;
  if g.entity_type <> 'additional_insureds' then
    raise exception 'Only additional insured groups can be dismissed here';
  end if;
  if g.status = 'merged' then raise exception 'Group already merged'; end if;

  update public.duplicate_groups
  set status = 'dismissed', reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_group_id;

  return jsonb_build_object('dismissed', true, 'group_id', p_group_id);
end;
$function$;

revoke execute on function public.dismiss_additional_insured_duplicate_group(uuid) from anon, public;
grant  execute on function public.dismiss_additional_insured_duplicate_group(uuid) to authenticated;
```

### 4.5 Nightly trigger mechanics

Exact clone of the `suggest-account-links` precedent:

1. Edge function `supabase/functions/suggest-additional-insured-duplicates/index.ts`: copy `supabase/functions/suggest-account-links/index.ts` (83 lines) verbatim, changing only the log prefix and the RPC name to `generate_additional_insured_duplicates`. It keeps: CORS block (:18-22), constant-time `timingSafeEqual` CRON_SECRET check (:25-45), service-role client (:48-56), single `supabase.rpc(...)` call (:59), structured success/error JSON responses (:61-81). Auth pattern: CRON_SECRET header, `verify_jwt=false` in `supabase/config.toml` (add the `[functions.suggest-additional-insured-duplicates]` block mirroring the existing suggest-account-links entry).
2. GitHub Action `.github/workflows/suggest-additional-insured-duplicates.yml`: copy `.github/workflows/suggest-account-links.yml` changing the function URL and the cron to `'45 7 * * *'` (15 minutes after suggest-account-links at 07:30 UTC, :17, keeping the analytics-jobs-first ordering that file documents at :16). Keep `workflow_dispatch` for manual runs and the same `CRON_SECRET`/`SUPABASE_URL` secrets (already configured for the account job, no new secrets needed).

A separate function rather than a second RPC call inside suggest-account-links keeps failure isolation and matches the one-job-one-function precedent of every scheduled function in the repo (CLAUDE.md scheduled jobs list).

---

## 5. Merge

### 5.1 Guard: `assert_additional_insured_mergeable`

`assert_mergeable`'s guards are entirely account-domain (TIN, DOB, FEIN, name suffix, 20260629101000_merge_hardening_t4_guards.sql:16-50); only the shape transfers (a pre-merge RAISE-on-conflict function). The directory equivalent is a kind guard:

```sql
create or replace function public.assert_additional_insured_mergeable(p_survivor uuid, p_losers uuid[])
returns void
language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_kinds text[];
begin
  select array_agg(distinct kind) into v_kinds
  from public.additional_insureds
  where id = any(p_survivor || p_losers);

  -- an individual and a non-individual are different real-world things; block
  if 'individual' = any(v_kinds) and array_length(v_kinds, 1) > 1 then
    raise exception 'Cannot merge an individual with a non-individual additional insured';
  end if;
  -- business/government/lender/other cross-merges are allowed: these are
  -- descriptor mismatches, common miscategorizations, visible in the preview
end;
$function$;
```

### 5.2 Engine: `_do_additional_insured_merge`

Clone `_do_account_merge` (20260629240000_relgraph_v2_merge_consolidation.sql:25-262) with exactly the five swaps from the ground-truth recipe. Signature:

```sql
create function public._do_additional_insured_merge(
  p_survivor uuid, p_losers uuid[], p_rule text, p_apply boolean default true)
returns jsonb
language plpgsql security definer set search_path to 'public'
```

Swap list, keyed to the account source lines:

1. FK-introspection reparent loop copied verbatim (:143-206) changing only the regclass literals: `c.confrelid = 'public.additional_insureds'::regclass` and the confkey attnum lookup against `'public.additional_insureds'::regclass ... attname='id'`, and `cl.relname <> 'additional_insureds'` (the self-FK `merged_into_id` must not be reparented by the loop; it is excluded exactly the way the accounts loop excludes `accounts`). Keep the per-row unique_violation fallback, the count/manifest jsonb accumulation (`reparent_counts`, `reparented_ids`, `children_noid_before`, `children_deleted_on_conflict`), and the `continue when not p_apply` preview short-circuit (:159). This is what makes `certificates.holder_id` (Section 6) and the five per-policy link columns (Section 7.3) reparent automatically with zero merge-code changes when they land.
   - `certificates.holder_id` reparenting is PERMITTED by the certificates freeze trigger. Per R4, the frozen-column list in `certificates_enforce_immutability` (owned by 04-issuance-and-snapshots.md) excludes `holder_id`, `account_id`, and `agency_workspace_id`: they are reparentable navigation metadata, and the snapshot JSONB preserves the as-issued holder and insured identities. The frozen list keeps `certificate_number`, `snapshot`, `pdf_sha256`, `storage_bucket`, `storage_path`, `issued_at`, `issued_by`, and status transitions limited to the legal set; the reparent loop touches none of those.
   - `v_safe_delete` allowlist (:35-40 in the source): initialize EMPTY (`ARRAY[]::text[]`). No child table of the directory is safe to hard-delete today; any unique collision raises for manual handling. Add table names here only when a genuinely duplicative child table appears. (`account_coi_profiles` goes into `_do_account_merge`'s allowlist per R4, but that is the ACCOUNT engine and is owned by 04-issuance-and-snapshots.md; it does not touch this engine.)
   - The `policies` special-case branch inside the fallback (:174-176) is dropped (no such table points here).
2. Scalar field-union (:93-125 in the source) rewritten over the directory columns: `email, phone, address_line1, address_line2, city, state, zip_code, notes`, null-only backfill into the survivor (:209-221 analog). `agency_workspace_id` is NOT unioned: the survivor keeps its own workspace (single-workspace prod makes this a non-event; a cross-workspace merge attempt should be blocked by the guard if a second workspace ever exists, see Section 10). Loser ranking keys: k1 = contact completeness (`(email present)::int + (phone present)::int + (address_line1 present)::int`), k2 = `updated_at`, tiebreak `id`. (The account version's k1 is policy count; the directory analog would be certificate count, but issued certs reparent to the survivor in the same transaction so it adds nothing; completeness is the useful signal.) No `usage_count` arithmetic exists because usage is derived (Section 1.3): after the reparent, the derived count follows the surviving holder automatically (R4).
3. Dropped accounts-only steps: `assert_mergeable` (replaced by `assert_additional_insured_mergeable` at the same position, :63 analog), relationship/suggestion edge cleanup (:64-67), `compute_account_survivor` (:70; return `null` for `computed_survivor` in the result jsonb or omit the key), policy dedup (:127-141), `duplicate_flags` insert (:237-238), `same_as` provenance edges (:244-248), consent reconciliation (:250).
4. Kept, with one fix: advisory lock + FOR UPDATE row locks (:73-75), the all-losers-already-merged idempotency short-circuit (:77-87), tombstone triple write `deleted_at = now(), merged_into_id = p_survivor, merged_at = now()` (:223-224), `merge_history` insert with `entity_type = 'additional_insureds'` and the full manifest including `survivor_before`/`losers_before` (:226-235; `merge_history` is entity-generic per 20250908040318:25-33, literal reuse), and the duplicate_groups close-out (:240-241) WITH AN ADDED ENTITY SCOPE the account version lacks:
   ```sql
   update public.duplicate_groups set status = 'merged', reviewed_by = v_by, reviewed_at = now()
   where entity_type = 'additional_insureds'
     and status is distinct from 'merged' and entity_ids && p_losers;
   ```
   (The account version filters only on `entity_ids && p_losers`; once two entity types share the table, an unscoped update is wrong in principle. UUID collisions across entity types are practically impossible but the scope costs nothing and is correct. Consider back-porting the same scope to `_do_account_merge` as a separate one-line cleanup.)
5. Grants exactly as the source (:264-265): `revoke ... from public, anon, authenticated; grant ... to service_role;`. The engine is reached only through the staff-gated SECURITY DEFINER wrappers below.

`p_apply = false` is the pure-compute preview path throughout (:62, :159, :253-260 analogs): no mutation, same counts and field_union.

### 5.3 Staff-gated wrappers

Clones of 20260629160000_merge_ux_preview_and_shared_path.sql:56-148 and 20260629240000:268-326, all `security definer`, all `revoke from anon, public; grant to authenticated;`, all opening with `if not public.is_staff() then raise`:

```sql
-- manual path (row overflow menu "Merge into...", and the review drawer)
create or replace function public.merge_additional_insureds_manual(p_survivor uuid, p_losers uuid[])
returns jsonb ...
-- validates non-empty active losers (exclude p_survivor, deleted rows), then
-- return public._do_additional_insured_merge(p_survivor, v_active, 'manual_merge');

-- group path (duplicate review queue confirm)
create or replace function public.merge_additional_insured_duplicate_group(p_group_id uuid, p_survivor_id uuid)
returns jsonb ...
-- mirror of relgraph_merge_duplicate_group (20260629160000:56-84):
--   group exists; status <> 'merged';
--   if g.entity_type <> 'additional_insureds' then raise 'Only additional insured groups can be merged here';
--   p_survivor_id = any(g.entity_ids); active losers exist;
--   return public._do_additional_insured_merge(p_survivor_id, v_losers, 'duplicate_review');

-- read-only blast-radius preview
create or replace function public.preview_additional_insured_merge(p_survivor uuid, p_losers uuid[])
returns jsonb ...
-- mirror of preview_merge (20260629240000:268-326):
--   assert_additional_insured_mergeable inside BEGIN/EXCEPTION -> mergeable/block_reason;
--   v_counts := public._do_additional_insured_merge(p_survivor, v_active, 'preview', false);
--   field_diff built per key from field_union vs the survivor row (:309-314 analog);
--   returns {mergeable, block_reason, reparent_counts, reparent_total, field_diff}
```

### 5.4 Unmerge (ships in v1)

Clone `unmerge_account` (20260629104000_merge_hardening_t7_unmerge.sql:8-101), which replays the manifest. The directory version is strictly simpler because three of its five steps drop out:

```sql
create or replace function public.unmerge_additional_insured(p_merge_history_id uuid)
returns jsonb ...
-- staff gate; h.entity_type must be 'additional_insureds' (:36 analog);
-- unmerged_at must be null (:37); single-loser only (:38-40);
-- 1) move reparented ids back to the loser from merge_data->'reparented_ids' (:47-56 verbatim);
--    for certificates this moves EXACTLY the certificate ids that belonged to the loser
--    back to it (the freeze trigger permits holder_id updates per R4); certs issued to
--    the survivor between merge and unmerge stay with the survivor;
-- 2) restore survivor scalars from merge_data->'survivor_before' over the 8 directory columns (:64-80 analog);
-- 3) clear the loser tombstone: deleted_at = null, merged_into_id = null, merged_at = null (:83);
-- 4) reopen groups: update duplicate_groups set status='pending', reviewed_by=null, reviewed_at=null
--    where entity_type='additional_insureds' and status='merged' and entity_ids @> array[v_loser] (:89-90 + entity scope);
-- 5) stamp merge_history.unmerged_at (:92). No policy-dedup restore, no provenance-edge or
--    duplicate_flags cleanup (never written by this engine).
```

`merge_history.unmerged_at` already exists (added at 20260629104000:6), so no schema change. The full manifest written in 5.2 item 4 is exactly what makes this possible; do not slim it down.

---

## 6. Certificate-holder relationship contract

How an issued cert links to a holder, and what merge does to it. This section is a contract with 04-issuance-and-snapshots.md, which owns `public.certificates`. All names below are the canonical R11 names.

1. The issued-cert record (`public.certificates`) carries BOTH of:
   - `holder_id uuid not null references public.additional_insureds(id)`, a live FK for navigation, filtering ("all certs issued to this holder" via the `list_certificates` reader that 04 owns), and derived usage (Section 1.3). Plain FK, no ON DELETE action (RESTRICT semantics): a holder with issued certs can never be hard-deleted, which enforces invariant 6 at the constraint level. The issuance migration creates `idx_certificates_holder` on this column; this design creates no duplicate.
   - a frozen holder block inside `certificates.snapshot` (JSONB, owned by 04): `{name, address_line1, address_line2, city, state, zip_code}` captured at issue time by `finalize_certificate_issue`, alongside the rest of the issuance snapshot (field_values per R8, template id + version). Nothing in the legacy System A froze anything at issue time; this snapshot is the immutability mechanism.
2. Rendering rule (binding on every consumer): an issued cert ALWAYS displays and regenerates from the snapshot's holder block, never from the live directory row. The live FK is metadata. The `list_certificates` reader (04) projects the holder display name from the snapshot, and the UI consumes that reader, never raw table rows (R11).
3. What happens on merge: CONFIRMED that FK reparenting handles it, and per R4 the certificates freeze trigger PERMITS it. The cloned engine's introspection loop (Section 5.2 item 1) discovers `certificates.holder_id` at merge time via `pg_constraint` (it introspects, it is not configured), counts it into `reparent_counts`, records moved ids into `reparented_ids`, and re-points the rows to the survivor. The freeze trigger's frozen-column list excludes `holder_id`, `account_id`, and `agency_workspace_id` exactly so this reparent (and the account engine's `account_id` reparent) succeeds; protection against client tampering comes from the REVOKEs (authenticated users have zero insert/update/delete grants on `certificates`, R1). Because there is no unique constraint on `holder_id`, the unique_violation fallback path never fires for this table. The snapshot column is frozen and untouched, so certs issued to "Enterprise FM Trust" before it merged into "Enterprise Fleet Management" still show the exact name and address that was printed. Decision 4 (immutable issued COIs) and Decision 3 (dedup) therefore compose cleanly: merge fixes the future, the snapshot preserves the past. Usage derivation follows the surviving holder (R4).
4. On unmerge, the manifest's `reparented_ids['certificates.holder_id']` moves exactly the certs that belonged to the loser back to it (Section 5.4 step 1). Certs issued to the survivor between merge and unmerge stay with the survivor, which is correct. Merge-then-unmerge with issued certificates is a required acceptance case (Section 9 step 11, R4).
5. Issuance flow linkage (R1, R19): the `generate-certificate` edge function is the ONLY issuance path. Its request carries `holder_id` chosen on the `/certificates` surface via the holder picker, which uses `search_additional_insureds` + `resolve_additional_insured` (06-ui-surfaces.md). `finalize_certificate_issue` (service-role only) builds the snapshot's holder block from the resolved directory row at the moment of issue. The client never inserts certificates, never uploads PDFs, and never sends pdfBytes.
6. Endorsement gating linkage (R2, R3): the directory id is the holder key for `resolve_holder_endorsements(p_account_id, p_holder_id, p_policy_ids)` (owned by 02-master-coi-data-layer.md). That RPC resolves per-line ADDL INSD / SUBR WVD for THIS holder by matching per-policy AI rows on `additional_insured_id` (the link columns wired up in Section 7.3) or on `normalize_entity_name(name)`, with blanket-scoped rows matching every holder. Both the UI toggle gate and `generate-certificate` call that same RPC, so the printed Y/N can never assert an endorsement this holder does not have. The wire-up FKs in Section 7.3 are what make the `additional_insured_id` match path robust across holder merges.

---

## 7. Migration and seed posture for existing per-policy rows (open question 5 mechanics)

### 7.1 Verified prod reality (live SQL, project lrqajzwcmdwahnjyidgv, 2026-07-02)

| Source | Rows in prod |
|---|---|
| `policy_cgl_additional_insureds` | 0 |
| `policy_umbrella_additional_insureds` | 0 |
| `policy_cgl_additional_interests` (all interest types incl. `certificate_holder`) | 0 |
| `policy_bap_interests` | 0 |
| `policy_property_interests` | 0 |
| `certificates_of_insurance` (legacy System B) | 0 |

Every candidate seed source is empty. The tables exist and their writers exist (the ACORD extraction edge functions, e.g. `extract-cgl-policy` populates `policy_cgl_additional_insureds`), but none has ever run to completion against real data that produced rows.

### 7.2 Posture: leave alone, ship no seed

- `policy_cgl_additional_interests` rows with `interest_type = 'certificate_holder'` (schema at 20251221190001_commercial_gl_details.sql:148-180): LEAVE ALONE. The table stays as extraction landing ground. There are zero rows to migrate, so the "migrate or leave" fork in handoff open question 5 costs nothing to resolve: leave.
- Mortgagees and loss payees (`interest_type in ('mortgagee','loss_payee')`) are NEVER imported into the directory, now or in any future seed. A mortgagee is a lienholder interest on a specific policy, not a reusable certificate-request identity. The `kind = 'lender'` value in the directory exists for banks that request COIs, which is a different fact than being a mortgagee on a policy.
- Per-policy AI rows (`policy_cgl_additional_insureds`, `policy_umbrella_additional_insureds`): LEAVE ALONE and keep them as the per-line endorsement truth. They already carry `ai_type`, `waiver_of_subrogation`, `endorsement_form`, and per-AI dates (20251221190001:96-137), which is the seam 02-master-coi-data-layer.md extends for Decision 5's "requested but not yet endorsed" state (endorsement_status, `set_line_ai_endorsement`, and holder resolution via `resolve_holder_endorsements`). The directory never stores endorsement status; the per-policy tables never become a directory.
- NO seed migration ships. The formerly proposed "optional one-time seed of the directory from distinct existing names" is moot with zero source rows. If extraction pipelines ever populate the per-policy tables and a backfill into the directory is wanted, the correct mechanism already exists by then: run each distinct extracted name through `resolve_additional_insured` (which dedupes via normalized_name by construction), filtered to `interest_type = 'certificate_holder'` rows and per-policy AI names only. Documenting that one-liner here replaces shipping speculative migration code.

### 7.3 The ONE wire-up migration: FK constraints for all five link columns (R12)

Ownership, settled by R12: the Master COI data layer's migration (02-master-coi-data-layer.md) adds the `additional_insured_id` COLUMNS, deliberately WITHOUT foreign keys, to all five per-policy AI/interest tables. THIS design ships exactly one wire-up migration, sequenced after both that column migration and the directory table (Section 9 step 6), that adds the FK CONSTRAINTS ONLY. No ADD COLUMN appears anywhere in this design, and nothing is deferred to the Master COI design: all five constraints land here, in one file.

`supabase/migrations/<ts6>_additional_insureds_fk_wireup.sql`:

```sql
-- Adds FK constraints from the five per-policy AI/interest tables to the directory.
-- Columns already exist (added, without FK, by the Master COI data layer migration;
-- see docs/coi-module/02-master-coi-data-layer.md). Constraint-add ONLY.
-- ON DELETE SET NULL: a per-policy row is an annotation; if a directory row were ever
-- hard-deleted (service-role only; the UI soft-deletes), the annotation link clears
-- rather than blocking or cascading.
-- Every ADD CONSTRAINT is wrapped in an IF NOT EXISTS guard for idempotency (R22b).

do $$
declare
  t text;
  cname text;
begin
  foreach t in array array[
    'policy_cgl_additional_insureds',
    'policy_umbrella_additional_insureds',
    'policy_bap_interests',
    'policy_property_interests',
    'policy_wc_subrogation_waivers'
  ] loop
    cname := 'fk_' || t || '_additional_insured';
    if not exists (
      select 1 from pg_constraint
      where conname = cname
        and conrelid = ('public.' || t)::regclass
    ) then
      execute format(
        'alter table public.%I
           add constraint %I
           foreign key (additional_insured_id)
           references public.additional_insureds(id)
           on delete set null',
        t, cname);
    end if;
  end loop;
end $$;
```

Why the FKs matter beyond referential integrity: `_do_additional_insured_merge`'s reparent loop discovers FKs via `pg_constraint` introspection. Without constraints, the five link columns would be invisible to the engine, and after a holder merge the per-policy rows would keep pointing at tombstoned loser ids, which would silently break `resolve_holder_endorsements`' `additional_insured_id` match path (R2). With the constraints in place, per-policy endorsement rows follow a holder merge with zero extra code, and the holder-resolved ADDL INSD / SUBR WVD answer stays correct across merges.

Sequencing hard requirements:
1. The Master COI column migration (02-master-coi-data-layer.md) must run first: it creates the `additional_insured_id` columns on all five tables.
2. The directory table migration (Section 1.1) must run first: it creates the referenced table.
3. This wire-up runs after both. It is idempotent and re-runnable.

---

## 8. UI: the /additional-insureds page and drawer

All surfaces are bound by the Calm Command Index/List checklist, including the two requirements the handoff omitted: a triage strip of at most four routing tiles and a filter row (design-system/surface-map.md:15-21, :19). Reference implementation for the whole archetype: `src/pages/CustomersPage.tsx` (header + lime primary :90-118 region, TriageTile strip :111-144, filter row :146-190, dense table below).

### 8.1 Files to create

| Path | Purpose |
|---|---|
| `src/pages/AdditionalInsuredsPage.tsx` | Index/List page, both views (directory, duplicate review) |
| `src/components/additional-insureds/AdditionalInsuredDrawer.tsx` | Add/Edit right drawer with live duplicate typeahead |
| `src/components/additional-insureds/AdditionalInsuredDuplicatesView.tsx` | Pending group cards + confirm/dismiss (forked from DuplicatesReviewPage.tsx GroupCard, :23-95) |
| `src/components/additional-insureds/AdditionalInsuredMergeDrawer.tsx` | Survivor pick + preview + merge (forked from `src/components/relationships/MergePreviewDrawer.tsx`) |
| `src/hooks/useAdditionalInsureds.ts` | All data access for the area |

### 8.2 Files to modify

| Path | Change |
|---|---|
| `src/App.tsx` | Add `const AdditionalInsuredsPage = lazyWithRetry(() => import("./pages/AdditionalInsuredsPage"));` alongside the existing lazy imports (DuplicatesReviewPage is at src/App.tsx:49), and a `<Route path="/additional-insureds" element={<ErrorBoundary level="page" resetOnPropsChange><AdditionalInsuredsPage /></ErrorBoundary>} />` in the authenticated route block (pattern: the `/duplicates` route at src/App.tsx:524-531) |
| `src/components/layout/chrome/navConfig.ts` | Add to `EXTRA_DESTINATIONS` (after the 'Duplicate review' entry at :126): `{ label: 'Additional Insureds', to: '/additional-insureds', icon: Building2 }`. `Building2` is already imported (:8). Rail groups unchanged: the primary entry points into this page are the `/certificates` generator's holder picker (06-ui-surfaces.md, R19) and the command palette; it does not earn one of the 26 rail slots |
| `supabase/config.toml` | `verify_jwt = false` block for the new edge function (Section 4.5) |

Cross-link rule (R19): any link from this surface to certificate history or the generator navigates to `/certificates?accountId=...`. No `/coi-generator` reference exists anywhere in this area.

### 8.3 Hook: `src/hooks/useAdditionalInsureds.ts`

Exports, with exact shapes:

```ts
export interface AdditionalInsuredSearchResult {
  additional_insured_id: string;
  name: string;
  kind: string;
  city: string | null;
  state: string | null;
  email: string | null;
  phone: string | null;
  usage_count: number;
  last_used_at: string | null;
  match_reason: string;
  score: number;
}

// clone of useAccountSearch (src/hooks/useRelationshipGraph.ts:283-308).
// The useCallback stability of `search` and `clear` is LOAD-BEARING for the
// drawer's debounce effect deps (documented at useRelationshipGraph.ts:303-305);
// preserve the memoization exactly.
export function useAdditionalInsuredSearch(): {
  results: AdditionalInsuredSearchResult[];
  loading: boolean;
  search: (q: string) => Promise<void>;   // supabase.rpc('search_additional_insureds', { p_q, p_limit: 20 })
  clear: () => void;
}

export interface ResolveAdditionalInsuredInput {
  name: string;
  kind: 'business' | 'individual' | 'government' | 'lender' | 'other';
  email?: string | null; phone?: string | null;
  address_line1?: string | null; address_line2?: string | null;
  city?: string | null; state?: string | null; zip?: string | null;
  notes?: string | null;
}
export async function resolveAdditionalInsured(input: ResolveAdditionalInsuredInput):
  Promise<{ additional_insured_id: string; matched: boolean; match_basis: string } | null>;
  // calls supabase.rpc('resolve_additional_insured', ...); toast on error (house pattern:
  // linkAccounts at useRelationshipGraph.ts)

// The full saved row AdditionalInsuredDrawer.onSaved fires with (Section 8.6).
// Consumers (the /certificates generator's holder picker, 06-ui-surfaces.md) read the
// address block straight off this object; no follow-up fetch is ever needed.
export interface AdditionalInsuredSavedRow {
  id: string;
  name: string;
  kind: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
}

export function useAdditionalInsuredsList(filters: {
  q: string; kind: string | 'all'; cohort: 'duplicates' | 'missing_address' | 'never_used' | null;
}): { rows: AdditionalInsuredListRow[]; counts: TriageCounts; loading: boolean; refetch: () => Promise<void> };
  // calls list_additional_insureds + count_additional_insured_cohorts (8.4)

export function useAdditionalInsuredDuplicateGroups(): {
  groups: AdditionalInsuredDuplicateGroup[]; loading: boolean; refetch: () => Promise<void>;
  dismiss: (groupId: string) => Promise<boolean>;   // rpc dismiss_additional_insured_duplicate_group
  merge: (groupId: string, survivorId: string) => Promise<boolean>; // rpc merge_additional_insured_duplicate_group
};
export async function previewAdditionalInsuredMerge(survivor: string, losers: string[]): Promise<MergePreview | null>;
export async function mergeAdditionalInsuredsManual(survivor: string, losers: string[]): Promise<boolean>;
export async function unmergeAdditionalInsured(mergeHistoryId: string): Promise<boolean>;
```

The `/certificates` generator's holder picker (06-ui-surfaces.md) imports `useAdditionalInsuredSearch` and `resolveAdditionalInsured` from this hook file; there is no second implementation.

### 8.4 List reader RPCs (page data)

Two RPCs mirror the CustomersPage server-side-counts pattern. Both use `public.certificates(holder_id, issued_at)` for usage (R11) and both carry the staff + workspace-membership predicates inline (R14, SECURITY DEFINER bypasses RLS):

```sql
create function public.list_additional_insureds(
  p_q text default null, p_kind text default null, p_cohort text default null,
  p_limit integer default 100, p_offset integer default 0)
returns table(additional_insured_id uuid, name text, kind text,
              address_line1 text, city text, state text, zip_code text,
              email text, phone text, notes text,
              usage_count integer, last_used_at timestamptz,
              has_pending_duplicate boolean, created_at timestamptz)
language sql stable security definer set search_path to 'public','extensions'
-- WHERE deleted_at is null AND merged_into_id is null
--   AND (auth.uid() is null or public.is_staff())
--   AND (auth.uid() is null or public.is_agency_member(ai.agency_workspace_id));
-- p_q: reuse the search predicates (ILIKE + normalized + %);
-- p_kind filter when not null; p_cohort:
--   'missing_address' -> address_line1 is null or btrim(address_line1) = ''
--   'never_used'      -> not exists (select 1 from public.certificates c where c.holder_id = ai.id)
--   'duplicates'      -> has_pending_duplicate
-- usage_count   := (select count(*)::int from public.certificates c where c.holder_id = ai.id)
-- last_used_at  := (select max(c.issued_at) from public.certificates c where c.holder_id = ai.id)
-- has_pending_duplicate := exists (select 1 from duplicate_groups g
--   where g.entity_type='additional_insureds' and g.status='pending'
--     and g.entity_ids @> array[ai.id]);
-- order by name asc; limit/offset

create function public.count_additional_insured_cohorts()
returns table(total integer, pending_duplicate_groups integer,
              missing_address integer, never_used integer)
language sql stable security definer set search_path to 'public'
-- same staff + workspace-membership predicates;
-- pending_duplicate_groups counts GROUPS (matches the tile label), others count rows;
-- never_used uses the same not-exists-certificates predicate as the list RPC
```

Both: revoke anon/public, grant authenticated.

### 8.5 Page spec: `AdditionalInsuredsPage.tsx`

Wrapped in `AppLayout` (pattern: DuplicatesReviewPage.tsx:3). One H1. Both themes via cc-* tokens only. No em or en dashes in any copy.

- Header: H1 "Additional insureds", subtitle one sentence ("Certificate holders and additional insureds shared across every customer."). Top right: the page's ONE lime primary, `data-primary` Button "Add additional insured" (opens the drawer in create mode). All other actions ghost/outline/overflow (constitution one-lime rule; header pattern CustomersPage.tsx:99-107).
- Triage strip (3 TriageTiles, max four allowed; `TriageTile` props per src/components/cc/TriageTile.tsx:30-57: `label, count, sub, tone, active, onClick`):
  1. `label="Possible duplicates" count={counts.pending_duplicate_groups} sub="Review and merge" tone={count > 0 ? 'warning' : 'neutral'}`, onClick toggles the duplicate-review view (8.7).
  2. `label="Missing address" count={counts.missing_address} sub="Cannot print on a COI" tone="neutral"`, onClick filters the table to the cohort. (A holder without an address cannot fill the ACORD 25 holder box; this tile routes into real work.)
  3. `label="Never used" count={counts.never_used} sub="Candidates to tidy" tone="neutral"`, cohort filter.
- Filter row (between strip and table, mandated by surface-map.md:19): debounced (250ms) search Input with aria-label; a kind Select (All kinds / Business / Individual / Government / Lender / Other) built from shadcn Select styled per component-rules inputs (six options exceed the segmented-control pattern CustomersPage uses for three); a Clear button when filters active; right-aligned `<span className="ml-auto cc-num ...">{rows.length} shown</span>`.
- Table: dense uniform rows 44-52px in a `rounded-cc-xl border border-cc-border-subtle bg-cc-surface shadow-card` container with `SectionLabel` column headers (CustomersPage pattern). Columns:
  1. Name: `text-cc-text-primary` weight 600, wraps, never truncates (constitution.md:56).
  2. Kind: neutral `Chip` (Chip.tsx:8-25).
  3. City, State.
  4. Contact: email/phone, `text-cc-text-muted`.
  5. Used: `cc-num` usage_count, plus last_used_at as a short absolute date; 0 renders as "Never" in muted text.
  6. Flags: `StatusPill` with the `override` prop (StatusPill.tsx:74) since these states are not in the fixed vocabulary: `override={{ label: 'Possible duplicate', tone: 'warning' }}` when `has_pending_duplicate`; `override={{ label: 'No address', tone: 'neutral' }}` when address missing. Word plus tone, never color alone. (Certificate status pills are NOT rendered here; the one CERT_PILL map lives next to CertificateIssuanceLog per R17 and is owned by 04/06.)
  7. Per-row overflow icon button with `aria-label={'Actions for ' + name}`: Edit (opens drawer in edit mode), Merge into another record (opens AdditionalInsuredMergeDrawer with this row preselected as a loser), Remove (soft delete: sets `deleted_at`; confirm dialog; blocked with an explanatory toast if usage_count > 0).
  Row click opens the edit drawer. Row hover `bg-cc-surface-raised`.
- Loading: `SkeletonRow` stack shaped like the table (component-rules.md:144-147). Empty state (no rows, no filters): one sentence naming the next action plus one button ("No additional insureds yet. Add the first certificate holder." + the Add button). Filtered-empty: "No matches. Clear filters." with a Clear action.

### 8.6 Drawer spec: `AdditionalInsuredDrawer.tsx`

Fork of `LinkAccountDrawer.tsx` (the designated template; it already consumes cc primitives and the Sheet side panel at :88-92). Right-anchored Sheet, `sm:max-w-[480px]`, on `bg-cc-surface` with `border-cc-border-subtle` (within the 420-520px drawer spec, component-rules.md:91-93). One primary action in the footer, outline Cancel beside it (LinkAccountDrawer.tsx:224-241 pattern).

Props:

```ts
interface AdditionalInsuredDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create mode; a row = edit mode (typeahead disabled in edit mode) */
  initial: AdditionalInsuredListRow | null;
  /** create mode only: seeds the Name field on open (create-from-generator flows pass the typed query) */
  initialName?: string;
  /** fires with the FULL saved row so the caller can consume it directly; no follow-up fetch */
  onSaved: (savedRow: AdditionalInsuredSavedRow) => void;
}
```

`onSaved` always delivers the full row (`AdditionalInsuredSavedRow`, Section 8.3: `id, name, kind, address_line1, address_line2, city, state, zip_code`). The drawer owns hydration on every save path: after `resolve_additional_insured` returns an id (create paths), and when an existing typeahead result is selected (the search result carries only summary columns), the drawer performs one select by id to build the full row before firing `onSaved`; edit mode fires with the row it just updated. Callers never re-fetch.

Fields, labels ABOVE fields (never placeholder-only, component-rules.md:53): Name (required), Kind (Select, default Business), Address line 1, Address line 2, City / State / ZIP on one row, Email, Phone, Notes (textarea). Validation errors: `--cc-danger` border + icon + helper text stating the fix + `aria-invalid` + `aria-describedby` (component-rules.md:55). No DateFields needed (the directory has no dates); no PII fields exist on this entity (no DOB/SSN/DLN), so no masking applies here.

Live duplicate typeahead (create mode only), the core dedup UX. When `initialName` is provided, the Name field is pre-seeded on open and the debounced typeahead fires immediately against the seeded value, so a create-from-generator flow sees possible existing holders before typing anything:

1. Debounce effect cloned exactly from LinkAccountDrawer.tsx:44-52: `useEffect` gated on `open && initial === null`, 250ms `setTimeout` calling `search(name)` else `clear()`, with `clearTimeout` cleanup; deps `[name, open, search, clear]`. The hook's memoized `search`/`clear` (8.3) keep this loop-free.
2. While the user types Name, matching rows render beneath the Name field in a bordered scroll list ("Possible existing entries"), each row: name (primary), kind + city/state (muted), `match_reason` chip inline when not plain 'name' (LinkAccountDrawer.tsx:185-191 pattern), and `<Chip><span className="cc-num">{usage_count}</span> certs</Chip>`.
3. Selecting a result switches the drawer to the two-state selected card (LinkAccountDrawer.tsx:146-163 pattern): "Use this existing record" card with a Change button; the footer primary becomes "Use selected". `onSaved` fires with the full existing row and no insert occurs; the drawer hydrates the address block with one select by id first, since the typeahead result carries only summary columns (Section 8.3).
4. An explicit ghost action "Create new anyway" under the list keeps the form active and suppresses the auto-selection, falling through to create.
5. Save (create or create-anyway) calls `resolveAdditionalInsured(...)`, NEVER a raw insert, so a concurrent identical create in another tab still lands on one row (Section 3), then hydrates the returned id into the full row with one select and fires `onSaved` with it. If the RPC returns `matched: true` on a create-anyway (someone else created it milliseconds ago, or normalized-name matched something the typeahead had not surfaced), toast "Matched an existing record" and proceed with that row; this is correct behavior, not an error.
6. Edit mode: fields prefilled, typeahead off, footer primary "Save changes" performing a direct `update` on the row (RLS permits staff-and-member updates per Section 1.4; edits are not identity resolution). `onSaved` fires with the updated full row.

Footer: outline Cancel + one `data-primary` Button ("Add additional insured" / "Use selected" / "Save changes"). Saving state uses the Loader2 spinner-in-button pattern (LinkAccountDrawer.tsx:238), acceptable because it is button-internal progress, not a page loading state.

This same drawer component is reused by the `/certificates` generator surface for inline holder creation (06-ui-surfaces.md); the picker there opens it in create mode with `initialName` seeded from the typed query and consumes the full saved row from `onSaved` directly: the returned address block fills the ACORD 25 holder box with no follow-up fetch.

### 8.7 Duplicate review view

Rendered inside `/additional-insureds` when the "Possible duplicates" tile is active (tile `active` prop true, lime left marker per TriageTile.tsx). Not a separate route: the directory owns its dedup queue, and `/duplicates` remains accounts-only (its reader and merge RPCs hardcode accounts, and mixing entity types in one queue would force a worse UI on both).

`AdditionalInsuredDuplicatesView.tsx`: cards forked from DuplicatesReviewPage's GroupCard (src/pages/DuplicatesReviewPage.tsx:23-95): SectionLabel header (first member name), member-count Chip, `match <n>%` Chip from match_score, member tiles on `bg-cc-surface-raised` showing name, kind chip, city/state, email/phone, `cc-num` usage count, created date, and a muted "created <date>" line so the reviewer can see which is older. Card actions: `data-primary` "Review and merge" (opens AdditionalInsuredMergeDrawer) and a ghost "Dismiss" that calls the dismiss RPC (symmetric with confirm per Section 4.4) with an Undo-less toast ("Dismissed. This exact pair will not be suggested again."). NOTE: the account page has no dismiss button on group cards; this view ships one from day one.

`AdditionalInsuredMergeDrawer.tsx`, forked from MergePreviewDrawer: survivor radio selection across members (default: highest usage, then oldest), calls `previewAdditionalInsuredMerge` on open, renders `reparent_counts` ("12 issued certificates move"), `field_diff` (current vs incoming per scalar), and `block_reason` when not mergeable (kind guard). Footer primary "Merge records" calls `merge_additional_insured_duplicate_group` (from a group) or `mergeAdditionalInsuredsManual` (from the row overflow). Below the group list, a "Recently merged" strip clones DuplicatesReviewPage's RecentlyMerged (:97-143) reading `merge_history` where `entity_type = 'additional_insureds'` and `unmerged_at is null`, with an Undo button per row calling `unmergeAdditionalInsured` (single-loser merges only, matching the RPC's guard; hide Undo for multi-loser rows).

Accessibility and gate: every interactive element keyboard-reachable with the visible 2px focus ring, one H1, skip link inherited from AppLayout, `aria-pressed` on filter toggles, and the full design-system/acceptance-checklist.md gate EXCEPT its stale line 35 dark-only item; verify in both themes (App.tsx ships a live theme toggle per the design-system discrepancy note).

---

## 9. Sequencing (explicit build order)

Migrations (one file each, timestamps in order):

1. `<ts1>_additional_insureds_directory.sql`: table + updated_at trigger + workspace-derive trigger (Section 1.6) + indexes + RLS + `duplicate_detection_rules` seed row (Sections 1.1, 1.2, 1.4, 1.5, 1.6). Depends only on `normalize_entity_name`, `set_updated_at`, `is_staff`, `is_agency_member` (20251228000000_m0_agency_workspace_foundation.sql:125), `agency_workspaces`, all pre-existing.
2. `<ts2>_additional_insureds_resolve.sql`: `resolve_additional_insured` (Section 3).
3. `<ts3>_additional_insureds_dedup.sql`: `generate_additional_insured_duplicates`, `list_additional_insured_duplicate_groups`, `dismiss_additional_insured_duplicate_group` (Section 4). Depends on `cleanup.norm_addr` (exists, 20260628150352:20-39). If this lands before the issuance table, the reader ships with the usage placeholder (see step 5's rule).
4. `<ts4>_additional_insureds_merge.sql`: `assert_additional_insured_mergeable`, `_do_additional_insured_merge`, the three wrappers, `unmerge_additional_insured` (Section 5).
5. `<ts5>_additional_insureds_readers.sql`: `search_additional_insureds`, `list_additional_insureds`, `count_additional_insured_cohorts` (Sections 2, 8.4). MUST land after the issuance area's `certificates` migration (04-issuance-and-snapshots.md) because of the `certificates.holder_id` / `certificates.issued_at` usage subselects; if the issuance table is not yet merged, ship these with `0::int as usage_count, null::timestamptz as last_used_at` placeholders and add a follow-up wire-up file (drop + recreate with the real subselects) once it exists. That wire-up creates NO index: `idx_certificates_holder` is created once, by the issuance migration (R11).
6. `<ts6>_additional_insureds_fk_wireup.sql`: the ONE constraint-only wire-up for all five per-policy link columns (Section 7.3, R12). Hard sequencing: after the Master COI column migration (02-master-coi-data-layer.md) AND after step 1. Idempotent via the pg_constraint guards (R22b).

Then:

7. Edge function `supabase/functions/suggest-additional-insured-duplicates/index.ts` + `supabase/config.toml` entry; deploy (CLAUDE.md: edge functions are deployed automatically on the user's behalf).
8. `.github/workflows/suggest-additional-insured-duplicates.yml`.
9. Regenerate types: `supabase gen types typescript --project-id lrqajzwcmdwahnjyidgv > src/integrations/supabase/types.ts`.
10. Frontend: `useAdditionalInsureds.ts` hook, then `AdditionalInsuredDrawer.tsx`, then `AdditionalInsuredsPage.tsx` + the two review components, then `App.tsx` route + `navConfig.ts` entry.
11. Manual verification against the acceptance checklist in both themes; seed a handful of rows through the drawer and confirm:
    - typeahead surfaces near-matches with match_reason; resolve dedupes an exact re-entry;
    - generator creates a pending group for two fuzzy rows; dismiss suppresses regeneration;
    - merge writes merge_history and tombstones; unmerge restores;
    - MERGE-THEN-UNMERGE WITH ISSUED CERTIFICATES (required by R4): once the issuance path exists (04), issue at least one certificate to each of two holders (synthetic data via `generate-certificate` in a branch or staging), merge them, and confirm the merge SUCCEEDS (the freeze trigger permits the `holder_id` reparent), `reparent_counts['certificates.holder_id']` is correct, derived usage_count follows the survivor, and every previously issued cert still renders its original holder block from the snapshot; then unmerge and confirm exactly the loser's reparented certificate ids move back per the manifest, usage counts split correctly, and the duplicate group reopens. This case also appears in 04's acceptance tests; run it from both sides.

Test data note: since prod has zero holder rows anywhere, dedup correctness cannot be validated against real data; the implementing engineer must create synthetic fixtures (same-name pairs, suffix-variant addresses via `norm_addr`, shared-phone distinct-name pairs that must NOT group without name similarity).

---

## 10. Risks

- Cross-area dependency: usage columns in the reader RPCs depend on `public.certificates(holder_id, issued_at)` landing per the Section 6 contract (04-issuance-and-snapshots.md owns the table and `idx_certificates_holder`). Mitigated by the placeholder-then-wireup path in Section 9 step 5.
- Freeze-trigger contract: the merge engine's `certificates.holder_id` reparent works ONLY while the certificates freeze trigger keeps `holder_id`, `account_id`, and `agency_workspace_id` OFF its frozen-column list (R4). If a future hardening pass re-freezes those columns, every holder merge and account merge with issued certs aborts. The Section 9 step 11 acceptance case is the regression tripwire; 04-issuance-and-snapshots.md documents the same invariant from its side.
- Name ambiguity: three `*additional_insureds*` tables now exist in generated types; a mis-imported type would typecheck loosely (strict mode is off project-wide per CLAUDE.md). Mitigate with the distinct `AdditionalInsured*` TS interface names in the hook and code review attention.
- Suggester precision is untuned: thresholds (0.55/0.4/0.3) are inherited from the ground-truth recipe, not validated against real holder data (none exists). The human-confirm gate means bad thresholds cost review time, never data corruption; tune after the first real batch.
- The dismissed-set-equality idempotency check is O(groups x candidates) with array sorting; fine at directory scale (expected low thousands), revisit only if the nightly job ever appears in slow logs.
- `%` operator behavior is pinned via a function-level GUC set; if a future migration recreates the search RPC without `set pg_trgm.similarity_threshold`, behavior silently follows server default. Comment in the migration warns against it.
- Kind guard blocks individual/non-individual merges outright; if a real record was miscreated with the wrong kind, staff must edit the kind first, then merge. Acceptable friction, documented in the merge drawer's block_reason copy.
- Multi-workspace future: the generator, the merge engine, and the duplicate reader are not workspace-partitioned (single-workspace prod makes partitioning a no-op today). If a second `agency_workspaces` row ever appears: add a workspace equality guard to `assert_additional_insured_mergeable`, partition the generator's `live` CTE by `agency_workspace_id`, and re-check the reader's member_count vs members-array note in Section 4.3. The R14 RLS and RPC predicates already prevent cross-workspace reads.
