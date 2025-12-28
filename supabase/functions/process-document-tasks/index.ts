/**
 * Process Document Tasks Edge Function
 *
 * Processes documents in the queue and generates AI-suggested tasks.
 *
 * Features:
 * - Queue-based processing with retry logic
 * - PII redaction before AI calls
 * - Suggested tasks with confidence scores
 * - Human-in-the-loop approval workflow
 * - Full auditability with evidence
 *
 * Authentication: Requires X-Cron-Secret header
 *
 * Query Parameters:
 * - agency_workspace_id: UUID (optional) - specific agency to process
 * - batch_size: number (default 10) - documents to process per run
 * - dry_run: boolean (default false) - preview without writing
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { createLogger } from '../_shared/logger.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import {
  AppError,
  createErrorResponse,
} from '../_shared/error-handler.ts';

// ============================================================================
// TYPES
// ============================================================================

interface DocumentJob {
  id: string;
  document_id: string | null;
  document_storage_path: string | null;
  account_id: string | null;
  agency_workspace_id: string | null;
  source: string;
  analyzer_version: string;
  doc_fingerprint: string | null;
}

interface ExtractedEntity {
  type: string;
  value: string;
  confidence: number;
  location?: string;
}

interface SuggestedTask {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
  due_days: number;
  confidence: number;
  evidence: string[];
  suggested_assignee_role?: string;
}

interface DocumentInsight {
  summary: string;
  extracted_entities: ExtractedEntity[];
  suggested_tasks: SuggestedTask[];
  raw_evidence: string[];
  missing_context_questions: string[];
}

// ============================================================================
// PII PATTERNS
// ============================================================================

const PII_PATTERNS = [
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN REDACTED]', type: 'ssn' },
  { pattern: /\b\d{9}\b/g, replacement: '[SSN REDACTED]', type: 'ssn' },
  { pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, replacement: '[CARD REDACTED]', type: 'credit_card' },
  { pattern: /\b[A-Z]{1,2}\d{5,8}\b/gi, replacement: '[LICENSE REDACTED]', type: 'drivers_license' },
  { pattern: /\b\d{2}\/\d{2}\/\d{4}\b/g, replacement: '[DATE REDACTED]', type: 'dob' },
  { pattern: /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi, replacement: '[DATE REDACTED]', type: 'dob' },
];

function redactPII(text: string): { redacted: string; redactions: Array<{ type: string; count: number }> } {
  let redacted = text;
  const redactionCounts: Record<string, number> = {};

  for (const { pattern, replacement, type } of PII_PATTERNS) {
    const matches = redacted.match(pattern);
    if (matches) {
      redactionCounts[type] = (redactionCounts[type] || 0) + matches.length;
      redacted = redacted.replace(pattern, replacement);
    }
  }

  return {
    redacted,
    redactions: Object.entries(redactionCounts).map(([type, count]) => ({ type, count })),
  };
}

// ============================================================================
// DOCUMENT ANALYSIS
// ============================================================================

const logger = createLogger('process-document-tasks');

/**
 * Extract document text from storage
 */
async function getDocumentText(
  supabase: ReturnType<typeof createClient>,
  job: DocumentJob
): Promise<string | null> {
  if (!job.document_storage_path) {
    return null;
  }

  try {
    // Get document content from storage
    const { data, error } = await supabase.storage
      .from('documents')
      .download(job.document_storage_path);

    if (error || !data) {
      logger.warn(`Failed to download document: ${error?.message}`);
      return null;
    }

    // For now, just get the text content
    // In production, this would use OCR for images/PDFs
    const text = await data.text();
    return text;
  } catch (err) {
    logger.warn(`Error extracting document text: ${err}`);
    return null;
  }
}

/**
 * Analyze document and generate insights using AI
 */
async function analyzeDocument(
  documentText: string,
  job: DocumentJob
): Promise<DocumentInsight> {
  // Redact PII before AI processing
  const { redacted, redactions } = redactPII(documentText);

  if (redactions.length > 0) {
    logger.info('PII redacted before AI processing', { redactions });
  }

  // For V1, use rule-based extraction without AI
  // In production, this would call an AI service
  return analyzeDocumentRuleBased(redacted, job);
}

/**
 * Rule-based document analysis (no AI required for V1)
 */
