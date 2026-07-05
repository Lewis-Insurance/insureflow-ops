// Certificate issuance shared types.
//
// Owned by docs/COI Module/coi-module/04-issuance-and-snapshots.md (Sections 7.2
// and 9.1). 06-ui-surfaces.md imports these; there is no parallel vocabulary.
//
// Types only. No runtime code. Column and field names mirror the
// `certificates` / `certificate_policies` / `certificate_events` tables and the
// `generate-certificate` edge-function wire contract exactly.

import type { RequirementsEvaluation } from '@/lib/acord/acord25/requirements';

// ---------------------------------------------------------------------------
// Canonical enums (04 Sections 0, 2, 9.1)
// ---------------------------------------------------------------------------

/** Certificate lifecycle status (04 Section 3.1 CHECK; 04 Section 5.1). */
export type CertificateStatus = 'issued' | 'sent' | 'voided' | 'superseded';

/**
 * Canonical coverage line keys (R7). Same vocabulary as the Master COI read
 * model (`src/types/master-coi.ts` `COILineKey`); duplicated here so certificate
 * consumers do not have to import the read-model contract.
 */
export type CertificateLineKey = 'gl' | 'auto' | 'umbrella' | 'wc' | 'property' | 'other';

/**
 * Insurer letter (04 Section 3.2 CHECK). A..F, one per distinct carrier.
 */
export type CertificateInsurerLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** Issuance-log action taxonomy (04 Section 3.3 CHECK). */
export type CertificateEventAction =
  | 'generated'
  | 'previewed'
  | 'downloaded'
  | 'emailed'
  | 'reissued'
  | 'voided'
  | 'document_restored'
  /** 07 §4.4 (E5): operator proceeded past a failing holder-requirements evaluation. */
  | 'requirements_overridden';

/**
 * Endorsement resolution three-state (02 Section 4.7; only 'endorsed' can print
 * Y). Mirrored here so the snapshot type is self-contained.
 */
export type CertificateEndorsementResolved = 'endorsed' | 'requested' | 'none';

// ---------------------------------------------------------------------------
// The immutable snapshot JSONB (04 Section 4, exact schema)
// ---------------------------------------------------------------------------

/** A single insurer-letter slot A..F inside the snapshot (04 Section 4). */
export interface CertificateSnapshotInsurer {
  carrier_id: string | null;
  name: string;
  naic: string | null;
}

/**
 * The GL/auto/umbrella/wc/property limit block frozen per line. Every field is
 * optional because different lines populate different limit keys; values are the
 * numeric amounts read from `get_master_coi` (04 Section 4).
 */
export interface CertificateSnapshotLimits {
  // GL
  each_occurrence?: number | null;
  damage_to_rented_premises?: number | null;
  medical_expense?: number | null;
  personal_adv_injury?: number | null;
  general_aggregate?: number | null;
  products_completed_ops?: number | null;
  // Auto
  combined_single_limit?: number | null;
  bi_per_person?: number | null;
  bi_per_accident?: number | null;
  property_damage?: number | null;
  // Umbrella / excess
  umbrella_each_occurrence?: number | null;
  umbrella_aggregate?: number | null;
  // WC
  el_each_accident?: number | null;
  el_disease_each_employee?: number | null;
  el_disease_policy_limit?: number | null;
  // Property / other free row
  property_limit?: number | null;
  property_limit_description?: string | null;
}

/** One printed coverage line inside the snapshot (04 Section 4). */
export interface CertificateSnapshotLine {
  line_key: CertificateLineKey;
  policy_id: string;
  policy_number: string;
  insurer_letter: CertificateInsurerLetter;
  effective_date: string;
  expiration_date: string;
  limits: CertificateSnapshotLimits;

  /** Literal Y/N as printed on the ADDL INSD column. */
  addl_insd: 'Y' | 'N';
  /** The request's per-line print intent (audit). */
  addl_insd_intent: boolean;
  /** resolve_holder_endorsements output for this (line, holder). */
  addl_insd_resolved: CertificateEndorsementResolved;

  /** Literal Y/N as printed on the SUBR WVD column. */
  subr_wvd: 'Y' | 'N';
  subr_wvd_intent: boolean;
  subr_wvd_resolved: CertificateEndorsementResolved;

  /** Basis string from resolve_holder_endorsements when endorsed, else null. */
  endorsement_basis: string | null;
}

