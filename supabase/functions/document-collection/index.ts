/**
 * Document Collection Edge Function
 * 
 * Handles:
 * - Creating collection packets (workspaces with task_type = 'document_collection')
 * - Generating portal access tokens
 * - Validating tokens and handling portal uploads
 * - Updating requirement and upload statuses
 * - Triggering document processing pipeline
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreatePacketRequest {
  action: 'create_packet';
  account_id: string;
  policy_id?: string;
  name: string;
  description?: string;
  template_id?: string;
  requirements?: Array<{
    doc_type: string;
    label: string;
    instructions?: string;
    is_required?: boolean;
    min_quantity?: number;
    max_quantity?: number;
  }>;
  recipient_email?: string;
  recipient_name?: string;
  expires_days?: number;
}

interface GenerateTokenRequest {
  action: 'generate_token';
  workspace_id: string;
  recipient_email?: string;
  recipient_name?: string;
  expires_days?: number;
}

interface ValidateTokenRequest {
  action: 'validate_token';
  token: string;
}

interface PortalUploadRequest {
  action: 'portal_upload';
  token: string;
  requirement_id: string;
  filename: string;
  file_base64: string;
  mime_type: string;
}

interface UpdateStatusRequest {
  action: 'update_requirement_status' | 'update_upload_status';
  id: string;
  status: string;
  notes?: string;
  rejection_reason?: string;
}

interface SendReminderRequest {
  action: 'send_reminder';
  workspace_id: string;
}

interface GetPacketDataRequest {
  action: 'get_packet_data';
  workspace_id?: string;
  token?: string;
}

type RequestBody = 
  | CreatePacketRequest 
  | GenerateTokenRequest 
  | ValidateTokenRequest
  | PortalUploadRequest 
  | UpdateStatusRequest
  | SendReminderRequest
  | GetPacketDataRequest;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: RequestBody = await req.json();
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || null;

    // Check authentication for non-portal actions
    let userId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (!authError && user) {
        userId = user.id;
      }
    }

    let result: any = {};

    switch (body.action) {
      case 'create_packet':
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'Authentication required' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await createPacket(supabase, body as CreatePacketRequest, userId);
        break;

      case 'generate_token':
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'Authentication required' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await generateToken(supabase, body as GenerateTokenRequest, userId);
        break;

      case 'validate_token':
        result = await validateToken(supabase, body as ValidateTokenRequest, clientIp);
        break;

      case 'portal_upload':
        result = await portalUpload(supabase, body as PortalUploadRequest, clientIp);
        break;

      case 'update_requirement_status':
      case 'update_upload_status':
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'Authentication required' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await updateStatus(supabase, body as UpdateStatusRequest, userId);
        break;

      case 'send_reminder':
        if (!userId) {
          return new Response(
            JSON.stringify({ error: 'Authentication required' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await sendReminder(supabase, body as SendReminderRequest, userId);
        break;

      case 'get_packet_data':
        result = await getPacketData(supabase, body as GetPacketDataRequest, userId, clientIp);
        break;

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[document-collection] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// =============================================================================
// CREATE PACKET
// =============================================================================

async function createPacket(
  supabase: any,
  request: CreatePacketRequest,
  userId: string
): Promise<any> {
  const { 
    account_id, 
    policy_id, 
    name, 
    description, 
    template_id,
    requirements: customRequirements,
    recipient_email,
    recipient_name,
    expires_days = 30
  } = request;

  // Get requirements from template if provided
  let requirements = customRequirements || [];
  if (template_id && !customRequirements?.length) {
    const { data: template } = await supabase
      .from('collection_templates')
      .select('requirements')
      .eq('id', template_id)
      .single();
    
    if (template?.requirements) {
      requirements = template.requirements;
    }
  }

  // Create workspace with task_type = 'document_collection'
  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .insert({
      name,
      description,
      task_type: 'document_collection',
      account_id,
      policy_id,
      status: 'draft',
      created_by: userId,
    })
    .select()
    .single();

  if (wsError) {
    throw new Error(`Failed to create packet: ${wsError.message}`);
  }

  // Create requirements
  if (requirements.length > 0) {
    const reqInserts = requirements.map((req: any, index: number) => ({
      workspace_id: workspace.id,
      doc_type: req.doc_type,
      label: req.label,
      instructions: req.instructions,
      is_required: req.is_required ?? true,
      min_quantity: req.min_quantity ?? 1,
      max_quantity: req.max_quantity ?? 10,
      display_order: index,
      status: 'requested',
    }));

    const { error: reqError } = await supabase
      .from('collection_requirements')
      .insert(reqInserts);

    if (reqError) {
      console.error('[document-collection] Failed to create requirements:', reqError);
    }
  }

  // Generate portal token if recipient provided
  let portalUrl: string | null = null;
  let token: string | null = null;
  
  if (recipient_email || recipient_name) {
    const { data: tokenResult } = await supabase.rpc('generate_collection_token', {
      p_workspace_id: workspace.id,
      p_account_id: account_id,
      p_recipient_email: recipient_email,
      p_recipient_name: recipient_name,
      p_expires_days: expires_days,
      p_created_by: userId,
    });

    if (tokenResult) {
      token = tokenResult;
      // Build portal URL (adjust base URL as needed)
      const baseUrl = Deno.env.get('PUBLIC_SITE_URL') || 'https://lewisinsurance.ai';
      portalUrl = `${baseUrl}/portal/collect/${token}`;
    }
  }

  // Log creation
  await supabase.from('collection_audit_log').insert({
    workspace_id: workspace.id,
    action: 'packet_created',
    actor_type: 'agent',
    actor_profile_id: userId,
    new_value: { name, account_id, policy_id, requirements_count: requirements.length },
  });

  return {
    workspace_id: workspace.id,
    requirements_count: requirements.length,
    portal_url: portalUrl,
    token,
  };
}

// =============================================================================
// GENERATE TOKEN
// =============================================================================

async function generateToken(
  supabase: any,
  request: GenerateTokenRequest,
  userId: string
): Promise<any> {
  const { workspace_id, recipient_email, recipient_name, expires_days = 30 } = request;

  // Get workspace to find account_id
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('account_id')
    .eq('id', workspace_id)
    .single();

  if (!workspace) {
    throw new Error('Workspace not found');
  }

  const { data: token, error } = await supabase.rpc('generate_collection_token', {
    p_workspace_id: workspace_id,
    p_account_id: workspace.account_id,
    p_recipient_email: recipient_email,
    p_recipient_name: recipient_name,
    p_expires_days: expires_days,
    p_created_by: userId,
  });

  if (error) {
    throw new Error(`Failed to generate token: ${error.message}`);
  }

  const baseUrl = Deno.env.get('PUBLIC_SITE_URL') || 'https://lewisinsurance.ai';
  const portalUrl = `${baseUrl}/portal/collect/${token}`;

  // Log token generation
  await supabase.from('collection_audit_log').insert({
    workspace_id,
    action: 'token_generated',
    actor_type: 'agent',
    actor_profile_id: userId,
    new_value: { recipient_email, expires_days },
  });

  return { token, portal_url: portalUrl };
}

// =============================================================================
// VALIDATE TOKEN
// =============================================================================

async function validateToken(
  supabase: any,
  request: ValidateTokenRequest,
  clientIp: string | null
): Promise<any> {
  const { token } = request;

  const { data: workspaceId, error } = await supabase.rpc('validate_collection_token', {
    p_token: token,
    p_ip: clientIp,
  });

  if (error || !workspaceId) {
    return { valid: false, error: 'Invalid or expired token' };
  }

  // Log token use
  await supabase.from('collection_audit_log').insert({
    workspace_id: workspaceId,
    action: 'token_used',
    actor_type: 'client',
    actor_ip: clientIp,
  });

  return { valid: true, workspace_id: workspaceId };
}

// =============================================================================
// PORTAL UPLOAD
// =============================================================================

async function portalUpload(
  supabase: any,
  request: PortalUploadRequest,
  clientIp: string | null
): Promise<any> {
  const { token, requirement_id, filename, file_base64, mime_type } = request;

  // Validate token and get workspace
  const { data: workspaceId } = await supabase.rpc('validate_collection_token', {
    p_token: token,
    p_ip: clientIp,
  });

  if (!workspaceId) {
    throw new Error('Invalid or expired token');
  }

  // Verify requirement belongs to this workspace
  const { data: requirement } = await supabase
    .from('collection_requirements')
    .select('*, workspaces!inner(account_id)')
    .eq('id', requirement_id)
    .eq('workspace_id', workspaceId)
    .single();

  if (!requirement) {
    throw new Error('Requirement not found or access denied');
  }

  // Decode file
  const fileData = Uint8Array.from(atob(file_base64), c => c.charCodeAt(0));
  const fileSizeBytes = fileData.length;

  // Check file size limit
  const maxSizeMb = requirement.max_file_size_mb || 25;
  if (fileSizeBytes > maxSizeMb * 1024 * 1024) {
    throw new Error(`File exceeds maximum size of ${maxSizeMb}MB`);
  }

  // Upload to storage
  const timestamp = Date.now();
  const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filePath = `collection/${workspaceId}/${requirement_id}/${timestamp}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from('customer-docs')
    .upload(filePath, fileData, {
      contentType: mime_type,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  // Create document record
  const { data: document, error: docError } = await supabase
    .from('documents')
    .insert({
      account_id: requirement.workspaces.account_id,
      uploaded_by: null, // Portal upload - no auth user
      path: filePath,
      filename,
      content_type: mime_type,
      size_bytes: fileSizeBytes,
      kind: requirement.doc_type,
    })
    .select()
    .single();

  if (docError) {
    console.error('[document-collection] Document record error:', docError);
  }

  // Create collection upload record
  const { data: upload, error: uploadRecordError } = await supabase
    .from('collection_uploads')
    .insert({
      requirement_id,
      document_id: document?.id,
      filename,
      file_path: filePath,
      file_size_bytes: fileSizeBytes,
      mime_type,
      upload_channel: 'portal',
      uploader_ip: clientIp,
      processing_status: 'pending',
      review_status: 'pending',
    })
    .select()
    .single();

  if (uploadRecordError) {
    throw new Error(`Failed to record upload: ${uploadRecordError.message}`);
  }

  // Trigger document processing (async)
  triggerDocumentProcessing(supabase, document?.id, upload.id, requirement.workspaces.account_id);

  // Log upload
  await supabase.from('collection_audit_log').insert({
    workspace_id: workspaceId,
    requirement_id,
    upload_id: upload.id,
    action: 'document_uploaded',
    actor_type: 'client',
    actor_ip: clientIp,
    new_value: { filename, file_size_bytes: fileSizeBytes },
  });

  return {
    upload_id: upload.id,
    document_id: document?.id,
    filename,
  };
}

// Trigger document processing pipeline
async function triggerDocumentProcessing(
  supabase: any,
  documentId: string | null,
  uploadId: string,
  accountId: string
) {
  if (!documentId) return;

  try {
    // Create extraction job
    const { data: extraction } = await supabase
      .from('document_extractions')
      .insert({
        document_url: '', // Will be populated by processing
        document_name: '',
        document_type: 'other',
        account_id: accountId,
        status: 'pending',
      })
      .select()
      .single();

    if (extraction) {
      // Link extraction to upload
      await supabase
        .from('collection_uploads')
        .update({ extraction_id: extraction.id, processing_status: 'processing' })
        .eq('id', uploadId);
    }
  } catch (error) {
    console.error('[document-collection] Failed to trigger processing:', error);
  }
}

// =============================================================================
// UPDATE STATUS
// =============================================================================

async function updateStatus(
  supabase: any,
  request: UpdateStatusRequest,
  userId: string
): Promise<any> {
  const { action, id, status, notes, rejection_reason } = request;

  if (action === 'update_requirement_status') {
    const { error } = await supabase
      .from('collection_requirements')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to update requirement: ${error.message}`);
    }

    // Log
    await supabase.from('collection_audit_log').insert({
      requirement_id: id,
      action: `requirement_updated`,
      actor_type: 'agent',
      actor_profile_id: userId,
      new_value: { status },
    });

  } else if (action === 'update_upload_status') {
    const updateData: any = {
      review_status: status,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (notes) updateData.review_notes = notes;
    if (rejection_reason) updateData.rejection_reason = rejection_reason;

    // Get upload for logging
    const { data: upload } = await supabase
      .from('collection_uploads')
      .select('requirement_id')
      .eq('id', id)
      .single();

    const { error } = await supabase
      .from('collection_uploads')
      .update(updateData)
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to update upload: ${error.message}`);
    }

    // Determine audit action
    const auditAction = status === 'accepted' ? 'review_accepted' 
      : status === 'rejected' ? 'review_rejected' 
      : status === 'needs_changes' ? 'review_needs_changes'
      : 'review_started';

    await supabase.from('collection_audit_log').insert({
      requirement_id: upload?.requirement_id,
      upload_id: id,
      action: auditAction,
      actor_type: 'agent',
      actor_profile_id: userId,
      new_value: { status, notes, rejection_reason },
    });
  }

  return { updated: true };
}

// =============================================================================
// SEND REMINDER
// =============================================================================

async function sendReminder(
  supabase: any,
  request: SendReminderRequest,
  userId: string
): Promise<any> {
  const { workspace_id } = request;

  // Get active tokens for this workspace
  const { data: tokens } = await supabase
    .from('collection_access_tokens')
    .select('recipient_email, recipient_name')
    .eq('workspace_id', workspace_id)
    .eq('is_revoked', false)
    .gt('expires_at', new Date().toISOString());

  if (!tokens || tokens.length === 0) {
    return { sent: false, message: 'No active tokens found' };
  }

  // Get incomplete requirements
  const { data: requirements } = await supabase
    .from('collection_requirements')
    .select('label, status')
    .eq('workspace_id', workspace_id)
    .eq('is_required', true)
    .not('status', 'eq', 'accepted');

  // Log reminder (actual sending would integrate with email-send edge function)
  await supabase.from('collection_audit_log').insert({
    workspace_id,
    action: 'packet_reminded',
    actor_type: 'agent',
    actor_profile_id: userId,
    new_value: { 
      recipients: tokens.map((t: any) => t.recipient_email),
      pending_requirements: requirements?.length || 0,
    },
  });

  return { 
    sent: true, 
    recipients: tokens.length,
    pending_requirements: requirements?.length || 0,
  };
}

// =============================================================================
// GET PACKET DATA
// =============================================================================

async function getPacketData(
  supabase: any,
  request: GetPacketDataRequest,
  userId: string | null,
  clientIp: string | null
): Promise<any> {
  let workspaceId = request.workspace_id;

  // If using token, validate and get workspace
  if (request.token) {
    const { data: wsId } = await supabase.rpc('validate_collection_token', {
      p_token: request.token,
      p_ip: clientIp,
    });

    if (!wsId) {
      throw new Error('Invalid or expired token');
    }
    workspaceId = wsId;
  } else if (!userId) {
    throw new Error('Authentication required');
  }

  if (!workspaceId) {
    throw new Error('Workspace ID required');
  }

  // Get workspace with account
  const { data: workspace } = await supabase
    .from('workspaces')
    .select(`
      *,
      accounts (id, name, email, phone),
      policies (id, policy_number, carrier_info)
    `)
    .eq('id', workspaceId)
    .single();

  if (!workspace) {
    throw new Error('Packet not found');
  }

  // Get requirements with uploads
  const { data: requirements } = await supabase
    .from('collection_requirements')
    .select(`
      *,
      collection_uploads (
        id, filename, file_path, file_size_bytes, mime_type,
        upload_channel, processing_status, review_status,
        review_notes, rejection_reason, client_feedback,
        created_at
      )
    `)
    .eq('workspace_id', workspaceId)
    .order('display_order');

  // Get status summary
  const { data: statusSummary } = await supabase.rpc('get_collection_status_summary', {
    p_workspace_id: workspaceId,
  });

  // Get branding if accessing via portal
  let branding = null;
  if (request.token) {
    const { data: brandingData } = await supabase
      .from('portal_branding')
      .select('*')
      .eq('account_id', workspace.account_id)
      .eq('is_default', true)
      .maybeSingle();
    
    branding = brandingData;
  }

  return {
    workspace,
    requirements,
    status_summary: statusSummary,
    branding,
    is_portal_access: !!request.token,
  };
}