function analyzeDocumentRuleBased(text: string, job: DocumentJob): DocumentInsight {
  const entities: ExtractedEntity[] = [];
  const tasks: SuggestedTask[] = [];
  const evidence: string[] = [];
  const questions: string[] = [];

  const lowerText = text.toLowerCase();

  // Extract policy numbers
  const policyMatch = text.match(/policy\s*(?:#|number|no\.?)?\s*[:\s]?\s*([A-Z0-9-]+)/gi);
  if (policyMatch) {
    for (const match of policyMatch) {
      const num = match.replace(/policy\s*(?:#|number|no\.?)?\s*[:\s]?\s*/i, '');
      entities.push({
        type: 'policy_number',
        value: num,
        confidence: 0.85,
      });
      evidence.push(`Found policy number: ${num}`);
    }
  }

  // Extract dates
  const datePatterns = [
    /effective\s*date[:\s]+(\d{1,2}\/\d{1,2}\/\d{2,4})/gi,
    /expiration\s*date[:\s]+(\d{1,2}\/\d{1,2}\/\d{2,4})/gi,
    /renewal\s*date[:\s]+(\d{1,2}\/\d{1,2}\/\d{2,4})/gi,
  ];

  for (const pattern of datePatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      entities.push({
        type: pattern.source.includes('effective') ? 'effective_date' :
          pattern.source.includes('expiration') ? 'expiration_date' : 'renewal_date',
        value: match[1],
        confidence: 0.90,
      });
      evidence.push(`Extracted date: ${match[0]}`);
    }
  }

  // Extract premium amounts
  const premiumMatch = text.match(/(?:premium|total|amount)[:\s]*\$?([\d,]+(?:\.\d{2})?)/gi);
  if (premiumMatch) {
    for (const match of premiumMatch) {
      const amount = match.replace(/(?:premium|total|amount)[:\s]*\$?/i, '');
      entities.push({
        type: 'premium',
        value: amount,
        confidence: 0.80,
      });
      evidence.push(`Found premium amount: $${amount}`);
    }
  }

  // Detect document type and generate tasks
  if (lowerText.includes('declaration') || lowerText.includes('dec page')) {
    tasks.push({
      title: 'Review dec page for accuracy',
      description: 'Review the declaration page to ensure all information is accurate and matches customer records.',
      priority: 'medium',
      category: 'policy_review',
      due_days: 3,
      confidence: 0.85,
      evidence: ['Document appears to be a declaration page'],
      suggested_assignee_role: 'agent',
    });
  }

  if (lowerText.includes('claim') || lowerText.includes('loss notice')) {
    tasks.push({
      title: 'Process claim notification',
      description: 'A claim document was uploaded. Review and initiate claim processing workflow.',
      priority: 'high',
      category: 'claims',
      due_days: 1,
      confidence: 0.90,
      evidence: ['Document contains claim-related content'],
      suggested_assignee_role: 'claims_handler',
    });
  }

  if (lowerText.includes('renewal') || lowerText.includes('expiration')) {
    tasks.push({
      title: 'Review renewal document',
      description: 'Renewal documentation received. Review and prepare renewal proposal for customer.',
      priority: 'medium',
      category: 'renewals',
      due_days: 5,
      confidence: 0.80,
      evidence: ['Document mentions renewal or expiration'],
      suggested_assignee_role: 'agent',
    });
  }

  if (lowerText.includes('quote') || lowerText.includes('proposal')) {
    tasks.push({
      title: 'Process quote/proposal',
      description: 'Quote or proposal document received. Review pricing and prepare comparison for customer.',
      priority: 'medium',
      category: 'quotes',
      due_days: 2,
      confidence: 0.85,
      evidence: ['Document appears to be a quote or proposal'],
      suggested_assignee_role: 'agent',
    });
  }

  if (lowerText.includes('endorsement') || lowerText.includes('change request')) {
    tasks.push({
      title: 'Process policy change request',
      description: 'Policy change or endorsement request received. Process and update policy records.',
      priority: 'high',
      category: 'endorsements',
      due_days: 2,
      confidence: 0.85,
      evidence: ['Document mentions endorsement or change request'],
      suggested_assignee_role: 'agent',
    });
  }

  if (lowerText.includes('certificate') || lowerText.includes('coi')) {
    tasks.push({
      title: 'Verify COI request',
      description: 'Certificate of Insurance request detected. Verify holder information and issue COI.',
      priority: 'medium',
      category: 'coi',
      due_days: 1,
      confidence: 0.80,
      evidence: ['Document appears to be related to COI'],
      suggested_assignee_role: 'csr',
    });
  }

  // Add context questions if needed
  if (tasks.length === 0) {
    questions.push('What type of document is this?');
    questions.push('What action is required for this document?');
  }

  // Generate summary
  const summary = tasks.length > 0
    ? `Document analysis identified ${entities.length} entities and ${tasks.length} potential task(s). ${tasks.map(t => t.category).join(', ')} actions may be needed.`
    : `Document uploaded from ${job.source}. Manual review recommended - unable to automatically identify required actions.`;

  return {
    summary,
    extracted_entities: entities,
    suggested_tasks: tasks,
    raw_evidence: evidence,
    missing_context_questions: questions,
  };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  logger.setContext({ requestId });

  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  try {
    // Verify cron secret
    const cronError = verifyCronSecret(req);
    if (cronError) return cronError;

    logger.info('Document task processing job started');

    // Parse parameters
    const url = new URL(req.url);
    const agencyWorkspaceId = url.searchParams.get('agency_workspace_id');
    const batchSize = parseInt(url.searchParams.get('batch_size') || '10');
    const dryRun = url.searchParams.get('dry_run') === 'true';

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new AppError('Supabase configuration missing', 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Create job run record
    const { data: jobRun, error: jobError } = await supabase
      .from('analytics_job_runs')
      .insert({
        agency_workspace_id: agencyWorkspaceId,
        job_type: 'document_analysis',
        status: 'running',
        started_at: new Date().toISOString(),
        triggered_by: dryRun ? 'dry_run' : 'cron',
      })
      .select()
      .single();

    if (jobError) {
      logger.error('Failed to create job run', new Error(jobError.message));
    }

    const jobId = jobRun?.id;
    const analyzerVersion = 'doc_tasks_v1';

    try {
      // Get queued jobs
      let query = supabase
        .from('document_analysis_jobs')
        .select('*')
        .eq('status', 'queued')
        .lt('attempts', 3)
        .order('created_at', { ascending: true })
        .limit(batchSize);

      if (agencyWorkspaceId) {
        query = query.eq('agency_workspace_id', agencyWorkspaceId);
      }

      const { data: jobs, error: jobsError } = await query;

      if (jobsError) {
        throw new AppError(`Failed to fetch jobs: ${jobsError.message}`, 500);
      }

      if (!jobs || jobs.length === 0) {
        logger.info('No documents in queue');

        if (jobId) {
          await supabase
            .from('analytics_job_runs')
            .update({
              status: 'completed',
              finished_at: new Date().toISOString(),
              stats: { documents_processed: 0, tasks_suggested: 0 },
            })
            .eq('id', jobId);
        }

        return new Response(
          JSON.stringify({ success: true, message: 'No documents to process', stats: { documents_processed: 0 } }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      logger.info(`Processing ${jobs.length} documents`);

      let documentsProcessed = 0;
      let tasksSuggested = 0;
      let insightsCreated = 0;
      const errors: string[] = [];

      for (const job of jobs as DocumentJob[]) {
        try {
          // Mark job as running
          if (!dryRun) {
            await supabase
              .from('document_analysis_jobs')
              .update({
                status: 'running',
                started_at: new Date().toISOString(),
                attempts: (job as any).attempts + 1,
              })
              .eq('id', job.id);
          }

          // Get document text
          const documentText = await getDocumentText(supabase, job);

          if (!documentText) {
            // Skip if no text could be extracted
            logger.warn(`No text extracted for job ${job.id}`);

            if (!dryRun) {
              await supabase
                .from('document_analysis_jobs')
                .update({
                  status: 'skipped',
                  finished_at: new Date().toISOString(),
                  error: 'No text could be extracted from document',
                })
                .eq('id', job.id);
            }
            continue;
          }

          // Analyze document
          const insight = await analyzeDocument(documentText, job);

          // Create insight record
          const docFingerprint = job.doc_fingerprint || crypto.randomUUID();
          const idempotencyKey = `${docFingerprint}_${analyzerVersion}`;

          if (!dryRun) {
            const { error: insightError } = await supabase
              .from('document_insights')
              .upsert({
                agency_workspace_id: job.agency_workspace_id,
                account_id: job.account_id,
                document_id: job.document_id,
                job_id: job.id,
                analyzer_version: analyzerVersion,
                summary: insight.summary,
                extracted_entities: insight.extracted_entities,
                suggested_tasks: insight.suggested_tasks,
                raw_evidence: insight.raw_evidence,
                missing_context_questions: insight.missing_context_questions,
                ai_provider: 'rule_based',
                ai_model: 'doc_tasks_v1',
                tokens_used: 0,
                idempotency_key: idempotencyKey,
              }, {
                onConflict: 'idempotency_key',
              });

            if (insightError) {
              logger.warn(`Failed to save insight: ${insightError.message}`);
            } else {
              insightsCreated++;
            }

            // Create suggested tasks (with ai_generated=true for human approval)
            for (const task of insight.suggested_tasks) {
              const taskIdempotencyKey = `doc_task_${job.document_id}_${task.category}_${analyzerVersion}`;

              const { error: taskError } = await supabase
                .from('tasks')
                .insert({
                  agency_workspace_id: job.agency_workspace_id,
                  account_id: job.account_id,
                  entity_type: 'document',
                  entity_id: job.document_id,
                  title: task.title,
                  description: task.description,
                  priority: task.priority,
                  status: 'pending',
                  due_at: new Date(Date.now() + task.due_days * 24 * 60 * 60 * 1000).toISOString(),
                  source: 'document_analysis',
                  ai_generated: true,
                  confidence: task.confidence,
                  evidence: task.evidence,
                  suggested_assignee_role: task.suggested_assignee_role,
                  document_id: job.document_id,
                  idempotency_key: taskIdempotencyKey,
                })
                .select();

              if (!taskError) {
                tasksSuggested++;
              } else if (!taskError.message.includes('duplicate')) {
                logger.warn(`Failed to create task: ${taskError.message}`);
              }
            }

            // Mark job as completed
            await supabase
              .from('document_analysis_jobs')
              .update({
                status: 'completed',
                finished_at: new Date().toISOString(),
                stats: {
                  entities_extracted: insight.extracted_entities.length,
                  tasks_suggested: insight.suggested_tasks.length,
                },
              })
              .eq('id', job.id);
          }

          documentsProcessed++;
          tasksSuggested += insight.suggested_tasks.length;

        } catch (docError) {
          const errorMsg = docError instanceof Error ? docError.message : String(docError);
          errors.push(`Job ${job.id}: ${errorMsg}`);
          logger.error(`Error processing document job ${job.id}`, new Error(errorMsg));

          if (!dryRun) {
            await supabase
              .from('document_analysis_jobs')
              .update({
                status: 'failed',
                finished_at: new Date().toISOString(),
                error: errorMsg,
              })
              .eq('id', job.id);
          }
        }
      }

      // Update job run
      const stats = {
        documents_processed: documentsProcessed,
        tasks_suggested: tasksSuggested,
        insights_created: insightsCreated,
        errors: errors.length,
        dry_run: dryRun,
      };

      if (jobId) {
        await supabase
          .from('analytics_job_runs')
          .update({
            status: errors.length > 0 && documentsProcessed === 0 ? 'failed' : 'completed',
            finished_at: new Date().toISOString(),
            model_name: 'doc_tasks',
            model_version: analyzerVersion,
            stats,
            error: errors.length > 0 ? errors.join('; ') : null,
          })
          .eq('id', jobId);
      }

      logger.info('Document task processing completed', {
        ...stats,
        duration_ms: Date.now() - startTime,
      });

      return new Response(
        JSON.stringify({
          success: true,
          job_id: jobId,
          stats,
          errors: errors.length > 0 ? errors : undefined,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (processingError) {
      // Update job run with error
      if (jobId) {
        await supabase
          .from('analytics_job_runs')
          .update({
            status: 'failed',
            finished_at: new Date().toISOString(),
            error: processingError instanceof Error ? processingError.message : String(processingError),
          })
          .eq('id', jobId);
      }
      throw processingError;
    }

  } catch (error) {
    logger.error('Document task processing failed', error instanceof Error ? error : new Error(String(error)));

    return createErrorResponse(
      error instanceof Error ? error : new Error(String(error)),
      requestId
    );
  }
});
