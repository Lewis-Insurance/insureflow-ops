-- intake-v4 migration M2: cut the leads table from twenty triggers to five.
--
-- ledger version: pending
--
-- NEEDS LANDEN APPROVAL BEFORE PROD APPLY, AND BRIAN'S SIGN OFF ON THE TWO OUTBOX
-- TRIGGERS (tr_leads_created, tr_leads_status_changed). Apply through the Supabase
-- management API (MCP apply_migration) only. Never run a CLI push against production.
--
-- Why
--   Today a single lead insert fires twenty triggers: four separate scoring paths,
--   campaign auto enrolment, the automation rules engine, two outbox emitters, four
--   pipeline stage writers, a producer workload roll up and a lead source counter.
--   None of that is used. There are 33 leads in the whole database, none created in
--   the last 90 days, none ever converted. Before the first real prospect is typed
--   in, this surface has to be small enough to reason about.
--
-- The five that stay, and why each earns its place
--   update_leads_updated_at        keeps updated_at honest
--   leads_search_update            maintains search_vector, which global search reads
--   prevent_hard_delete_leads      enforces soft delete only (invariant rule 6)
--   log_lead_status_change         writes lead_activities, the audit trail for status
--   trigger_record_lead_assignment writes lead_assignments, the assignment trail
--
-- The fifteen dropped, grouped
--   Scoring (4):   auto_assign_new_lead, auto_score_lead, calculate_lead_score_on_change,
--                  lead_auto_score_trigger
--   Score log (1): log_lead_score_change
--   Pipeline (4):  log_pipeline_stage_transition_trigger, notify_pipeline_stage_change,
--                  update_lead_stage_time_trigger, update_stage_counts_trigger
--   Campaigns (1): trigger_auto_enroll_campaigns
--   Automation (1):trigger_automation_rules_on_leads
--   Workload (1):  trigger_update_workload_stats
--   Source count(1):update_lead_source_count
--   Outbox (2):    tr_leads_created, tr_leads_status_changed   <-- BRIAN GATES THESE TWO
--
-- About the two outbox triggers
--   Both only emit when the lead already has a customer account attached
--   (get_account_workspace_id(NEW.account_id) returns null otherwise). Every lead in
--   production has none, so zero lead events exist and neither trigger has ever
--   fired. tr_lead_created also reads NEW.source, a column the leads table does not
--   have; that statement would raise as soon as a lead with an account is inserted.
--   Report section 11.1 shows why this matters: the new Promote operation sets the
--   account pointer, which is exactly the condition that makes both triggers
--   reachable and the missing column fatal. Promote therefore ships only after this
--   migration. This is dead code removal, not a change to live traffic, but it is
--   Brian's architecture so it is his call.
--
-- The functions behind the dropped triggers are deliberately left in place. Dropping
-- a trigger is reversible in one statement; dropping a function is not, and several
-- are shared. The down script below recreates all fifteen from their production
-- definitions read on 2026-09-03.
--
-- Smoke test after apply
--   1. count triggers on public.leads: expect exactly 5, and the five names above
--   2. insert a lead, then update its status: no error, lead_activities gains a row
--   3. run the down script, count again: expect 20

drop trigger if exists auto_assign_new_lead on public.leads;
drop trigger if exists auto_score_lead on public.leads;
drop trigger if exists calculate_lead_score_on_change on public.leads;
drop trigger if exists lead_auto_score_trigger on public.leads;
drop trigger if exists log_lead_score_change on public.leads;
drop trigger if exists log_pipeline_stage_transition_trigger on public.leads;
drop trigger if exists notify_pipeline_stage_change on public.leads;
drop trigger if exists trigger_auto_enroll_campaigns on public.leads;
drop trigger if exists trigger_automation_rules_on_leads on public.leads;
drop trigger if exists trigger_update_workload_stats on public.leads;
drop trigger if exists update_lead_source_count on public.leads;
drop trigger if exists update_lead_stage_time_trigger on public.leads;
drop trigger if exists update_stage_counts_trigger on public.leads;

-- The two below are gated on Brian. If he has not signed off, comment these two out
-- and apply the rest; the other thirteen do not wait on him.
drop trigger if exists tr_leads_created on public.leads;
drop trigger if exists tr_leads_status_changed on public.leads;

-- >>> DOWN BEGIN
/*
create trigger auto_assign_new_lead after insert on public.leads for each row execute function trigger_auto_assign_lead();
create trigger auto_score_lead after insert or update on public.leads for each row when ((new.status <> ALL (ARRAY['won'::text, 'lost'::text]))) execute function auto_score_lead_trigger();
create trigger calculate_lead_score_on_change after insert or update on public.leads for each row execute function trigger_calculate_lead_score();
create trigger lead_auto_score_trigger after insert or update of insurance_types, current_premium, decision_timeframe, email, phone, current_carrier, source_id on public.leads for each row execute function trigger_lead_scoring();
create trigger log_lead_score_change after update on public.leads for each row execute function log_lead_score_change();
create trigger log_pipeline_stage_transition_trigger after update of pipeline_stage_id on public.leads for each row when ((old.pipeline_stage_id IS DISTINCT FROM new.pipeline_stage_id)) execute function log_pipeline_stage_transition();
create trigger notify_pipeline_stage_change after update on public.leads for each row execute function trigger_pipeline_stage_change();
create trigger tr_leads_created after insert on public.leads for each row execute function tr_lead_created();
create trigger tr_leads_status_changed after update on public.leads for each row execute function tr_lead_status_changed();
create trigger trigger_auto_enroll_campaigns after insert or update on public.leads for each row execute function auto_enroll_lead_in_campaigns();
create trigger trigger_automation_rules_on_leads after insert or update on public.leads for each row execute function trigger_automation_on_lead_change();
create trigger trigger_update_workload_stats after insert or update of assigned_to, status, estimated_premium on public.leads for each row execute function update_producer_workload_stats();
create trigger update_lead_source_count after insert or delete or update on public.leads for each row execute function update_lead_source_count();
create trigger update_lead_stage_time_trigger before update of pipeline_stage_id on public.leads for each row when ((old.pipeline_stage_id IS DISTINCT FROM new.pipeline_stage_id)) execute function update_lead_stage_time();
create trigger update_stage_counts_trigger after update of pipeline_stage_id on public.leads for each row when ((old.pipeline_stage_id IS DISTINCT FROM new.pipeline_stage_id)) execute function update_stage_counts();
*/
-- >>> DOWN END
