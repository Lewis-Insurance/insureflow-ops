-- Auto "covered autos" symbol checkboxes: make the ACORD 25 Automobile Liability
-- covered-auto boxes (ANY AUTO / OWNED AUTOS ONLY / SCHEDULED AUTOS / HIRED AUTOS
-- ONLY / NON-OWNED AUTOS ONLY) editable from the policy page.
--
-- These were already fully wired to PRINT on the certificate (fieldMap ->
-- buildAcord25FieldValues -> Vehicle_*Indicator_A) and are already RETURNED by the
-- read model (get_master_coi / coi_build_line reads bap_details.coverage.symbols.*),
-- but they were read-only: there was no coi_field_registry row, so
-- save_master_coi_fields rejected any write to them as unknown_path.
--
-- The only gap is the whitelist. save_master_coi_fields already routes
-- bap_details.* writes to the BAP blob and already validates value_type='boolean',
-- so NO function change is needed - adding these five registry rows is sufficient
-- to make the symbols editable end to end. The UI writes each toggle straight
-- through save_master_coi_fields (the certificate source of truth), so a change
-- flows into what the certificate prints.
--
-- Idempotent.

insert into public.coi_field_registry
  (path, line_kind, storage, value_type, enum_values, label, acord25_box, required_for_ready, sort_order)
values
  ('bap_details.coverage.symbols.any_auto',        'auto', 'jsonb', 'boolean', null, 'Auto Any Auto',             'Vehicle_AnyAutoIndicator_A',        false, 260),
  ('bap_details.coverage.symbols.owned_autos',     'auto', 'jsonb', 'boolean', null, 'Auto Owned Autos Only',     'Vehicle_AllOwnedAutosIndicator_A',  false, 270),
  ('bap_details.coverage.symbols.scheduled_autos', 'auto', 'jsonb', 'boolean', null, 'Auto Scheduled Autos',      'Vehicle_ScheduledAutosIndicator_A', false, 280),
  ('bap_details.coverage.symbols.hired_autos',     'auto', 'jsonb', 'boolean', null, 'Auto Hired Autos Only',     'Vehicle_HiredAutosIndicator_A',     false, 290),
  ('bap_details.coverage.symbols.non_owned_autos', 'auto', 'jsonb', 'boolean', null, 'Auto Non-Owned Autos Only', 'Vehicle_NonOwnedAutosIndicator_A',  false, 300)
on conflict (path) do nothing;