/** A US-style address block frozen in the snapshot (04 Section 4). */
export interface CertificateSnapshotAddress {
  line1: string;
  city: string;
  state: string;
  zip: string;
}

/**
 * The self-contained immutable freeze stored in `certificates.snapshot`
 * (04 Section 4). `snapshot_version` discriminates schema revisions; readers
 * switch on it.
 */
export interface CertificateSnapshot {
  snapshot_version: 1;
  certificate_number: string;
  revision: number;

  form: {
    form_number: '25';
    template_id: string;
    template_version: string;
    acord_edition: string;
    /** Hash of the blank template used (ACORD25_TEMPLATE_SHA256 pin, 05). */
    template_pdf_sha256: string;
  };

  /**
   * The exact map handed to the fill engine. Keys are the template's extracted
   * AcroForm field names; values are boolean for checkbox fields and
   * 'Y' | 'N' | '' | formatted string for text fields (R8). No '/1' or '/Off'
   * export-value strings appear here.
   */
  field_values: Record<string, string | boolean>;

  producer: {
    name: string;
    address: string;
    phone: string;
    email: string;
  };

  insured: {
    account_id: string;
    name: string;
    dba: string | null;
    address: CertificateSnapshotAddress;
  };

  /** Insurer letter map A..F, copied verbatim from get_master_coi (R7). */
  insurers: Partial<Record<CertificateInsurerLetter, CertificateSnapshotInsurer>>;

  /** One entry per coverage line printed on the certificate. */
  lines: CertificateSnapshotLine[];

  holder: {
    additional_insured_id: string;
    name: string;
    address: CertificateSnapshotAddress;
  };

  /** User-entered free text (R18). */
  description_of_operations: string;
  /** User-entered free text (R18); overflow is a 422, never an addendum (R16). */
  remarks: string | null;

  master_coi: {
    /** ISO timestamp of when get_master_coi was read. */
    as_of: string;
    source: 'master_coi';
  };

  /**
   * The holder-requirements evaluation the SERVER re-ran at issue time (07 §4),
   * embedded in the immutable snapshot ONLY when the holder has requirements.
   * Carries the per-requirement results plus the override provenance (overridden /
   * overridden_by) when the operator issued over a failing evaluation. Absent when
   * the holder has no requirements.
   */
  requirements_evaluation?: RequirementsEvaluation;
}

// ---------------------------------------------------------------------------
// Row-mirror types (04 Section 9.1)
// ---------------------------------------------------------------------------

/** Mirrors a `public.certificates` row (04 Section 3.1). */
export interface CertificateRecord {
  id: string;
  agency_workspace_id: string;
  account_id: string;
  holder_id: string;
  certificate_number: string;
  revision: number;
  template_id: string;
  template_version: string;
  acord_edition: string;
  source_form_id: string | null;
  snapshot: CertificateSnapshot;
  snapshot_sha256: string;
  pdf_sha256: string;
  storage_bucket: string;
  storage_path: string;
  size_bytes: number;
  document_id: string | null;
  status: CertificateStatus;
  issued_by: string;
  issued_at: string;
  sent_to: string | null;
  sent_at: string | null;
  supersedes_id: string | null;
  superseded_by_id: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
}

