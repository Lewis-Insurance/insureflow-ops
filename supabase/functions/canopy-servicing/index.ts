// ============================================================================
// CANOPY SERVICING API - 2-WAY SYNC (WRITE OPERATIONS)
// ============================================================================
// Triggers Canopy Servicing API to perform policy changes at carriers
// Supports: Add vehicle, remove vehicle, update coverages, add driver, etc.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth } from "../_shared/auth.ts";
import {
  clientSendApprovalGateResponse,
  createSupabaseClientSendApprovalStore,
} from "../_shared/clientSendApprovalGate.ts";
import { createLogger } from "../_shared/logger.ts";
import { ValidationError, createErrorResponse, getCorsHeaders, handleCors } from "../_shared/error-handler.ts";

const logger = createLogger('canopy-servicing');

const CANOPY_API_BASE = 'https://app.usecanopy.com/api/v1.0.0';

// Servicing action types supported by Canopy
type ServicingActionType =
  | 'add_vehicle'
  | 'remove_vehicle'
  | 'update_vehicle'
  | 'add_driver'
  | 'remove_driver'
  | 'update_driver'
  | 'update_coverages'
  | 'update_address'
  | 'request_id_card'
  | 'request_declarations';

interface ServicingRequest {
  action: 'submit' | 'status' | 'list' | 'confirm' | 'capabilities';
  pull_id?: string;
  canopy_pull_id?: string;
  policy_id?: string;
  action_type?: ServicingActionType;
  action_data?: Record<string, unknown>;
  servicing_action_id?: string;
}

interface VehicleData {
  year: number;
  make: string;
  model: string;
  vin?: string;
  usage_type?: string;
  annual_mileage?: number;
  ownership?: string;
  garage_address?: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
}

interface DriverData {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender?: string;
  marital_status?: string;
  license_number?: string;
  license_state?: string;
  relation_to_insured?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  const corsHeaders = getCorsHeaders(req);
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const canopyClientId = Deno.env.get('CANOPY_CLIENT_ID');
  const canopyClientSecret = Deno.env.get('CANOPY_CLIENT_SECRET');
  const canopyTeamId = Deno.env.get('CANOPY_TEAM_ID');

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Validate Canopy credentials
    if (!canopyClientId || !canopyClientSecret || !canopyTeamId) {
      throw new ValidationError('Missing Canopy API credentials');
    }

    // Parse request
    const body: ServicingRequest = await req.json();

    logger.info('Servicing API request', {
      action: body.action,
      actionType: body.action_type,
      pullId: body.pull_id
    });

    switch (body.action) {
      case 'submit':
        // Submit a servicing action request
        if (!body.pull_id && !body.canopy_pull_id) {
          throw new ValidationError('pull_id or canopy_pull_id required');
        }
        if (!body.action_type) {
          throw new ValidationError('action_type required');
        }
        return await submitServicingAction(
          supabase,
          canopyClientId,
          canopyClientSecret,
          canopyTeamId,
          body,
          corsHeaders,
          req,
        );

      case 'status':
        // Get status of a servicing action
        if (!body.servicing_action_id) {
          throw new ValidationError('servicing_action_id required');
        }
        return await getServicingStatus(supabase, body.servicing_action_id, corsHeaders);

      case 'list':
        // List all servicing actions for a pull
        return await listServicingActions(supabase, body.pull_id, corsHeaders);

      case 'confirm':
        // Consumer confirms a pending servicing action
        if (!body.servicing_action_id) {
          throw new ValidationError('servicing_action_id required');
        }
        return await confirmServicingAction(
          supabase,
          canopyClientId,
          canopyClientSecret,
          canopyTeamId,
          body.servicing_action_id,
          corsHeaders
        );

      case 'capabilities':
        // Get carrier capabilities for a pull
        if (!body.pull_id && !body.canopy_pull_id) {
          throw new ValidationError('pull_id or canopy_pull_id required');
        }
        return await getCarrierCapabilities(
          supabase,
          canopyClientId,
          canopyClientSecret,
          canopyTeamId,
          body.pull_id,
          body.canopy_pull_id,
          corsHeaders
        );

      default:
        throw new ValidationError(`Unknown action: ${body.action}`);
    }

  } catch (error) {
    logger.error('Servicing API error', { error: error instanceof Error ? error.message : String(error) });
    return createErrorResponse(error, corsHeaders);
  }
});

// ============================================================================
// SUBMIT SERVICING ACTION
// ============================================================================

