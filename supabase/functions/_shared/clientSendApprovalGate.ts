export type ClientSendSurface = 'email-send' | 'send-sms' | 'send-coi-email' | 'esign-create-request' | string;

export interface ClientSendApprovalMarker {
  approval_ref: string;
  approved_by_human_id: string;
}

export interface PendingClientSendApproval {
  approvalRef: string;
  surface: ClientSendSurface;
  contentHash: string;
  approvedByUserId: string;
  consumedAtIso: string | null;
  expiresAtIso?: string;
}

export type ClientSendApprovalConsumeError =
  | 'client_send_approval_not_found'
  | 'client_send_approval_replayed'
  | 'client_send_approval_content_mismatch'
  | 'client_send_approval_wrong_human'
  | 'client_send_approval_expired';

export interface ClientSendApprovalConsumeResult {
  ok: boolean;
  error?: ClientSendApprovalConsumeError;
}

export interface ClientSendApprovalStore {
  consume(input: {
    approvalRef: string;
    surface: ClientSendSurface;
    contentHash: string;
    approvedByUserId: string;
    userId: string;
    nowIso: string;
  }): Promise<ClientSendApprovalConsumeResult>;
}

interface SupabaseFilterBuilder {
  eq(column: string, value: string): SupabaseFilterBuilder;
  is(column: string, value: null): SupabaseFilterBuilder;
  gt(column: string, value: string): SupabaseFilterBuilder;
  select(columns: string): SupabaseFilterBuilder;
  maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: unknown }>;
}

interface SupabaseLikeClient {
  from(table: string): {
    select(columns: string): SupabaseFilterBuilder;
    update(values: Record<string, unknown>): SupabaseFilterBuilder;
  };
}

const APPROVAL_REF_PATTERN = /^(?:sendapproval|floor_action)[:_][A-Za-z0-9_-]{12,}$/;

export function isFloorActionApprovalRef(approvalRef: string): boolean {
  return approvalRef.startsWith('floor_action:');
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function approvalMarkerFromPayload(payload: unknown): ClientSendApprovalMarker | null {
  const normalized = normalizeRecord(payload);
  const nested = normalizeRecord(normalized.client_send_approval ?? normalized.clientSendApproval ?? normalized.floor_approval ?? normalized.floorApproval);
  const approvalRef =
    readString(nested.approval_ref) ??
    readString(nested.approvalRef) ??
    readString(nested.floor_approval_token) ??
    readString(normalized.client_send_approval_ref) ??
    readString(normalized.clientSendApprovalRef) ??
    readString(normalized.floor_approval_token) ??
    readString(normalized.floorApprovalToken);
  const approvedByHumanId =
    readString(nested.approved_by_human_id) ??
    readString(nested.approvedByHumanId) ??
    readString(nested.floor_approved_by_human_ref) ??
    readString(normalized.client_send_approved_by_human_id) ??
    readString(normalized.clientSendApprovedByHumanId) ??
    readString(normalized.floor_approved_by_human_ref) ??
    readString(normalized.floorApprovedByHumanRef);

  if (!approvalRef || !approvedByHumanId) return null;
  return { approval_ref: approvalRef, approved_by_human_id: approvedByHumanId };
}

export function readClientSendApprovalMarker(payload: unknown): ClientSendApprovalMarker | null {
  return approvalMarkerFromPayload(payload);
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .filter((key) => ![
          'client_send_approval',
          'clientSendApproval',
          'client_send_approval_ref',
          'clientSendApprovalRef',
          'client_send_approved_by_human_id',
          'clientSendApprovedByHumanId',
          'floor_approval',
          'floorApproval',
          'floor_approval_token',
          'floorApprovalToken',
          'floor_package_ref',
          'floorPackageRef',
          'floor_rendered_hash',
          'floorRenderedHash',
          'floor_approved_by_human_ref',
          'floorApprovedByHumanRef',
        ].includes(key))
        .sort()
        .map((key) => [key, sortObject(record[key])]),
    );
  }
  return value;
}