/** Mirrors a `public.certificate_events` row (04 Section 3.3). */
export interface CertificateEvent {
  id: string;
  certificate_id: string;
  agency_workspace_id: string;
  action: CertificateEventAction;
  actor_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * The light row returned by the `list_certificates` reader (04 Section 9.1).
 * Excludes `snapshot`; reissue-prefill fetches the full row separately.
 */
export interface CertificateListItem {
  id: string;
  certificate_number: string;
  revision: number;
  status: CertificateStatus;
  holder_id: string;
  /** Projected from snapshot->'holder'->>'name'. */
  holder_name: string;
  issued_at: string;
  issued_by: string;
  /** Projected from profiles.full_name. */
  issued_by_name: string | null;
  sent_to: string | null;
  sent_at: string | null;
  supersedes_id: string | null;
  superseded_by_id: string | null;
  superseded_by_number: string | null;
  void_reason: string | null;
  storage_bucket: string;
  storage_path: string;
  pdf_sha256: string;
  size_bytes: number;
  /** Nullable (ON DELETE SET NULL). */
  document_id: string | null;
  line_keys: CertificateLineKey[];
}

// ---------------------------------------------------------------------------
// generate-certificate wire contract (04 Section 7.2)
// ---------------------------------------------------------------------------

/** One requested line in a generate-certificate call (04 Section 7.2). */
export interface GenerateCertificateRequestLine {
  policy_id: string;
  line_key: CertificateLineKey;
  /**
   * Cross-check ONLY (R7): the client echoes the letters it displayed from
   * get_master_coi. The server re-reads get_master_coi and 422s on any mismatch;
   * it never trusts these as an assignment.
   */
  insurer_letter: CertificateInsurerLetter;
  per_line: {
    /** Print intent; downgrade-only (R3). */
    addl_insd: boolean;
    /** Print intent; downgrade-only (R3). */
    subr_wvd: boolean;
  };
}

/** POST body for `generate-certificate` (04 Section 7.2). */
export interface GenerateCertificateRequest {
  account_id: string;
  /** additional_insureds.id */
  holder_id: string;
  lines: GenerateCertificateRequestLine[];
  /** Its own labeled field in the generator (R18). */
  description_of_operations: string;
  /** Its own labeled field in the generator (R18). */
  remarks?: string;
  /**
   * Hash of the client's previewed deterministic build (R9). Required in interactive
   * mode; optional in reissue mode (07 §3.4), where the server derives everything from
   * the source snapshot and the diff gate replaces the preview binding.
   */
  preview_sha256?: string;
  supersedes_certificate_id?: string;
  /** Optional acord_forms provenance only (R1). */
  source_form_id?: string;
  /**
   * 07 §3.4 renewal cascade. Default 'interactive' (omit for the byte-identical
   * pre-extension contract). In 'reissue' mode the server loads `reissue_of`'s snapshot
   * and derives holder/lines/print-intent/DOO/remarks from it; any of those present in
   * the request are ignored.
   */
  mode?: 'interactive' | 'reissue';
  /** The certificate to reissue (required when mode==='reissue'). */
  reissue_of?: string;
  /**
   * 07 §4.4 holder-requirements override acknowledgment. The client sets this true only
   * after the operator confirms the "requirements failing" dialog. The server re-runs the
   * SAME shared evaluation and, when the server's result also fails, records the override
   * (snapshot `requirements_evaluation.overridden` + a `requirements_overridden` event).
   * Advisory only: it never gates issuance and the server never 422s on requirement failures.
   */
  requirements_overridden?: boolean;
}

/** Per-line old-vs-new diff returned by a reissue (07 §3.4). */
export interface DiffSummaryField<T = string | null> {
  old: T;
  new: T;
}
export interface DiffSummaryLine {
  line_key: string;
  effective_date: DiffSummaryField;
  expiration_date: DiffSummaryField;
  insurer_letter: DiffSummaryField;
  addl_insd: DiffSummaryField;
  subr_wvd: DiffSummaryField;
  limits: Record<string, DiffSummaryField<unknown>>;
  changed: boolean;
}

/** 200 response from `generate-certificate` (04 Section 7.2). */
export interface GenerateCertificateResponse {
  certificate_id: string;
  certificate_number: string;
  /** 3600s signed URL for immediate download/preview. */
  signed_url: string;
  /** The Documents-tab pointer row, for tab navigation. */
  document_id: string;
  /** Near-expiry within 30 days ONLY (R6). */
  warnings: string[];
  /** Present only for a reissue (mode==='reissue'): per-line old-vs-new (07 §3.4). */
  diff_summary?: DiffSummaryLine[];
}

// ---------------------------------------------------------------------------
// Status pill map (04 Section 9.1, R11) - re-exported by CertificateIssuanceLog
// ---------------------------------------------------------------------------

/**
 * The single status-pill map for all four certificate statuses. The issuance-log
 * component re-exports this; there is no parallel map anywhere (R11, R17).
 */
export const CERT_PILL: Record<
  CertificateStatus,
  { label: string; tone: 'neutral' | 'success' | 'muted' | 'danger' }
> = {
  issued: { label: 'Issued', tone: 'neutral' },
  sent: { label: 'Sent', tone: 'success' },
  superseded: { label: 'Superseded', tone: 'muted' },
  voided: { label: 'Voided', tone: 'danger' },
};
