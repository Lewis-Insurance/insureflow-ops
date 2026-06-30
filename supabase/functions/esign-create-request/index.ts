/**
 * eSign Create Request - Dropbox Sign Integration
 *
 * Creates signature requests via Dropbox Sign (HelloSign) API
 * and tracks them in the signature_requests table.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { createLogger } from '../_shared/logger.ts';
import { clientSendApprovalGateResponse, createSupabaseClientSendApprovalStore } from '../_shared/clientSendApprovalGate.ts';

const logger = createLogger('esign-create-request');

// Dropbox Sign API endpoints
const DROPBOX_SIGN_API = 'https://api.hellosign.com/v3';

interface Signer {
  email: string;
  name: string;
  role: string;
  order?: number;
}

interface SignatureField {
  type: 'signature' | 'date_signed' | 'initials' | 'text';
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  signer_index: number;
  name?: string;
  required?: boolean;
}

interface CreateRequestBody {
  document_url: string;
  document_name: string;
  signers: Signer[];
  form_number?: string;
  acord_form_id?: string;
  message?: string;
  subject?: string;
  expires_in_days?: number;
  use_text_tags?: boolean;
  signature_fields?: SignatureField[];
}

interface DropboxSignResponse {
  signature_request: {
    signature_request_id: string;
    title: string;
    original_title: string;
    subject: string;
    message: string;
    is_complete: boolean;
    is_declined: boolean;
    has_error: boolean;
    signing_url: string;
    details_url: string;
    requester_email_address: string;
    signatures: Array<{
      signature_id: string;
      signer_email_address: string;
      signer_name: string;
      order: number;
      status_code: string;
      signed_at: number | null;
      last_viewed_at: number | null;
      last_reminded_at: number | null;
    }>;
  };
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  try {
    // Only accept POST requests
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ success: false, error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Require authentication
    const authResult = await requireAuth(req, supabase, corsHeaders);
    if (authResult instanceof Response) return authResult;
    const user = authResult;

    logger.info('Creating signature request', { userId: user.id });

    // Parse request body
    const body: CreateRequestBody = await req.json();

    // Validate required fields
    if (!body.document_url || !body.signers || body.signers.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: document_url and signers are required'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const approvalGate = await clientSendApprovalGateResponse({
      surface: 'esign-create-request',
      payload: body,
      userId: user.id,
      approvalStore: createSupabaseClientSendApprovalStore(supabase),
      corsHeaders,
    });
    if (approvalGate) return approvalGate;

    // Get eSign settings from database
    const { data: settings, error: settingsError } = await supabase
      .from('esign_settings')
      .select('*')
      .single();

    if (settingsError || !settings || settings.provider !== 'hellosign') {
      logger.error('eSign not configured', { error: settingsError });
      return new Response(
        JSON.stringify({
          success: false,
          error: 'eSignature provider not configured. Please configure Dropbox Sign in settings.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get API key from secrets (DROPBOX_ACCESS_TOKEN is the Dropbox Sign API key)
    const apiKey = Deno.env.get('DROPBOX_ACCESS_TOKEN');
    if (!apiKey) {
      logger.error('Dropbox Sign API key not configured');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Dropbox Sign API key not configured. Add DROPBOX_ACCESS_TOKEN to secrets.'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build signature request for Dropbox Sign API
    const formData = new FormData();

    // Add document via URL
    formData.append('file_url[0]', body.document_url);

    // Add title and subject
    formData.append('title', body.document_name || 'Document for Signature');
    formData.append('subject', body.subject || `Please sign: ${body.document_name || 'Document'}`);

    if (body.message) {
      formData.append('message', body.message);
    }

    // Add test mode if in development
    const isTestMode = Deno.env.get('ENVIRONMENT') !== 'production';
    formData.append('test_mode', isTestMode ? '1' : '0');

    // Add signers
    body.signers.forEach((signer, index) => {
      formData.append(`signers[${index}][email_address]`, signer.email);
      formData.append(`signers[${index}][name]`, signer.name);
      if (signer.order !== undefined) {
        formData.append(`signers[${index}][order]`, String(signer.order));
      }
    });

    // Add signature fields if provided (form fields mode)
    if (body.signature_fields && body.signature_fields.length > 0) {
      body.signature_fields.forEach((field, index) => {
        const apiType = field.type === 'date_signed' ? 'date_signed' : field.type;
        formData.append(`form_fields_per_document[0][${index}][type]`, apiType);
        formData.append(`form_fields_per_document[0][${index}][page]`, String(field.page));
        formData.append(`form_fields_per_document[0][${index}][x]`, String(field.x));
        formData.append(`form_fields_per_document[0][${index}][y]`, String(field.y));
        formData.append(`form_fields_per_document[0][${index}][width]`, String(field.width));
        formData.append(`form_fields_per_document[0][${index}][height]`, String(field.height));
        formData.append(`form_fields_per_document[0][${index}][signer]`, String(field.signer_index));
        formData.append(`form_fields_per_document[0][${index}][required]`, field.required !== false ? 'true' : 'false');
        if (field.name) {
          formData.append(`form_fields_per_document[0][${index}][name]`, field.name);
        }
      });
    } else if (body.use_text_tags) {
      // Use text tags mode - PDF has embedded markers
      formData.append('use_text_tags', '1');
      formData.append('hide_text_tags', '1');
    }

    // Set expiration if specified
    if (body.expires_in_days) {
      const expiresAt = Math.floor(Date.now() / 1000) + (body.expires_in_days * 24 * 60 * 60);
      formData.append('expires_at', String(expiresAt));
    }

    // Add client ID for embedded signing (optional)
    if (settings.hellosign_client_id) {
      formData.append('client_id', settings.hellosign_client_id);
    }

    logger.info('Sending request to Dropbox Sign API', {
      documentName: body.document_name,
      signerCount: body.signers.length,
      isTestMode
    });

    // Call Dropbox Sign API
    const response = await fetch(`${DROPBOX_SIGN_API}/signature_request/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(apiKey + ':')}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Dropbox Sign API error', {
        status: response.status,
        error: errorText
      });

      let errorMessage = 'Failed to create signature request';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.error_msg || errorMessage;
      } catch {
        // Use default error message
      }

      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiResponse: DropboxSignResponse = await response.json();
    const signatureRequest = apiResponse.signature_request;

    logger.info('Signature request created', {
      requestId: signatureRequest.signature_request_id
    });

    // Calculate expiration date
    const expiresAt = body.expires_in_days
      ? new Date(Date.now() + body.expires_in_days * 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + (settings.default_expiration_days || 30) * 24 * 60 * 60 * 1000).toISOString();

    // Store in database
    const { data: dbRecord, error: dbError } = await supabase
      .from('signature_requests')
      .insert({
        acord_form_id: body.acord_form_id || null,
        form_number: body.form_number || null,
        status: 'sent',
        signers: signatureRequest.signatures.map(sig => ({
          email: sig.signer_email_address,
          name: sig.signer_name,
          status: sig.status_code,
          signature_id: sig.signature_id,
          order: sig.order,
        })),
        anchors: body.signature_fields || [],
        message: body.message || null,
        external_request_id: signatureRequest.signature_request_id,
        external_provider: 'dropbox_sign',
        document_url: body.document_url,
        expires_at: expiresAt,
        created_by: user.id,
      })
      .select()
      .single();

    if (dbError) {
      logger.error('Failed to store signature request in database', { error: dbError });
      // Don't fail the request - the signature request was created successfully
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: dbRecord?.id,
          external_request_id: signatureRequest.signature_request_id,
          status: 'sent',
          signing_url: signatureRequest.signing_url,
          details_url: signatureRequest.details_url,
          signers: signatureRequest.signatures.map(sig => ({
            email: sig.signer_email_address,
            name: sig.signer_name,
            status: sig.status_code,
          })),
          expires_at: expiresAt,
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    logger.error('Unexpected error', { error: error instanceof Error ? error.message : 'Unknown error' });

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
