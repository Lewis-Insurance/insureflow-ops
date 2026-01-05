import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';
import { ValidationError, createErrorResponse } from '../_shared/error-handler.ts';

const logger = createLogger('payment-record');

interface RecordPaymentRequest {
  policy_id?: string | null;
  account_id?: string | null;
  payment_method_id: string;
  amount: number;
  amount_tendered?: number | null;
  reference_number?: string | null;
  check_number?: string | null;
  check_date?: string | null;
  payer_name?: string | null;
  payer_address?: string | null;
  received_date: string;
  payment_source?: string;
  invoice_number?: string | null;
  notes?: string | null;
}

serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders();

  try {
    logger.logRequest(req);

    // Get auth token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new ValidationError('Missing Authorization header');
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new ValidationError('Invalid or expired token');
    }

    // Parse request body
    const body: RecordPaymentRequest = await req.json();

    // Validate required fields
    if (!body.payment_method_id) {
      throw new ValidationError('Payment method is required');
    }
    if (!body.amount || body.amount <= 0) {
      throw new ValidationError('Amount must be greater than 0');
    }
    if (!body.received_date) {
      throw new ValidationError('Received date is required');
    }

    // Get user's org_id from profiles table
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();

    // If profile doesn't have org_id, try getting from agency_workspace_memberships
    let orgId = profile?.org_id;
    if (!orgId) {
      const { data: membership } = await supabase
        .from('agency_workspace_memberships')
        .select('agency_workspace_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .single();

      orgId = membership?.agency_workspace_id;
    }

    if (!orgId) {
      throw new ValidationError('User organization not found');
    }

    // Validate payment method belongs to org
    const { data: paymentMethod, error: methodError } = await supabase
      .from('payment_methods')
      .select('id, type, requires_check_number, requires_reference')
      .eq('id', body.payment_method_id)
      .eq('org_id', orgId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .single();

    if (methodError || !paymentMethod) {
      throw new ValidationError('Invalid payment method');
    }

    // Validate check number if required
    if (paymentMethod.requires_check_number && !body.check_number) {
      throw new ValidationError('Check number is required for this payment method');
    }

    // Validate reference number if required
    if (paymentMethod.requires_reference && !body.reference_number) {
      throw new ValidationError('Reference number is required for this payment method');
    }

    // Calculate change for cash payments
    let changeGiven: number | null = null;
    if (paymentMethod.type === 'cash' && body.amount_tendered) {
      if (body.amount_tendered < body.amount) {
        throw new ValidationError('Amount tendered cannot be less than payment amount');
      }
      changeGiven = body.amount_tendered - body.amount;
    }

    // Validate policy belongs to org if provided
    if (body.policy_id) {
      const { data: policy, error: policyError } = await supabase
        .from('policies')
        .select('id, account_id')
        .eq('id', body.policy_id)
        .eq('org_id', orgId)
        .single();

      if (policyError || !policy) {
        throw new ValidationError('Invalid policy');
      }

      // Use policy's account_id if not explicitly provided
      if (!body.account_id && policy.account_id) {
        body.account_id = policy.account_id;
      }
    }

    // Validate account belongs to org if provided
    if (body.account_id) {
      const { data: account, error: accountError } = await supabase
        .from('accounts')
        .select('id')
        .eq('id', body.account_id)
        .eq('org_id', orgId)
        .single();

      if (accountError || !account) {
        throw new ValidationError('Invalid account');
      }
    }

    // Get or create day sheet for the received date (not server UTC date)
    // This fixes timezone issues where evening payments were assigned to wrong day
    const { data: daySheetId, error: daySheetError } = await supabase
      .rpc('get_or_create_day_sheet', {
        p_org_id: orgId,
        p_date: body.received_date  // Use client-provided date to avoid UTC issues
      });

    if (daySheetError) {
      logger.error('Failed to get/create day sheet', { error: daySheetError });
      throw new ValidationError('Failed to create day sheet');
    }

    // Generate receipt number
    const receiptNumber = `RCP-${Date.now().toString(36).toUpperCase()}`;

    // Insert payment
    const { data: payment, error: paymentError } = await supabase
      .from('premium_payments')
      .insert({
        org_id: orgId,
        day_sheet_id: daySheetId,
        policy_id: body.policy_id || null,
        account_id: body.account_id || null,
        payment_method_id: body.payment_method_id,
        amount: body.amount,
        amount_tendered: body.amount_tendered || null,
        change_given: changeGiven,
        reference_number: body.reference_number || null,
        check_number: body.check_number || null,
        check_date: body.check_date || null,
        payer_name: body.payer_name || null,
        payer_address: body.payer_address || null,
        received_date: body.received_date,
        received_by: user.id,
        payment_source: body.payment_source || 'in_person',
        invoice_number: body.invoice_number || null,
        receipt_number: receiptNumber,
        notes: body.notes || null,
        status: 'recorded',
      })
      .select(`
        *,
        payment_method:payment_methods(id, name, type),
        policy:policies(policy_number, policy_type),
        account:accounts(name),
        day_sheet:day_sheets(sheet_date, status)
      `)
      .single();

    if (paymentError) {
      logger.error('Failed to insert payment', { error: paymentError });
      throw new ValidationError('Failed to record payment: ' + paymentError.message);
    }

    logger.info('Payment recorded successfully', {
      payment_id: payment.id,
      amount: body.amount,
      method: paymentMethod.type,
      day_sheet_id: daySheetId,
    });

    logger.logResponse(200);

    return new Response(
      JSON.stringify({
        success: true,
        data: payment,
        receipt_number: receiptNumber,
        day_sheet_id: daySheetId,
        change_given: changeGiven,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    logger.error('Payment record error', { error });
    return createErrorResponse(error, corsHeaders);
  }
});
