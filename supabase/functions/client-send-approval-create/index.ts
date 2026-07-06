import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { hashClientSendPayload, type ClientSendSurface } from "../_shared/clientSendApprovalGate.ts";

const ALLOWED_SURFACES = new Set<ClientSendSurface>([
  'email-send',
  'send-sms',
  'send-coi-email',
  'send-submission-packet',
  'esign-create-request',
]);

function randomApprovalRef(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return `sendapproval_${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
}

function normalizeRequest(value: unknown): { surface: ClientSendSurface | null; payload: unknown } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { surface: null, payload: null };
  const record = value as Record<string, unknown>;
  return {
    surface: typeof record.surface === 'string' ? record.surface : null,
    payload: record.payload,
  };
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) return authResult;

    const { surface, payload } = normalizeRequest(await req.json());
    if (!surface || !ALLOWED_SURFACES.has(surface) || payload === null || payload === undefined) {
      return new Response(
        JSON.stringify({ success: false, error: 'invalid_client_send_approval_request' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const approvalRef = randomApprovalRef();
    const contentHash = await hashClientSendPayload(surface, payload);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const { error } = await supabase.from('client_send_approvals').insert({
      approval_ref: approvalRef,
      surface,
      content_hash: contentHash,
      approved_by_user_id: authResult.id,
      approved_by_email: authResult.email ?? null,
      expires_at: expiresAt,
    });

    if (error) throw error;

    return new Response(
      JSON.stringify({
        success: true,
        client_send_approval: {
          approval_ref: approvalRef,
          approved_by_human_id: authResult.id,
        },
        content_hash: contentHash,
        expires_at: expiresAt,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    console.error('Error creating client send approval:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
