import { supabase } from '@/integrations/supabase/client';

export type ClientSendSurface = 'email-send' | 'send-sms' | 'send-coi-email' | 'esign-create-request';

export interface ClientSendApprovalMarker {
  approval_ref: string;
  approved_by_human_id: string;
}

interface ClientSendApprovalCreateResponse {
  success?: boolean;
  client_send_approval?: ClientSendApprovalMarker;
  error?: string;
}

function isApprovalMarker(value: unknown): value is ClientSendApprovalMarker {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.approval_ref === 'string' && typeof record.approved_by_human_id === 'string';
}

export async function createClientSendApproval(
  surface: ClientSendSurface,
  payload: Record<string, unknown>,
): Promise<ClientSendApprovalMarker> {
  const { data, error } = await supabase.functions.invoke('client-send-approval-create', {
    body: { surface, payload },
  });

  if (error) throw error;

  const response = data as ClientSendApprovalCreateResponse | null;
  if (!response?.success || !isApprovalMarker(response.client_send_approval)) {
    throw new Error(response?.error || 'Client send approval was not created');
  }

  return response.client_send_approval;
}
