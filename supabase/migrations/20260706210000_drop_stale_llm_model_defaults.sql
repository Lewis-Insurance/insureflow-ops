-- ============================================================================
-- Drop the stale llm_model column defaults on the extraction-job tables
-- ============================================================================
-- The Dec-2024 migrations set DEFAULT 'claude-sonnet-4-20250514' - a model
-- that has since been retired. The extract fns now stamp llm_model explicitly
-- on every insert (PR #72), so a default only exists to mislead: any future
-- writer that forgets the column would silently record a model it never
-- called. No default is the honest state.

alter table public.policy_wc_extraction_jobs        alter column llm_model drop default;
alter table public.policy_bap_extraction_jobs       alter column llm_model drop default;
alter table public.policy_eo_extraction_jobs        alter column llm_model drop default;
alter table public.policy_cgl_extraction_jobs       alter column llm_model drop default;
alter table public.policy_property_extraction_jobs  alter column llm_model drop default;
alter table public.policy_umbrella_extraction_jobs  alter column llm_model drop default;
