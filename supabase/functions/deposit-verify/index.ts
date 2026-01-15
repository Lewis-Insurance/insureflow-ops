import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';
import { ValidationError, createErrorResponse } from '../_shared/error-handler.ts';

const logger = createLogger('deposit-verify');

type ActionType = 'verify' | 'match' | 'unmatch' | 'exclude' | 'reconcile';

interface VerifyDepositRequest {
  action: ActionType;
  deposit_id?: string;
  verified_amount?: number;
  verification_notes?: string;
}

interface MatchRequest {
  action: ActionType;
  line_id: string;
  deposit_id: string;
}

interface UnmatchRequest {
  action: ActionType;
  line_id?: string;
  deposit_id?: string;
}

interface ExcludeRequest {
  action: ActionType;
  line_id: string;
  exclude_reason: string;
}

interface ReconcileRequest {
  action: ActionType;
  statement_id: string;
  reconciled_balance?: number;
  notes?: string;
}

type RequestBody = VerifyDepositRequest | MatchRequest | UnmatchRequest | ExcludeRequest | ReconcileRequest;

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

    // Parse request body
    const body: RequestBody = await req.json();

    if (!body.action) {
      throw new ValidationError('Action is required');
    }

    let result: Record<string, unknown> = {};

    switch (body.action) {
      case 'verify': {
        const verifyBody = body as VerifyDepositRequest;

        if (!verifyBody.deposit_id) {
          throw new ValidationError('Deposit ID is required');
        }
        if (verifyBody.verified_amount === undefined || verifyBody.verified_amount === null) {
          throw new ValidationError('Verified amount is required');
        }

        // Get deposit and verify ownership
        const { data: deposit, error: depositError } = await supabase
          .from('escrow_deposits')
          .select('*')
          .eq('id', verifyBody.deposit_id)
          .eq('org_id', orgId)
          .is('deleted_at', null)
          .single();

        if (depositError || !deposit) {
          throw new ValidationError('Deposit not found');
        }

        // Calculate variance
        const variance = verifyBody.verified_amount - deposit.total_amount;
        const newStatus = Math.abs(variance) < 0.01 ? 'matched' : 'variance';

        // Update deposit
        const { data: updatedDeposit, error: updateError } = await supabase
          .from('escrow_deposits')
          .update({
            verified_amount: verifyBody.verified_amount,
            verified_at: new Date().toISOString(),
            verified_by: user.id,
            verification_notes: verifyBody.verification_notes || null,
            variance_amount: variance,
            reconciliation_status: newStatus,
          })
          .eq('id', verifyBody.deposit_id)
          .select()
          .single();

        if (updateError) {
          throw new ValidationError('Failed to verify deposit');
        }

        result = {
          deposit: updatedDeposit,
          variance,
          status: newStatus,
        };

        logger.info('Deposit verified', {
          deposit_id: verifyBody.deposit_id,
          verified_amount: verifyBody.verified_amount,
          variance,
          status: newStatus,
        });
        break;
      }

      case 'match': {
        const matchBody = body as MatchRequest;

        if (!matchBody.line_id) {
          throw new ValidationError('Statement line ID is required');
        }
        if (!matchBody.deposit_id) {
          throw new ValidationError('Deposit ID is required');
        }

        // Get line and verify access via statement
        const { data: line, error: lineError } = await supabase
          .from('bank_statement_lines')
          .select('*, statement:bank_statements!inner(org_id)')
          .eq('id', matchBody.line_id)
          .single();

        if (lineError || !line || line.statement.org_id !== orgId) {
          throw new ValidationError('Statement line not found');
        }

        if (line.status === 'matched') {
          throw new ValidationError('Line is already matched');
        }

        // Get deposit and verify ownership
        const { data: deposit, error: depositError } = await supabase
          .from('escrow_deposits')
          .select('*')
          .eq('id', matchBody.deposit_id)
          .eq('org_id', orgId)
          .is('deleted_at', null)
          .single();

        if (depositError || !deposit) {
          throw new ValidationError('Deposit not found');
        }

        if (deposit.reconciliation_status === 'matched') {
          throw new ValidationError('Deposit is already matched');
        }

        // Update line
        const { data: updatedLine, error: lineUpdateError } = await supabase
          .from('bank_statement_lines')
          .update({
            matched_deposit_id: matchBody.deposit_id,
            matched_at: new Date().toISOString(),
            matched_by: user.id,
            status: 'matched',
          })
          .eq('id', matchBody.line_id)
          .select()
          .single();

        if (lineUpdateError) {
          throw new ValidationError('Failed to match line');
        }

        // Update deposit
        const { data: updatedDeposit, error: depositUpdateError } = await supabase
          .from('escrow_deposits')
          .update({
            statement_line_id: matchBody.line_id,
            matched_at: new Date().toISOString(),
            reconciliation_status: 'matched',
          })
          .eq('id', matchBody.deposit_id)
          .select()
          .single();

        if (depositUpdateError) {
          throw new ValidationError('Failed to update deposit');
        }

        result = {
          line: updatedLine,
          deposit: updatedDeposit,
        };

        logger.info('Deposit matched to line', {
          line_id: matchBody.line_id,
          deposit_id: matchBody.deposit_id,
        });
        break;
      }

      case 'unmatch': {
        const unmatchBody = body as UnmatchRequest;

        if (!unmatchBody.line_id && !unmatchBody.deposit_id) {
          throw new ValidationError('Either line ID or deposit ID is required');
        }

        let lineId = unmatchBody.line_id;
        let depositId = unmatchBody.deposit_id;

        // If only one is provided, look up the other
        if (lineId && !depositId) {
          const { data: line } = await supabase
            .from('bank_statement_lines')
            .select('matched_deposit_id')
            .eq('id', lineId)
            .single();
          depositId = line?.matched_deposit_id;
        } else if (depositId && !lineId) {
          const { data: deposit } = await supabase
            .from('escrow_deposits')
            .select('statement_line_id')
            .eq('id', depositId)
            .single();
          lineId = deposit?.statement_line_id;
        }

        // Update line if exists
        if (lineId) {
          await supabase
            .from('bank_statement_lines')
            .update({
              matched_deposit_id: null,
              matched_at: null,
              matched_by: null,
              status: 'unmatched',
            })
            .eq('id', lineId);
        }

        // Update deposit if exists
        if (depositId) {
          await supabase
            .from('escrow_deposits')
            .update({
              statement_line_id: null,
              matched_at: null,
              reconciliation_status: 'pending',
            })
            .eq('id', depositId);
        }

        result = {
          unmatched: true,
          line_id: lineId,
          deposit_id: depositId,
        };

        logger.info('Match removed', { line_id: lineId, deposit_id: depositId });
        break;
      }

      case 'exclude': {
        const excludeBody = body as ExcludeRequest;

        if (!excludeBody.line_id) {
          throw new ValidationError('Statement line ID is required');
        }
        if (!excludeBody.exclude_reason) {
          throw new ValidationError('Exclude reason is required');
        }

        // Get line and verify access
        const { data: line, error: lineError } = await supabase
          .from('bank_statement_lines')
          .select('*, statement:bank_statements!inner(org_id)')
          .eq('id', excludeBody.line_id)
          .single();

        if (lineError || !line || line.statement.org_id !== orgId) {
          throw new ValidationError('Statement line not found');
        }

        // Update line
        const { data: updatedLine, error: updateError } = await supabase
          .from('bank_statement_lines')
          .update({
            status: 'excluded',
            exclude_reason: excludeBody.exclude_reason,
          })
          .eq('id', excludeBody.line_id)
          .select()
          .single();

        if (updateError) {
          throw new ValidationError('Failed to exclude line');
        }

        result = { line: updatedLine };

        logger.info('Line excluded', {
          line_id: excludeBody.line_id,
          reason: excludeBody.exclude_reason,
        });
        break;
      }

      case 'reconcile': {
        const reconcileBody = body as ReconcileRequest;

        if (!reconcileBody.statement_id) {
          throw new ValidationError('Statement ID is required');
        }

        // Get statement and verify ownership
        const { data: statement, error: statementError } = await supabase
          .from('bank_statements')
          .select('*, lines:bank_statement_lines(*)')
          .eq('id', reconcileBody.statement_id)
          .eq('org_id', orgId)
          .is('deleted_at', null)
          .single();

        if (statementError || !statement) {
          throw new ValidationError('Statement not found');
        }

        // Check all non-excluded lines are matched
        const unmatchedLines = statement.lines?.filter(
          (l: { status: string }) => l.status === 'unmatched'
        ) || [];

        if (unmatchedLines.length > 0) {
          throw new ValidationError(
            `Cannot reconcile: ${unmatchedLines.length} unmatched lines remain`
          );
        }

        // Calculate reconciled balance
        const reconciledBalance = reconcileBody.reconciled_balance ?? statement.ending_balance;

        // Update statement
        const { data: updatedStatement, error: updateError } = await supabase
          .from('bank_statements')
          .update({
            reconciliation_status: 'completed',
            reconciled_at: new Date().toISOString(),
            reconciled_by: user.id,
            reconciled_balance: reconciledBalance,
            notes: reconcileBody.notes || statement.notes,
          })
          .eq('id', reconcileBody.statement_id)
          .select()
          .single();

        if (updateError) {
          throw new ValidationError('Failed to reconcile statement');
        }

        result = {
          statement: updatedStatement,
          reconciled: true,
        };

        logger.info('Statement reconciled', {
          statement_id: reconcileBody.statement_id,
          reconciled_balance: reconciledBalance,
        });
        break;
      }

      default:
        throw new ValidationError(`Unknown action: ${body.action}`);
    }

    logger.logResponse(200);

    return new Response(
      JSON.stringify({
        success: true,
        action: body.action,
        data: result,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    logger.error('Deposit verify error', { error });
    return createErrorResponse(error, corsHeaders);
  }
});
