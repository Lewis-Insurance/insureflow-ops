// Rules-as-data source for the acord_templates.validation_rules JSONB (secondary,
// for the generic /acord-forms editor only; validateAcord25 is the correctness
// gate).
//
// RUNTIME-FREE. No DOM, no Node, no pdf-lib, no imports outside this directory.
// This module is NOT ported to Deno (client/onboarding-only).
//
// Authority: docs/COI Module/coi-module/05-acord25-pipeline.md Section 5.1;
// blueprint B Section 5.
//
// Each rule references a field-map LOGICAL KEY (logicalField). The publish script
// (scripts/acord25/publish-template-config.ts) substitutes ACORD25_FIELD_MAP[key]
// .pdfField for the on-row `field` before writing the row, so the JSON stored on
// the template carries exact PDF field names while this source stays readable and
// drift-proof against the field map.

import type { Acord25LogicalKey } from './fieldMap';

/** A single-field rule the generic engine can execute (required only, here). */
export interface Acord25ValidationRuleSource {
  id: string;
  type: 'required';
  /** Field-map logical key; the publish script resolves it to the exact pdfField. */
  logicalField: Acord25LogicalKey;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * The 8 authored rules (Section 5.1). Order is stable so the published JSON is
 * deterministic.
 */
export const ACORD25_VALIDATION_RULES: Acord25ValidationRuleSource[] = [
  {
    id: 'a25_req_insured_name',
    type: 'required',
    logicalField: 'insuredName',
    message: 'Named insured is required',
    severity: 'error',
  },
  {
    id: 'a25_req_producer_name',
    type: 'required',
    logicalField: 'producerName',
    message: 'Producer agency name is required',
    severity: 'error',
  },
  {
    id: 'a25_req_cert_date',
    type: 'required',
    logicalField: 'certificateDate',
    message: 'Certificate date is required',
    severity: 'error',
  },
  {
    id: 'a25_req_insurer_a_name',
    type: 'required',
    logicalField: 'insurerName_A',
    message: 'Insurer A is required; at least one coverage line must be selected',
    severity: 'error',
  },
  {
    id: 'a25_req_insurer_a_naic',
    type: 'required',
    logicalField: 'insurerNaic_A',
    message: 'Insurer A NAIC code is missing',
    severity: 'warning',
  },
  {
    id: 'a25_req_holder_name',
    type: 'required',
    logicalField: 'holderName',
    message: 'Certificate holder is required before issue',
    severity: 'warning',
  },
  {
    id: 'a25_req_desc_ops',
    type: 'required',
    logicalField: 'descriptionOfOperations',
    message: 'Description of operations is empty',
    severity: 'warning',
  },
  {
    id: 'a25_req_auth_rep',
    type: 'required',
    logicalField: 'authorizedRepName',
    message: 'Authorized representative name is required',
    severity: 'error',
  },
];
