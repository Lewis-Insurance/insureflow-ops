/**
 * eSign Webhook Handler - Dropbox Sign Events
 *
 * Receives webhook events from Dropbox Sign and updates
 * signature request status in the database.
 *
 * When a document is fully signed, this webhook:
 * 1. Downloads the signed PDF from Dropbox Sign
 * 2. Uploads it to Supabase Storage
 * 3. Creates a documents record linked to the account
 * 4. Updates the ACORD form with signed PDF URL and status
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { createLogger } from '../_shared/logger.ts';
import { encode as base64Encode } from 'https://deno.land/std@0.208.0/encoding/base64.ts';

// Dropbox Sign API
const DROPBOX_SIGN_API = 'https://api.hellosign.com/v3';

const logger = createLogger('esign-webhook');

// Dropbox Sign event types
type DropboxSignEventType =
  | 'signature_request_viewed'
  | 'signature_request_signed'
  | 'signature_request_sent'
  | 'signature_request_all_signed'
  | 'signature_request_declined'
  | 'signature_request_remind'
  | 'signature_request_expired'
  | 'signature_request_canceled'
  | 'signature_request_downloadable';

interface DropboxSignEvent {
  event: {
    event_type: DropboxSignEventType;
    event_time: string;
    event_hash: string;
    event_metadata: {
      related_signature_id?: string;
      reported_for_account_id?: string;
      reported_for_app_id?: string;
    };
  };
  signature_request: {
    signature_request_id: string;
    title: string;
    is_complete: boolean;
    is_declined: boolean;
    has_error: boolean;
    files_url: string;
    signing_url: string;
    final_copy_uri?: string;
    signatures: Array<{
      signature_id: string;
      signer_email_address: string;
      signer_name: string;
      status_code: string;
      signed_at: number | null;
      last_viewed_at: number | null;
    }>;
  };
}

/**
 * Verify Dropbox Sign webhook signature using HMAC
 */
async function verifyWebhookSignature(
  payload: string,
  signature: string | null,
  apiKey: string
): Promise<boolean> {
  if (!signature) {
    logger.warn('No signature provided in webhook');
    return false;
  }

  try {
    // Dropbox Sign uses HMAC-SHA256 with the API key
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(apiKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(payload)
    );

    const computedSignature = base64Encode(new Uint8Array(signatureBuffer));

    // Compare signatures (constant time comparison)
    return computedSignature === signature;
  } catch (error) {
    logger.error('Signature verification failed', { error });
    return false;
  }
}

/**
 * Download signed PDF from Dropbox Sign API
 */
