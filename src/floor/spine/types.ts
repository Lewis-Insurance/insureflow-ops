export const WORK_REQUEST_STATES = [
  'received',
  'routed',
  'resolving',
  'needs_identity',
  'executing',
  'awaiting_approval',
  'approved',
  'sent',
  'delivered',
  'failed_delivery',
  'killed',
  'fell_through',
] as const;

export type WorkRequestState = (typeof WORK_REQUEST_STATES)[number];

export type WorkRequestSource =
  | 'email'
  | 'slack_forward'
  | 'crm_button'
  | 'voice'
  | 'heartbeat';

export type RiskLevel = 'green' | 'yellow' | 'red';

export type FeedbackVerb = 'approve' | 'edit' | 'kill';

export type RecipientBasis = 'account_of_record' | 'approved_holder';

export type AutonomyTier = 1 | 2 | 3 | 4;

export type Tier3EmailSurface = 'send-coi-email' | 'send-id-card-email';

/** Exact send-coi-email/index.ts shape — do not change. */
export interface SendCOIEmailRequest {
  to: string;
  certificateNumber: string;
  certificateUrl: string;
  holderName: string;
}

/** Exact send-id-card-email/index.ts shape — do not change. */
export interface SendIdCardEmailRequest {
  to: string;
  policyNumber: string;
  idCardUrl: string;
  insuredName: string;
}

export type Tier3EmailPayload = SendCOIEmailRequest | SendIdCardEmailRequest;

/** Stored inside floor_client_send_approvals.send_payload to route release. */
export const FLOOR_SEND_SURFACE_KEY = '_floor_send_surface';

export interface DocumentRef {
  label: string;
  signedUrl: string;
}

export interface DecisionField {
  key: string;
  label: string;
  value: string;
  locked: boolean;
  source: 'policy' | 'account' | 'holder_demand' | 'agent';
}

export interface CoverageDiffLine {
  coverage: string;
  demanded: string;
  actual: string;
  status: 'meets' | 'short' | 'not_backed';
}

export interface CoverageDiff {
  lines: CoverageDiffLine[];
  overall: RiskLevel;
}

export interface SendSpec {
  channel: 'email';
  send_surface: Tier3EmailSurface;
  recipient: string;
  recipient_basis: RecipientBasis;
  authorized_rep_of_record: string;
  payload: Tier3EmailPayload;
}

export interface DecisionPackage {
  id: string;
  work_request_id: string;
  play_id: string;
  play_version: string;
  headline: string;
  summary: string;
  risk: RiskLevel;
  client_ref: string;
  document_ref: DocumentRef | null;
  fields: DecisionField[];
  diff: CoverageDiff | null;
  send_spec: SendSpec;
  created_at: string;
}

export interface WorkRequest {
  id: string;
  agency_workspace_id: string;
  action: string;
  play_id: string | null;
  play_version: string | null;
  source: WorkRequestSource;
  sender_identity: string | null;
  client_ref: string | null;
  resolution_confidence: number | null;
  owner_id: string | null;
  decision_package_id: string | null;
  status: WorkRequestState;
  idempotency_key: string;
  request_body: Record<string, unknown>;
  source_event_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface FeedbackEvent {
  id: string;
  work_request_id: string;
  play_id: string;
  play_version: string;
  verb: FeedbackVerb;
  actor_id: string;
  field_edits: Array<{ key: string; from: string; to: string }> | null;
  kill_reason: string | null;
  created_at: string;
}

export interface FloorClientSendApproval {
  id: string;
  work_request_id: string;
  approver_id: string;
  status: 'approved' | 'held' | 'sent' | 'delivered' | 'failed_delivery' | 'killed';
  hold_until: string | null;
  recipient: string;
  recipient_basis: RecipientBasis;
  send_payload: Tier3EmailPayload & Record<string, unknown>;
  message_id?: string | null;
  created_at: string;
}

export interface InboundMessage {
  from: string;
  subject?: string;
  spf: 'pass' | 'fail' | 'neutral' | 'none';
  dkim: 'pass' | 'fail' | 'none';
  dmarc: 'pass' | 'fail' | 'none';
  attachments?: Array<{ contentType: string; filename: string }>;
  forwardedFrom?: string | null;
}

export type RouteDecision =
  | { route: 'fall_through'; reason: string }
  | { route: 'work_request'; action: string; sender_identity: string };

export type ResolveMatchBasis =
  | 'email_exact'
  | 'alias'
  | 'reverse_domain'
  | 'trgm_name'
  | 'phone';

export interface ResolveCandidate {
  account_id: string;
  match_basis: ResolveMatchBasis;
  confidence: number;
}

export interface ResolveResult {
  candidates: ResolveCandidate[];
  top: { account_id: string; confidence: number } | null;
}

export interface ResolveAccountInput {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
}

export interface AccountRecord {
  id: string;
  email: string | null;
  phone: string | null;
  phone_e164: string | null;
  name: string | null;
}

export interface PolicyInForceRow {
  policy_id: string;
  account_id: string | null;
  policy_number: string;
  line_of_business?: string | null;
  carrier?: string | null;
  effective_date?: string | null;
  expiration_date?: string | null;
  in_force: boolean;
  premium: number | null;
  cgl_details: Record<string, unknown> | null;
  bap_details: Record<string, unknown> | null;
  evaluated_at: string;
}

export interface PortalIdCardRow {
  id: string;
  account_id: string;
  policy_id: string;
  card_image_path: string | null;
  card_pdf_path: string | null;
  card_data: Record<string, unknown>;
  data_as_of: string;
  source_document_id: string | null;
  is_active: boolean;
}

export interface SuspenseTaskRow {
  id: string;
  title: string;
  assignee_id: string | null;
  due_at: string | null;
  priority: string;
  status: string;
  account_id: string | null;
  premium_hint?: number | null;
}

export interface SuspenseSweepItem {
  task_id: string;
  title: string;
  owner_id: string | null;
  severity_score: number;
  reason: string;
}

export class FloorAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FloorAuthorizationError';
  }
}

export class FloorValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FloorValidationError';
  }
}