async function submitServicingAction(
  supabase: ReturnType<typeof createClient>,
  clientId: string,
  clientSecret: string,
  teamId: string,
  request: ServicingRequest,
  corsHeaders: Record<string, string>,
  req: Request,
) {
  // Get the pull record
  let pull;
  if (request.pull_id) {
    const { data, error } = await supabase
      .from('canopy_pulls')
      .select('id, canopy_pull_id')
      .eq('id', request.pull_id)
      .single();
    if (error || !data) {
      throw new ValidationError(`Pull not found: ${request.pull_id}`);
    }
    pull = data;
  } else if (request.canopy_pull_id) {
    const { data, error } = await supabase
      .from('canopy_pulls')
      .select('id, canopy_pull_id')
      .eq('canopy_pull_id', request.canopy_pull_id)
      .single();
    if (error || !data) {
      throw new ValidationError(`Pull not found: ${request.canopy_pull_id}`);
    }
    pull = data;
  }

  if (!pull) {
    throw new ValidationError('Pull not found');
  }

  // Get policy if specified, otherwise use first policy
  let policyId = request.policy_id;
  if (!policyId) {
    const { data: policies } = await supabase
      .from('canopy_policies')
      .select('canopy_policy_id')
      .eq('pull_id', pull.id)
      .limit(1);

    policyId = policies?.[0]?.canopy_policy_id;
  }

  logger.info('Submitting servicing action', {
    pullId: pull.id,
    actionType: request.action_type,
    policyId
  });

  const deliveryMethod = String(request.action_data?.delivery_method ?? 'email');
  const deliveryEmail = typeof request.action_data?.email === 'string'
    ? request.action_data.email.trim()
    : '';
  const emailDeliveryAction =
    request.action_type === 'request_id_card' || request.action_type === 'request_declarations';

  if (emailDeliveryAction && deliveryMethod === 'email' && deliveryEmail) {
    const { user, error: authError } = await verifyAuth(req, supabase);
    if (authError || !user) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'authentication_required',
          message: 'JWT authentication is required for email servicing requests.',
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const canonicalPayload = {
      action_type: request.action_type,
      policy_id: policyId ?? null,
      email: deliveryEmail,
      delivery_method: deliveryMethod,
      client_send_approval: request.action_data?.client_send_approval,
    };

    const gateResponse = await clientSendApprovalGateResponse({
      surface: 'canopy-servicing-email',
      payload: canonicalPayload,
      userId: user.id,
      approvalStore: createSupabaseClientSendApprovalStore(supabase),
      corsHeaders,
    });

    if (gateResponse) {
      return gateResponse;
    }
  }

  // Create servicing action record
  const { data: actionRecord, error: insertError } = await supabase
    .from('canopy_servicing_actions')
    .insert({
      pull_id: pull.id,
      action_type: request.action_type,
      request_data: request.action_data,
      status: 'pending',
      requested_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (insertError) {
    logger.error('Failed to create action record', { error: insertError.message });
    throw insertError;
  }

  // Build Canopy API request based on action type
  const canopyPayload = buildCanopyPayload(request.action_type!, request.action_data, policyId);

  // Call Canopy Servicing API
  // POST /teams/{teamId}/servicing/pulls/{pullId}/actions
  const servicingUrl = `${CANOPY_API_BASE}/teams/${teamId}/servicing/pulls/${pull.canopy_pull_id}/actions`;

  logger.info('Calling Canopy servicing API', { url: servicingUrl, payload: canopyPayload });

  const response = await fetch(servicingUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'x-canopy-client-id': clientId,
      'x-canopy-client-secret': clientSecret,
    },
    body: JSON.stringify(canopyPayload),
  });

  const responseText = await response.text();
  let responseData;
  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = { raw: responseText };
  }

  logger.info('Canopy servicing response', {
    status: response.status,
    data: JSON.stringify(responseData).substring(0, 500)
  });

  // Update action record with response
  if (response.ok) {
    const canopyActionId = responseData.action_id || responseData.id;

    await supabase.from('canopy_servicing_actions').update({
      canopy_action_id: canopyActionId,
      status: responseData.status === 'waiting_confirmation' ? 'waiting_confirmation' : 'submitted',
      confirmation_url: responseData.confirmation_url,
      carrier_response: responseData,
      updated_at: new Date().toISOString(),
    }).eq('id', actionRecord.id);

    return new Response(JSON.stringify({
      success: true,
      action_id: actionRecord.id,
      canopy_action_id: canopyActionId,
      status: responseData.status || 'submitted',
      confirmation_required: !!responseData.confirmation_url,
      confirmation_url: responseData.confirmation_url,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } else {
    // Update with error
    await supabase.from('canopy_servicing_actions').update({
      status: 'error',
      carrier_response: responseData,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', actionRecord.id);

    const errorMessage = responseData.error?.message || responseData.message || 'Servicing action failed';

    return new Response(JSON.stringify({
      success: false,
      action_id: actionRecord.id,
      error: errorMessage,
      canopy_response: responseData,
    }), {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Build payload for Canopy Servicing API based on action type
function buildCanopyPayload(
  actionType: ServicingActionType,
  actionData: Record<string, unknown> | undefined,
  policyId?: string
) {
  const payload: Record<string, unknown> = {
    action_type: actionType.toUpperCase(),
    policy_id: policyId,
  };

  switch (actionType) {
    case 'add_vehicle':
      payload.vehicle = {
        year: actionData?.year,
        make: actionData?.make,
        model: actionData?.model,
        vin: actionData?.vin,
        usage: actionData?.usage_type,
        annual_mileage: actionData?.annual_mileage,
        ownership: actionData?.ownership,
        garaging_address: actionData?.garage_address,
      };
      break;

    case 'remove_vehicle':
      payload.vehicle_id = actionData?.vehicle_id;
      payload.vin = actionData?.vin;
      payload.removal_date = actionData?.removal_date || new Date().toISOString().split('T')[0];
      break;

    case 'add_driver':
      payload.driver = {
        first_name: actionData?.first_name,
        last_name: actionData?.last_name,
        date_of_birth: actionData?.date_of_birth,
        gender: actionData?.gender,
        marital_status: actionData?.marital_status,
        license_number: actionData?.license_number,
        license_state: actionData?.license_state,
        relation_to_insured: actionData?.relation_to_insured,
      };
      break;

    case 'remove_driver':
      payload.driver_id = actionData?.driver_id;
      payload.removal_date = actionData?.removal_date || new Date().toISOString().split('T')[0];
      break;

    case 'update_coverages':
      payload.coverages = actionData?.coverages;
      payload.vehicle_id = actionData?.vehicle_id;
      break;

    case 'update_address':
      payload.address = {
        street: actionData?.street,
        city: actionData?.city,
        state: actionData?.state,
        zip: actionData?.zip,
      };
      payload.address_type = actionData?.address_type || 'mailing';
      break;

    case 'request_id_card':
      payload.delivery_method = actionData?.delivery_method || 'email';
      payload.email = actionData?.email;
      break;

    case 'request_declarations':
      payload.delivery_method = actionData?.delivery_method || 'email';
      payload.email = actionData?.email;
      break;

    default:
      payload.data = actionData;
  }

  return payload;
}

// ============================================================================
// GET SERVICING ACTION STATUS
// ============================================================================

async function getServicingStatus(
  supabase: ReturnType<typeof createClient>,
  actionId: string,
  corsHeaders: Record<string, string>
) {
  const { data: action, error } = await supabase
    .from('canopy_servicing_actions')
    .select(`
      *,
      canopy_pulls (
        canopy_pull_id,
        lead_id,
        account_id
      )
    `)
    .eq('id', actionId)
    .single();

  if (error || !action) {
    throw new ValidationError(`Servicing action not found: ${actionId}`);
  }

  return new Response(JSON.stringify({
    success: true,
    action: {
      id: action.id,
      action_type: action.action_type,
      status: action.status,
      request_data: action.request_data,
      carrier_response: action.carrier_response,
      confirmation_url: action.confirmation_url,
      confirmation_deadline: action.confirmation_deadline,
      requested_at: action.requested_at,
      completed_at: action.completed_at,
      pull_id: action.pull_id,
      canopy_pull_id: action.canopy_pulls?.canopy_pull_id,
    },
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// ============================================================================
// LIST SERVICING ACTIONS
// ============================================================================

async function listServicingActions(
  supabase: ReturnType<typeof createClient>,
  pullId: string | undefined,
  corsHeaders: Record<string, string>
) {
  let query = supabase
    .from('canopy_servicing_actions')
    .select(`
      *,
      canopy_pulls (
        canopy_pull_id,
        lead_id,
        account_id
      )
    `)
    .order('requested_at', { ascending: false });

  if (pullId) {
    query = query.eq('pull_id', pullId);
  }

  const { data: actions, error } = await query.limit(100);

  if (error) {
    logger.error('Failed to list servicing actions', { error: error.message });
    throw error;
  }

  return new Response(JSON.stringify({
    success: true,
    actions: actions?.map(a => ({
      id: a.id,
      action_type: a.action_type,
      status: a.status,
      requested_at: a.requested_at,
      completed_at: a.completed_at,
      confirmation_required: !!a.confirmation_url,
      pull_id: a.pull_id,
      canopy_pull_id: a.canopy_pulls?.canopy_pull_id,
    })),
    total: actions?.length || 0,
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// ============================================================================
// CONFIRM SERVICING ACTION
// ============================================================================

async function confirmServicingAction(
  supabase: ReturnType<typeof createClient>,
  clientId: string,
  clientSecret: string,
  teamId: string,
  actionId: string,
  corsHeaders: Record<string, string>
) {
  // Get the action
  const { data: action, error } = await supabase
    .from('canopy_servicing_actions')
    .select(`
      *,
      canopy_pulls (
        canopy_pull_id
      )
    `)
    .eq('id', actionId)
    .single();

  if (error || !action) {
    throw new ValidationError(`Servicing action not found: ${actionId}`);
  }

  if (action.status !== 'waiting_confirmation') {
    return new Response(JSON.stringify({
      success: false,
      error: `Action is not waiting for confirmation (status: ${action.status})`,
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Call Canopy to confirm
  const confirmUrl = `${CANOPY_API_BASE}/teams/${teamId}/servicing/actions/${action.canopy_action_id}/confirm`;

  const response = await fetch(confirmUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'x-canopy-client-id': clientId,
      'x-canopy-client-secret': clientSecret,
    },
  });

  const responseData = await response.json().catch(() => ({}));

  if (response.ok) {
    await supabase.from('canopy_servicing_actions').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      carrier_response: responseData,
      updated_at: new Date().toISOString(),
    }).eq('id', actionId);

    return new Response(JSON.stringify({
      success: true,
      message: 'Servicing action confirmed and completed',
      action_id: actionId,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } else {
    await supabase.from('canopy_servicing_actions').update({
      status: 'error',
      carrier_response: responseData,
      updated_at: new Date().toISOString(),
    }).eq('id', actionId);

    return new Response(JSON.stringify({
      success: false,
      error: responseData.message || 'Confirmation failed',
      canopy_response: responseData,
    }), {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// ============================================================================
// GET CARRIER CAPABILITIES
// ============================================================================

async function getCarrierCapabilities(
  supabase: ReturnType<typeof createClient>,
  clientId: string,
  clientSecret: string,
  teamId: string,
  pullId?: string,
  canopyPullId?: string,
  corsHeaders: Record<string, string> = {}
) {
  // Get the pull
  let pull;
  if (pullId) {
    const { data } = await supabase
      .from('canopy_pulls')
      .select('id, canopy_pull_id')
      .eq('id', pullId)
      .single();
    pull = data;
  } else if (canopyPullId) {
    const { data } = await supabase
      .from('canopy_pulls')
      .select('id, canopy_pull_id')
      .eq('canopy_pull_id', canopyPullId)
      .single();
    pull = data;
  }

  if (!pull) {
    throw new ValidationError('Pull not found');
  }

  // Check cache first
  const { data: cachedCapabilities } = await supabase
    .from('canopy_carrier_capabilities')
    .select('*')
    .eq('pull_id', pull.id)
    .gt('cached_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // 24hr cache
    .single();

  if (cachedCapabilities) {
    return new Response(JSON.stringify({
      success: true,
      capabilities: cachedCapabilities.supported_actions,
      carrier_name: cachedCapabilities.carrier_name,
      cached: true,
      cached_at: cachedCapabilities.cached_at,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Fetch from Canopy API
  // GET /teams/{teamId}/servicing/pulls/{pullId}/capabilities
  const capabilitiesUrl = `${CANOPY_API_BASE}/teams/${teamId}/servicing/pulls/${pull.canopy_pull_id}/capabilities`;

  const response = await fetch(capabilitiesUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'x-canopy-client-id': clientId,
      'x-canopy-client-secret': clientSecret,
    },
  });

  if (response.ok) {
    const responseData = await response.json();

    // Cache the result
    await supabase.from('canopy_carrier_capabilities').upsert({
      pull_id: pull.id,
      carrier_name: responseData.carrier_name,
      carrier_code: responseData.carrier_code,
      supported_actions: responseData.actions || responseData.capabilities || [],
      cached_at: new Date().toISOString(),
    }, {
      onConflict: 'pull_id'
    });

    return new Response(JSON.stringify({
      success: true,
      capabilities: responseData.actions || responseData.capabilities || [],
      carrier_name: responseData.carrier_name,
      cached: false,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } else {
    const errorData = await response.json().catch(() => ({}));

    return new Response(JSON.stringify({
      success: false,
      error: errorData.message || 'Failed to fetch capabilities',
    }), {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