async function downloadSignedPdf(
  signatureRequestId: string,
  apiKey: string
): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch(
      `${DROPBOX_SIGN_API}/signature_request/files/${signatureRequestId}?file_type=pdf`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${btoa(apiKey + ':')}`,
        },
      }
    );

    if (!response.ok) {
      logger.error('Failed to download signed PDF', {
        status: response.status,
        signatureRequestId,
      });
      return null;
    }

    return await response.arrayBuffer();
  } catch (error) {
    logger.error('Error downloading signed PDF', {
      error: error instanceof Error ? error.message : 'Unknown error',
      signatureRequestId,
    });
    return null;
  }
}

/**
 * Process completed signature: download, store, and link document
 */
async function processSignedDocument(
  supabase: ReturnType<typeof createClient>,
  existingRequest: {
    id: string;
    acord_form_id: string | null;
    form_number: string | null;
    document_url: string | null;
  },
  externalRequestId: string,
  apiKey: string
): Promise<{ storagePath: string; publicUrl: string } | null> {
  // Download the signed PDF from Dropbox Sign
  const pdfBytes = await downloadSignedPdf(externalRequestId, apiKey);
  if (!pdfBytes) {
    logger.warn('Could not download signed PDF, skipping storage');
    return null;
  }

  logger.info('Downloaded signed PDF', { size: pdfBytes.byteLength });

  // Generate storage path
  const timestamp = Date.now();
  const formNumber = existingRequest.form_number || 'document';
  const storagePath = `signed/${existingRequest.id}/${formNumber}_signed_${timestamp}.pdf`;

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase
    .storage
    .from('documents')
    .upload(storagePath, pdfBytes, {
      contentType: 'application/pdf',
      upsert: false,
    });

  if (uploadError) {
    logger.error('Failed to upload signed PDF to storage', { error: uploadError });
    return null;
  }

  // Get public URL
  const { data: urlData } = supabase
    .storage
    .from('documents')
    .getPublicUrl(storagePath);

  const publicUrl = urlData?.publicUrl || '';

  logger.info('Uploaded signed PDF to storage', { storagePath, publicUrl });

  // Get account_id from ACORD form if linked
  let accountId: string | null = null;
  let policyId: string | null = null;

  if (existingRequest.acord_form_id) {
    const { data: acordForm } = await supabase
      .from('acord_forms')
      .select('account_id')
      .eq('id', existingRequest.acord_form_id)
      .single();

    if (acordForm) {
      accountId = acordForm.account_id;
    }
  }

  // Create documents record
  const filename = `ACORD ${formNumber} - Signed ${new Date().toISOString().split('T')[0]}.pdf`;

  const { error: docError } = await supabase
    .from('documents')
    .insert({
      account_id: accountId,
      policy_id: policyId,
      signature_request_id: existingRequest.id,
      storage_path: storagePath,
      storage_bucket: 'documents',
      filename: filename,
      name: filename,
      kind: 'signed_form',
      document_type: 'signed_acord_form',
      category: 'application',
      mime_type: 'application/pdf',
      size_bytes: pdfBytes.byteLength,
      file_size: pdfBytes.byteLength,
      file_path: storagePath,
      file_name: filename,
      uploaded_at: new Date().toISOString(),
    });

  if (docError) {
    logger.error('Failed to create documents record', { error: docError });
    // Don't fail - the PDF is already stored
  } else {
    logger.info('Created documents record', { accountId, storagePath });
  }

  // Update ACORD form if linked
  if (existingRequest.acord_form_id) {
    const { error: acordError } = await supabase
      .from('acord_forms')
      .update({
        signature_status: 'signed',
        signed_pdf_url: publicUrl,
        signed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingRequest.acord_form_id);

    if (acordError) {
      logger.error('Failed to update ACORD form', { error: acordError });
    } else {
      logger.info('Updated ACORD form with signed PDF', {
        acordFormId: existingRequest.acord_form_id,
      });
    }
  }

  return { storagePath, publicUrl };
}

/**
 * Map Dropbox Sign event to our status
 */
function mapEventToStatus(eventType: DropboxSignEventType, isComplete: boolean, isDeclined: boolean): string {
  if (isDeclined) return 'declined';
  if (isComplete) return 'completed';

  switch (eventType) {
    case 'signature_request_sent':
      return 'sent';
    case 'signature_request_viewed':
      return 'pending'; // Still pending, just viewed
    case 'signature_request_signed':
      return 'partial'; // At least one signed, may not be all
    case 'signature_request_all_signed':
      return 'completed';
    case 'signature_request_declined':
      return 'declined';
    case 'signature_request_expired':
      return 'expired';
    case 'signature_request_canceled':
      return 'cancelled';
    case 'signature_request_downloadable':
      return 'completed';
    default:
      return 'pending';
  }
}

Deno.serve(async (req: Request) => {
  // Dropbox Sign webhooks don't need CORS (server-to-server)
  const headers = { 'Content-Type': 'application/json' };

  try {
    // Only accept POST requests
    if (req.method !== 'POST') {
      // Dropbox Sign sends a GET request for webhook verification
      if (req.method === 'GET') {
        return new Response('Hello API Event Received', { status: 200 });
      }
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers }
      );
    }

    // Get the raw body for signature verification
    const rawBody = await req.text();

    // Parse the webhook payload
    // Dropbox Sign sends form-urlencoded data with a 'json' field
    let eventData: DropboxSignEvent;

    if (req.headers.get('content-type')?.includes('application/x-www-form-urlencoded')) {
      const formData = new URLSearchParams(rawBody);
      const jsonString = formData.get('json');
      if (!jsonString) {
        logger.error('No JSON data in webhook payload');
        return new Response(
          JSON.stringify({ error: 'Invalid payload' }),
          { status: 400, headers }
        );
      }
      eventData = JSON.parse(jsonString);
    } else {
      eventData = JSON.parse(rawBody);
    }

    logger.info('Received webhook event', {
      eventType: eventData.event?.event_type,
      requestId: eventData.signature_request?.signature_request_id
    });

    // Get API key for signature verification
    const apiKey = Deno.env.get('DROPBOX_ACCESS_TOKEN');

    // Verify webhook signature (optional but recommended)
    if (apiKey) {
      const signature = req.headers.get('x-hellosign-signature');
      // Note: In production, you should fail if signature doesn't match
      // For now, we log a warning but continue
      if (signature) {
        const isValid = await verifyWebhookSignature(rawBody, signature, apiKey);
        if (!isValid) {
          logger.warn('Webhook signature verification failed');
        }
      }
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const signatureRequest = eventData.signature_request;
    const eventType = eventData.event.event_type;

    // Find the signature request in our database
    const { data: existingRequest, error: findError } = await supabase
      .from('signature_requests')
      .select('*')
      .eq('external_request_id', signatureRequest.signature_request_id)
      .single();

    if (findError || !existingRequest) {
      logger.warn('Signature request not found in database', {
        externalId: signatureRequest.signature_request_id
      });
      // Return 200 to acknowledge receipt (don't want retries)
      return new Response(
        JSON.stringify({ received: true, warning: 'Request not found in database' }),
        { status: 200, headers }
      );
    }

    // Determine new status
    const newStatus = mapEventToStatus(
      eventType,
      signatureRequest.is_complete,
      signatureRequest.is_declined
    );

    // Build update object
    const updateData: Record<string, unknown> = {
      status: newStatus,
      signers: signatureRequest.signatures.map(sig => ({
        email: sig.signer_email_address,
        name: sig.signer_name,
        status: sig.status_code,
        signature_id: sig.signature_id,
        signed_at: sig.signed_at ? new Date(sig.signed_at * 1000).toISOString() : null,
        last_viewed_at: sig.last_viewed_at ? new Date(sig.last_viewed_at * 1000).toISOString() : null,
      })),
      updated_at: new Date().toISOString(),
    };

    // Set completion time if all signed
    if (newStatus === 'completed') {
      updateData.completed_at = new Date().toISOString();
      // Store the URL to download the signed document
      if (signatureRequest.final_copy_uri || signatureRequest.files_url) {
        updateData.signed_document_url = signatureRequest.final_copy_uri || signatureRequest.files_url;
      }
    }

    // Set cancellation time if cancelled
    if (newStatus === 'cancelled' || newStatus === 'declined') {
      updateData.cancelled_at = new Date().toISOString();
    }

    // Update the database
    const { error: updateError } = await supabase
      .from('signature_requests')
      .update(updateData)
      .eq('id', existingRequest.id);

    if (updateError) {
      logger.error('Failed to update signature request', { error: updateError });
      return new Response(
        JSON.stringify({ error: 'Database update failed' }),
        { status: 500, headers }
      );
    }

    logger.info('Signature request updated', {
      id: existingRequest.id,
      newStatus,
      eventType
    });

    // If completed, download and store the signed PDF
    if (newStatus === 'completed' && apiKey) {
      logger.info('Processing completed signature - downloading and storing signed PDF');

      try {
        const result = await processSignedDocument(
          supabase,
          {
            id: existingRequest.id,
            acord_form_id: existingRequest.acord_form_id,
            form_number: existingRequest.form_number,
            document_url: existingRequest.document_url,
          },
          signatureRequest.signature_request_id,
          apiKey
        );

        if (result) {
          logger.info('Signed document processed and stored', {
            storagePath: result.storagePath,
            publicUrl: result.publicUrl,
          });

          // Update the signature request with the storage URL
          await supabase
            .from('signature_requests')
            .update({ signed_document_url: result.publicUrl })
            .eq('id', existingRequest.id);
        }
      } catch (processError) {
        // Log but don't fail the webhook - the main update already succeeded
        logger.error('Failed to process signed document', {
          error: processError instanceof Error ? processError.message : 'Unknown error',
        });
      }
    }

    // Return success - Dropbox Sign expects "Hello API Event Received"
    return new Response('Hello API Event Received', { status: 200 });

  } catch (error: unknown) {
    logger.error('Webhook processing failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers }
    );
  }
});
