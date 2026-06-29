-- Merge hardening T6: every public.account_id column gets a FK to accounts(id).
-- merge_accounts walks pg_constraint for FKs whose confrelid = accounts; columns
-- without a FK are invisible to that loop and would strand loser data. These 12
-- account_id columns had no FK (all currently empty, so adding is safe + validated).
-- Additive and reversible (drop constraint).

alter table public.account_churn_risk_scores
  add constraint account_churn_risk_scores_account_id_fkey foreign key (account_id) references public.accounts(id) on delete cascade;
alter table public.ao_renewals
  add constraint ao_renewals_account_id_fkey foreign key (account_id) references public.accounts(id) on delete cascade;
alter table public.automation_rules
  add constraint automation_rules_account_id_fkey foreign key (account_id) references public.accounts(id) on delete cascade;
alter table public.automation_workflow_executions
  add constraint automation_workflow_executions_account_id_fkey foreign key (account_id) references public.accounts(id) on delete cascade;
alter table public.canopy_invites
  add constraint canopy_invites_account_id_fkey foreign key (account_id) references public.accounts(id) on delete cascade;
alter table public.coverage_gap_opportunities
  add constraint coverage_gap_opportunities_account_id_fkey foreign key (account_id) references public.accounts(id) on delete cascade;
alter table public.document_analysis_jobs
  add constraint document_analysis_jobs_account_id_fkey foreign key (account_id) references public.accounts(id) on delete cascade;
alter table public.document_chunks
  add constraint document_chunks_account_id_fkey foreign key (account_id) references public.accounts(id) on delete cascade;
alter table public.document_insights
  add constraint document_insights_account_id_fkey foreign key (account_id) references public.accounts(id) on delete cascade;
alter table public.marketing_survey_responses
  add constraint marketing_survey_responses_account_id_fkey foreign key (account_id) references public.accounts(id) on delete cascade;
alter table public.policy_renewal_risk_scores
  add constraint policy_renewal_risk_scores_account_id_fkey foreign key (account_id) references public.accounts(id) on delete cascade;
alter table public.portal_branding
  add constraint portal_branding_account_id_fkey foreign key (account_id) references public.accounts(id) on delete cascade;