function canonicalPayload(surface: ClientSendSurface, payload: unknown): Record<string, unknown> {
  const normalized = normalizeRecord(payload);
  if (surface === 'email-send') {
    return sortObject({
      to: normalized.to,
      subject: normalized.subject,
      body: normalized.body,
      inReplyTo: normalized.inReplyTo ?? null,
      ticketId: normalized.ticketId ?? null,
    }) as Record<string, unknown>;
  }
  if (surface === 'send-sms') {
    return sortObject({
      to_number: normalized.to_number ?? normalized.to,
      body: normalized.body ?? normalized.message,
      account_id: normalized.account_id ?? normalized.accountId ?? null,
      contact_id: normalized.contact_id ?? normalized.contactId ?? null,
    }) as Record<string, unknown>;
  }
  if (surface === 'send-coi-email') {
    // Bind the approval to the exact send: which certificate, to whom, cc'd whom.
    // Keys mirror the send-coi-email request body { certificate_id, to, cc, note }
    // so the mint (client-send-approval-create) and the consume (send-coi-email)
    // hash identically. (Previously keyed on certificate_number/url/holder_name,
    // none of which are in the body, so every one resolved to undefined and the
    // hash collapsed to { to } -- the approval bound only to the recipient, not to
    // a specific certificate.)
    return sortObject({
      certificate_id: normalized.certificate_id ?? normalized.certificateId ?? null,
      to: normalized.to ?? normalized.recipientEmail ?? null,
      cc: normalized.cc ?? null,
      note: normalized.note ?? null,
    }) as Record<string, unknown>;
  }
  if (surface === 'send-id-card-email') {
    return sortObject({
      to: normalized.to ?? normalized.recipientEmail,
      policy_number: normalized.policyNumber ?? normalized.policy_number,
      id_card_url: normalized.idCardUrl ?? normalized.id_card_url,
      insured_name: normalized.insuredName ?? normalized.insured_name,
    }) as Record<string, unknown>;
  }
  if (surface === 'canopy-servicing-email') {
    return sortObject({
      action_type: normalized.action_type,
      policy_id: normalized.policy_id ?? null,
      email: normalized.email,
      delivery_method: normalized.delivery_method ?? 'email',
    }) as Record<string, unknown>;
  }
  if (surface === 'esign-create-request') {
    return sortObject({
      document_url: normalized.document_url ?? normalized.documentUrl,
      document_name: normalized.document_name ?? normalized.documentName,
      signers: normalized.signers,
      subject: normalized.subject,
      message: normalized.message,
      form_number: normalized.form_number ?? normalized.formNumber ?? null,
      acord_form_id: normalized.acord_form_id ?? normalized.acordFormId ?? null,
      expires_in_days: normalized.expires_in_days ?? normalized.expiresInDays ?? null,
      use_text_tags: normalized.use_text_tags ?? normalized.useTextTags ?? null,
      signature_fields: normalized.signature_fields ?? normalized.signatureFields ?? null,
    }) as Record<string, unknown>;
  }
  return sortObject(normalized) as Record<string, unknown>;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashClientSendPayload(surface: ClientSendSurface, payload: unknown): Promise<string> {
  const canonical = JSON.stringify(canonicalPayload(surface, payload));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return `sha256:${bytesToHex(new Uint8Array(digest))}`;
}

export async function createPendingClientSendApproval(input: {
  surface: ClientSendSurface;
  payload: unknown;
  approvedByUserId: string;
  approvalRef: string;
  expiresAtIso?: string;
}): Promise<PendingClientSendApproval> {
  return {
    approvalRef: input.approvalRef,
    surface: input.surface,
    contentHash: await hashClientSendPayload(input.surface, input.payload),
    approvedByUserId: input.approvedByUserId,
    consumedAtIso: null,
    expiresAtIso: input.expiresAtIso,
  };
}

export function createInMemoryClientSendApprovalStore(seed: PendingClientSendApproval[]): ClientSendApprovalStore {
  const approvals = new Map(seed.map((approval) => [approval.approvalRef, { ...approval }]));
  return {
    async consume(input) {
      const approval = approvals.get(input.approvalRef);
      if (!approval || approval.surface !== input.surface) return { ok: false, error: 'client_send_approval_not_found' };
      if (approval.consumedAtIso) return { ok: false, error: 'client_send_approval_replayed' };
      if (approval.expiresAtIso && new Date(approval.expiresAtIso).getTime() <= new Date(input.nowIso).getTime()) {
        return { ok: false, error: 'client_send_approval_expired' };
      }
      const floorAction = isFloorActionApprovalRef(input.approvalRef);
      if (!floorAction && (approval.approvedByUserId !== input.approvedByUserId || approval.approvedByUserId !== input.userId)) {
        return { ok: false, error: 'client_send_approval_wrong_human' };
      }
      if (floorAction && approval.approvedByUserId !== input.approvedByUserId) {
        return { ok: false, error: 'client_send_approval_wrong_human' };
      }
      if (approval.contentHash !== input.contentHash) return { ok: false, error: 'client_send_approval_content_mismatch' };
      approval.consumedAtIso = input.nowIso;
      approvals.set(input.approvalRef, approval);
      return { ok: true };
    },
  };
}

function rowString(row: Record<string, unknown>, key: string): string | null {
  return typeof row[key] === 'string' ? row[key] as string : null;
}

export function createSupabaseClientSendApprovalStore(supabase: SupabaseLikeClient): ClientSendApprovalStore {
  return {
    async consume(input) {
      const lookup = await supabase
        .from('client_send_approvals')
        .select('approval_ref,surface,content_hash,approved_by_user_id,consumed_at,expires_at')
        .eq('approval_ref', input.approvalRef)
        .maybeSingle();
      if (lookup.error || !lookup.data || rowString(lookup.data, 'surface') !== input.surface) {
        return { ok: false, error: 'client_send_approval_not_found' };
      }
      if (lookup.data.consumed_at) return { ok: false, error: 'client_send_approval_replayed' };
      const expiresAt = rowString(lookup.data, 'expires_at');
      if (expiresAt && new Date(expiresAt).getTime() <= new Date(input.nowIso).getTime()) {
        return { ok: false, error: 'client_send_approval_expired' };
      }
      const approvedByUserId = rowString(lookup.data, 'approved_by_user_id');
      const floorAction = isFloorActionApprovalRef(input.approvalRef);
      if (!floorAction && (approvedByUserId !== input.approvedByUserId || input.approvedByUserId !== input.userId)) {
        return { ok: false, error: 'client_send_approval_wrong_human' };
      }
      if (floorAction && approvedByUserId !== input.approvedByUserId) {
        return { ok: false, error: 'client_send_approval_wrong_human' };
      }
      if (rowString(lookup.data, 'content_hash') !== input.contentHash) {
        return { ok: false, error: 'client_send_approval_content_mismatch' };
      }

      const consumed = await supabase
        .from('client_send_approvals')
        .update({ consumed_at: input.nowIso })
        .eq('approval_ref', input.approvalRef)
        .eq('surface', input.surface)
        .eq('content_hash', input.contentHash)
        .eq('approved_by_user_id', input.approvedByUserId)
        .gt('expires_at', input.nowIso)
        .is('consumed_at', null)
        .select('approval_ref')
        .maybeSingle();
      if (consumed.error || !consumed.data) return { ok: false, error: 'client_send_approval_replayed' };
      return { ok: true };
    },
  };
}

function messageForError(surface: ClientSendSurface, error: ClientSendApprovalConsumeError | 'client_send_approval_required' | 'invalid_client_send_approval_ref'): string {
  if (error === 'client_send_approval_required') {
    return `${surface} rejected: client-facing sends require a server-verified named-human approval reference.`;
  }
  if (error === 'invalid_client_send_approval_ref') {
    return `${surface} rejected: approval reference must be an opaque server-minted reference.`;
  }
  return `${surface} rejected: ${error.replaceAll('_', ' ')}.`;
}

export async function validateClientSendApprovalForClientEffect(input: {
  surface: ClientSendSurface;
  payload: unknown;
  userId: string;
  approvalStore: ClientSendApprovalStore;
  nowIso?: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string; message: string }> {
  const marker = approvalMarkerFromPayload(input.payload);
  if (!marker) {
    return { ok: false, status: 403, error: 'client_send_approval_required', message: messageForError(input.surface, 'client_send_approval_required') };
  }
  if (!APPROVAL_REF_PATTERN.test(marker.approval_ref)) {
    return { ok: false, status: 403, error: 'invalid_client_send_approval_ref', message: messageForError(input.surface, 'invalid_client_send_approval_ref') };
  }

  const contentHash = await hashClientSendPayload(input.surface, input.payload);
  const consumed = await input.approvalStore.consume({
    approvalRef: marker.approval_ref,
    surface: input.surface,
    contentHash,
    approvedByUserId: marker.approved_by_human_id,
    userId: input.userId,
    nowIso: input.nowIso ?? new Date().toISOString(),
  });
  if (!consumed.ok) {
    const error = consumed.error ?? 'client_send_approval_not_found';
    return { ok: false, status: 403, error, message: messageForError(input.surface, error) };
  }
  return { ok: true };
}

export async function clientSendApprovalGateResponse(input: {
  surface: ClientSendSurface;
  payload: unknown;
  userId: string;
  approvalStore: ClientSendApprovalStore;
  corsHeaders: Record<string, string>;
  nowIso?: string;
}): Promise<Response | null> {
  const result = await validateClientSendApprovalForClientEffect(input);
  if (result.ok) return null;
  return new Response(
    JSON.stringify({
      success: false,
      error: result.error,
      message: result.message,
      client_send_approval_required: true,
    }),
    { status: result.status, headers: { ...input.corsHeaders, 'Content-Type': 'application/json' } },
  );
}
