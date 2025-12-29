import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';
import { ValidationError, createErrorResponse } from '../_shared/error-handler.ts';

const logger = createLogger('day-sheet-close');

interface CloseDaySheetRequest {
  day_sheet_id: string;
  notes?: string | null;
  create_deposit?: boolean;
  bank_account_id?: string;
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
    const body: CloseDaySheetRequest = await req.json();

    // Validate required fields
    if (!body.day_sheet_id) {
      throw new ValidationError('Day sheet ID is required');
    }

    // Get user's org_id
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.org_id) {
      throw new ValidationError('User organization not found');
    }

    const orgId = profile.org_id;

    // Get day sheet and verify ownership
    const { data: daySheet, error: sheetError } = await supabase
      .from('day_sheets')
      .select('*')
      .eq('id', body.day_sheet_id)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .single();

    if (sheetError || !daySheet) {
      throw new ValidationError('Day sheet not found');
    }

    if (daySheet.status !== 'open') {
      throw new ValidationError(`Day sheet is already ${daySheet.status}`);
    }

    // Calculate totals using the database function
    const { data: totals, error: totalsError } = await supabase
      .rpc('calculate_day_sheet_totals', { p_sheet_id: body.day_sheet_id });

    if (totalsError) {
      logger.error('Failed to calculate totals', { error: totalsError });
      throw new ValidationError('Failed to calculate day sheet totals');
    }

    // Get the first row of totals (function returns a table)
    const sheetTotals = totals?.[0] || {
      total_cash: 0,
      total_checks: 0,
      total_credit_cards: 0,
      total_debit_cards: 0,
      total_ach: 0,
      total_agency_bill: 0,
      total_other: 0,
      grand_total: 0,
      payment_count: 0,
      check_count: 0,
    };

    // Generate sheet number
    const sheetNumber = `DS-${daySheet.sheet_date.replace(/-/g, '')}-${Date.now().toString(36).toUpperCase().slice(-4)}`;

    // Update day sheet with totals and close it
    const { data: closedSheet, error: closeError } = await supabase
      .from('day_sheets')
      .update({
        status: 'closed',
        closed_by: user.id,
        closed_at: new Date().toISOString(),
        sheet_number: sheetNumber,
        total_cash: sheetTotals.total_cash,
        total_checks: sheetTotals.total_checks,
        total_credit_cards: sheetTotals.total_credit_cards,
        total_debit_cards: sheetTotals.total_debit_cards,
        total_ach: sheetTotals.total_ach,
        total_agency_bill: sheetTotals.total_agency_bill,
        total_other: sheetTotals.total_other,
        grand_total: sheetTotals.grand_total,
        payment_count: sheetTotals.payment_count,
        check_count: sheetTotals.check_count,
        notes: body.notes || daySheet.notes,
      })
      .eq('id', body.day_sheet_id)
      .select()
      .single();

    if (closeError) {
      logger.error('Failed to close day sheet', { error: closeError });
      throw new ValidationError('Failed to close day sheet');
    }

    // Update all payments in this day sheet to 'deposited' status
    const { error: paymentsUpdateError } = await supabase
      .from('premium_payments')
      .update({ status: 'deposited' })
      .eq('day_sheet_id', body.day_sheet_id)
      .eq('status', 'recorded');

    if (paymentsUpdateError) {
      logger.warn('Failed to update payment statuses', { error: paymentsUpdateError });
    }

    // Optionally create escrow deposit
    let escrowDeposit = null;
    if (body.create_deposit && body.bank_account_id) {
      // Validate bank account
      const { data: bankAccount, error: bankError } = await supabase
        .from('bank_accounts')
        .select('id')
        .eq('id', body.bank_account_id)
        .eq('org_id', orgId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .single();

      if (bankError || !bankAccount) {
        logger.warn('Invalid bank account for deposit', { bank_account_id: body.bank_account_id });
      } else {
        // Calculate depositable amount (cash + checks)
        const depositAmount = sheetTotals.total_cash + sheetTotals.total_checks;

        if (depositAmount > 0) {
          const { data: deposit, error: depositError } = await supabase
            .from('escrow_deposits')
            .insert({
              org_id: orgId,
              day_sheet_id: body.day_sheet_id,
              bank_account_id: body.bank_account_id,
              deposit_date: daySheet.sheet_date,
              total_amount: depositAmount,
              cash_amount: sheetTotals.total_cash,
              check_amount: sheetTotals.total_checks,
              check_count: sheetTotals.check_count,
              reconciliation_status: 'pending',
            })
            .select()
            .single();

          if (depositError) {
            logger.warn('Failed to create escrow deposit', { error: depositError });
          } else {
            escrowDeposit = deposit;

            // Update day sheet with deposit reference
            await supabase
              .from('day_sheets')
              .update({ status: 'deposited' })
              .eq('id', body.day_sheet_id);
          }
        }
      }
    }

    logger.info('Day sheet closed successfully', {
      day_sheet_id: body.day_sheet_id,
      sheet_number: sheetNumber,
      grand_total: sheetTotals.grand_total,
      payment_count: sheetTotals.payment_count,
      deposit_created: !!escrowDeposit,
    });

    logger.logResponse(200);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          day_sheet: closedSheet,
          totals: sheetTotals,
          escrow_deposit: escrowDeposit,
        },
        sheet_number: sheetNumber,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    logger.error('Day sheet close error', { error });
    return createErrorResponse(error, corsHeaders);
  }
});
