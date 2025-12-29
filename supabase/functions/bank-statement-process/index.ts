import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import { createLogger } from '../_shared/logger.ts';
import { ValidationError, createErrorResponse } from '../_shared/error-handler.ts';

const logger = createLogger('bank-statement-process');

interface StatementLine {
  line_date: string;
  post_date?: string | null;
  description: string;
  amount: number;
  line_type: 'deposit' | 'withdrawal' | 'fee' | 'interest' | 'transfer' | 'adjustment' | 'other';
  reference?: string | null;
  check_number?: string | null;
}

interface ImportStatementRequest {
  bank_account_id: string;
  statement_date: string;
  period_start: string;
  period_end: string;
  beginning_balance: number;
  ending_balance: number;
  import_source?: 'csv' | 'ofx' | 'qfx' | 'manual' | 'ocr';
  import_file_name?: string;
  lines: StatementLine[];
  notes?: string | null;
}

// Parse CSV content into statement lines
function parseCSV(csvContent: string): StatementLine[] {
  const lines: StatementLine[] = [];
  const rows = csvContent.split('\n').map(row => row.trim()).filter(row => row);

  if (rows.length < 2) {
    throw new ValidationError('CSV must have at least a header row and one data row');
  }

  // Get headers (first row)
  const headers = rows[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));

  // Find column indices
  const dateIdx = headers.findIndex(h => h.includes('date') && !h.includes('post'));
  const postDateIdx = headers.findIndex(h => h.includes('post'));
  const descIdx = headers.findIndex(h => h.includes('desc') || h.includes('memo') || h.includes('payee'));
  const amountIdx = headers.findIndex(h => h === 'amount' || h.includes('amount'));
  const debitIdx = headers.findIndex(h => h.includes('debit') || h.includes('withdrawal'));
  const creditIdx = headers.findIndex(h => h.includes('credit') || h.includes('deposit'));
  const refIdx = headers.findIndex(h => h.includes('ref') || h.includes('confirmation'));
  const checkIdx = headers.findIndex(h => h.includes('check'));
  const typeIdx = headers.findIndex(h => h.includes('type') || h.includes('category'));

  if (dateIdx === -1) {
    throw new ValidationError('CSV must have a date column');
  }
  if (descIdx === -1) {
    throw new ValidationError('CSV must have a description column');
  }
  if (amountIdx === -1 && debitIdx === -1 && creditIdx === -1) {
    throw new ValidationError('CSV must have an amount, debit, or credit column');
  }

  // Parse data rows
  for (let i = 1; i < rows.length; i++) {
    const values = parseCSVRow(rows[i]);
    if (values.length === 0) continue;

    // Get amount
    let amount = 0;
    let lineType: StatementLine['line_type'] = 'other';

    if (amountIdx !== -1) {
      amount = parseAmount(values[amountIdx]);
      lineType = amount >= 0 ? 'deposit' : 'withdrawal';
    } else {
      const debit = debitIdx !== -1 ? parseAmount(values[debitIdx]) : 0;
      const credit = creditIdx !== -1 ? parseAmount(values[creditIdx]) : 0;

      if (debit !== 0) {
        amount = -Math.abs(debit);
        lineType = 'withdrawal';
      } else if (credit !== 0) {
        amount = Math.abs(credit);
        lineType = 'deposit';
      }
    }

    if (amount === 0) continue;

    // Determine line type from description or type column
    const description = values[descIdx]?.replace(/"/g, '').trim() || '';
    const typeValue = typeIdx !== -1 ? values[typeIdx]?.toLowerCase() || '' : '';

    if (typeValue.includes('fee') || description.toLowerCase().includes('fee')) {
      lineType = 'fee';
    } else if (typeValue.includes('interest') || description.toLowerCase().includes('interest')) {
      lineType = 'interest';
    } else if (typeValue.includes('transfer') || description.toLowerCase().includes('transfer') || description.toLowerCase().includes(' xfr ')) {
      lineType = 'transfer';
    }

    lines.push({
      line_date: parseDate(values[dateIdx]),
      post_date: postDateIdx !== -1 ? parseDate(values[postDateIdx]) : null,
      description,
      amount,
      line_type: lineType,
      reference: refIdx !== -1 ? values[refIdx]?.replace(/"/g, '').trim() || null : null,
      check_number: checkIdx !== -1 ? values[checkIdx]?.replace(/"/g, '').trim() || null : null,
    });
  }

  return lines;
}

// Parse a CSV row handling quoted values
function parseCSVRow(row: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);

  return values;
}

// Parse amount string to number
function parseAmount(value: string | undefined): number {
  if (!value) return 0;
  // Remove currency symbols, quotes, and extra spaces
  const cleaned = value.replace(/[$"',\s]/g, '').replace(/\(([^)]+)\)/, '-$1');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// Parse date string to ISO format
function parseDate(value: string | undefined): string {
  if (!value) return new Date().toISOString().split('T')[0];

  const cleaned = value.replace(/"/g, '').trim();

  // Try various date formats
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
    /^(\d{2})\/(\d{2})\/(\d{4})$/, // MM/DD/YYYY
    /^(\d{2})-(\d{2})-(\d{4})$/, // MM-DD-YYYY
    /^(\d{2})\/(\d{2})\/(\d{2})$/, // MM/DD/YY
  ];

  for (const format of formats) {
    const match = cleaned.match(format);
    if (match) {
      if (format === formats[0]) {
        return cleaned;
      } else if (format === formats[1] || format === formats[2]) {
        return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
      } else if (format === formats[3]) {
        const year = parseInt(match[3]) > 50 ? `19${match[3]}` : `20${match[3]}`;
        return `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
      }
    }
  }

  // Fallback: try Date.parse
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return new Date().toISOString().split('T')[0];
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

    // Check content type for CSV upload
    const contentType = req.headers.get('Content-Type') || '';
    let statementData: ImportStatementRequest;

    if (contentType.includes('multipart/form-data')) {
      // Handle file upload
      const formData = await req.formData();
      const file = formData.get('file') as File;
      const bankAccountId = formData.get('bank_account_id') as string;
      const statementDate = formData.get('statement_date') as string;
      const periodStart = formData.get('period_start') as string;
      const periodEnd = formData.get('period_end') as string;
      const beginningBalance = parseFloat(formData.get('beginning_balance') as string);
      const endingBalance = parseFloat(formData.get('ending_balance') as string);

      if (!file) {
        throw new ValidationError('No file uploaded');
      }

      const csvContent = await file.text();
      const lines = parseCSV(csvContent);

      statementData = {
        bank_account_id: bankAccountId,
        statement_date: statementDate,
        period_start: periodStart,
        period_end: periodEnd,
        beginning_balance: beginningBalance,
        ending_balance: endingBalance,
        import_source: 'csv',
        import_file_name: file.name,
        lines,
      };
    } else {
      // Handle JSON request
      statementData = await req.json();
    }

    // Validate required fields
    if (!statementData.bank_account_id) {
      throw new ValidationError('Bank account is required');
    }
    if (!statementData.statement_date) {
      throw new ValidationError('Statement date is required');
    }
    if (!statementData.lines || statementData.lines.length === 0) {
      throw new ValidationError('Statement must have at least one line');
    }

    // Validate bank account belongs to org
    const { data: bankAccount, error: bankError } = await supabase
      .from('bank_accounts')
      .select('id')
      .eq('id', statementData.bank_account_id)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .single();

    if (bankError || !bankAccount) {
      throw new ValidationError('Invalid bank account');
    }

    // Check for duplicate statement
    const { data: existingStatement } = await supabase
      .from('bank_statements')
      .select('id')
      .eq('bank_account_id', statementData.bank_account_id)
      .eq('statement_date', statementData.statement_date)
      .is('deleted_at', null)
      .single();

    if (existingStatement) {
      throw new ValidationError('A statement already exists for this date');
    }

    // Calculate totals from lines
    let totalDeposits = 0;
    let totalWithdrawals = 0;

    for (const line of statementData.lines) {
      if (line.amount >= 0) {
        totalDeposits += line.amount;
      } else {
        totalWithdrawals += Math.abs(line.amount);
      }
    }

    // Create statement
    const { data: statement, error: statementError } = await supabase
      .from('bank_statements')
      .insert({
        org_id: orgId,
        bank_account_id: statementData.bank_account_id,
        statement_date: statementData.statement_date,
        period_start: statementData.period_start || statementData.statement_date,
        period_end: statementData.period_end || statementData.statement_date,
        beginning_balance: statementData.beginning_balance || 0,
        ending_balance: statementData.ending_balance || 0,
        total_deposits: totalDeposits,
        total_withdrawals: totalWithdrawals,
        import_source: statementData.import_source || 'csv',
        import_file_name: statementData.import_file_name || null,
        imported_at: new Date().toISOString(),
        imported_by: user.id,
        reconciliation_status: 'pending',
        notes: statementData.notes || null,
      })
      .select()
      .single();

    if (statementError) {
      logger.error('Failed to create statement', { error: statementError });
      throw new ValidationError('Failed to create statement');
    }

    // Insert statement lines
    const lineInserts = statementData.lines.map(line => ({
      statement_id: statement.id,
      line_date: line.line_date,
      post_date: line.post_date || null,
      description: line.description,
      amount: line.amount,
      line_type: line.line_type,
      reference: line.reference || null,
      check_number: line.check_number || null,
      status: 'unmatched',
    }));

    const { data: insertedLines, error: linesError } = await supabase
      .from('bank_statement_lines')
      .insert(lineInserts)
      .select();

    if (linesError) {
      logger.error('Failed to insert statement lines', { error: linesError });
      // Rollback statement
      await supabase.from('bank_statements').delete().eq('id', statement.id);
      throw new ValidationError('Failed to create statement lines');
    }

    // Get suggested matches for deposit lines
    const { data: suggestions } = await supabase
      .rpc('suggest_deposit_matches', { p_statement_id: statement.id });

    logger.info('Bank statement imported successfully', {
      statement_id: statement.id,
      line_count: insertedLines?.length || 0,
      total_deposits: totalDeposits,
      total_withdrawals: totalWithdrawals,
      suggestion_count: suggestions?.length || 0,
    });

    logger.logResponse(200);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          statement,
          lines: insertedLines,
          match_suggestions: suggestions || [],
        },
        summary: {
          line_count: insertedLines?.length || 0,
          total_deposits: totalDeposits,
          total_withdrawals: totalWithdrawals,
          deposit_lines: statementData.lines.filter(l => l.amount >= 0).length,
          withdrawal_lines: statementData.lines.filter(l => l.amount < 0).length,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    logger.error('Bank statement process error', { error });
    return createErrorResponse(error, corsHeaders);
  }
});
