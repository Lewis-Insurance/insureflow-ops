/**
 * Coverage Gap Detection Edge Function
 *
 * Analyzes customer insurance portfolios to identify cross-sell opportunities.
 *
 * Features:
 * - Deterministic rule-based detection (no AI required)
 * - Configurable gap rules per agency
 * - Opportunity tracking with status workflow
 * - Integrates with task generation for follow-up
 * - Idempotent - safe to re-run
 *
 * Authentication: Requires X-Cron-Secret header
 *
 * Query Parameters:
 * - agency_workspace_id: UUID (optional) - specific agency to process
 * - account_id: UUID (optional) - specific account to analyze
 * - create_tasks: boolean (default false) - auto-create follow-up tasks
 * - dry_run: boolean (default false) - preview without writing
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { createLogger } from '../_shared/logger.ts';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import {
  AppError,
  ValidationError,
  createErrorResponse,
} from '../_shared/error-handler.ts';

// ============================================================================
// TYPES
// ============================================================================

interface InsuranceProfile {
  account_id: string;
  lines_held: string[];
  policy_count: number;
  total_premium: number;
  tenure_days: number;
  max_liability_limit: number;
  has_auto: boolean;
  has_home: boolean;
  has_renters: boolean;
  has_umbrella: boolean;
  has_commercial: boolean;
  has_cyber: boolean;
  has_workers_comp: boolean;
}

interface GapRule {
  id: string;
  rule_key: string;
  name: string;
  description: string | null;
  severity: 'low' | 'medium' | 'high';
  logic: {
    requires?: string[];
    requires_liability_min?: number;
    missing?: string[];
    max_lines?: number;
    eligible_for_bundle?: boolean;
  };
  applies_to_lines: string[];
  recommended_action: string | null;
}

interface DetectedGap {
  rule: GapRule;
  confidence: number;
  rationale: {
    rule_key: string;
    trigger_reason: string;
    current_lines: string[];
    missing_lines: string[];
  };
  recommended_next_step: string;
}

// ============================================================================
// GAP DETECTION ENGINE
// ============================================================================

const logger = createLogger('run-coverage-gap-detection');

/**
 * Check if a profile matches a gap rule
 */
function evaluateRule(profile: InsuranceProfile, rule: GapRule): DetectedGap | null {
  const logic = rule.logic;
  const linesHeld = profile.lines_held.map(l => l.toLowerCase());

  // Check if rule applies
  if (rule.applies_to_lines && rule.applies_to_lines.length > 0) {
    const applies = rule.applies_to_lines.some(line =>
      linesHeld.includes(line.toLowerCase())
    );
    if (!applies) {
      return null;
    }
  }

  // Check requires condition
  if (logic.requires) {
    const hasRequired = logic.requires.some(req =>
      linesHeld.includes(req.toLowerCase())
    );
    if (!hasRequired) {
      return null;
    }
  }

  // Check max_lines condition
  if (logic.max_lines !== undefined) {
    if (profile.policy_count > logic.max_lines) {
      return null;
    }
  }

  // Check liability minimum for umbrella recommendation
  if (logic.requires_liability_min !== undefined) {
    if (profile.max_liability_limit < logic.requires_liability_min) {
      return null;
    }
  }

  // Check missing condition
  if (logic.missing) {
    const hasMissing = logic.missing.some(missing =>
      linesHeld.includes(missing.toLowerCase())
    );
    if (hasMissing) {
      return null; // They already have the line we'd recommend
    }
  }

  // Rule matches - create gap detection
  const missingLines = logic.missing || [];

  return {
    rule,
    confidence: 0.85,
    rationale: {
      rule_key: rule.rule_key,
      trigger_reason: rule.description || `Detected ${rule.name}`,
      current_lines: profile.lines_held,
      missing_lines: missingLines,
    },
    recommended_next_step: rule.recommended_action || `Contact customer about ${missingLines.join(' or ')} coverage`,
  };
}

/**
 * Detect all gaps for an account profile
 */
function detectGaps(profile: InsuranceProfile, rules: GapRule[]): DetectedGap[] {
  const gaps: DetectedGap[] = [];

  for (const rule of rules) {
    const gap = evaluateRule(profile, rule);
    if (gap) {
      gaps.push(gap);
    }
  }

  // Sort by severity
  const severityOrder = { high: 0, medium: 1, low: 2 };
  gaps.sort((a, b) => severityOrder[a.rule.severity] - severityOrder[b.rule.severity]);

  return gaps;
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

    logger.info('Coverage gap detection job started');

    // Parse parameters
    const url = new URL(req.url);
    const agencyWorkspaceId = url.searchParams.get('agency_workspace_id');
    const accountId = url.searchParams.get('account_id');
    const createTasks = url.searchParams.get('create_tasks') === 'true';
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
        job_type: 'coverage_gap_detection',
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
    const detectionVersion = 'v1.0.0';

    try {
      // Get enabled gap rules
      let rulesQuery = supabase
        .from('coverage_gap_rules')
        .select('*')
        .eq('enabled', true);

      if (agencyWorkspaceId) {
        rulesQuery = rulesQuery.or(`agency_workspace_id.is.null,agency_workspace_id.eq.${agencyWorkspaceId}`);
      }

      const { data: rules, error: rulesError } = await rulesQuery;

      if (rulesError) {
        throw new AppError(`Failed to fetch rules: ${rulesError.message}`, 500);
      }

      if (!rules || rules.length === 0) {
        throw new ValidationError('No enabled coverage gap rules found');
      }

      logger.info(`Loaded ${rules.length} gap detection rules`);

      // Get accounts to analyze
      let accountsQuery = supabase
        .from('accounts')
        .select('id, agency_workspace_id, name')
        .eq('deleted_at', null);

      if (agencyWorkspaceId) {
        accountsQuery = accountsQuery.eq('agency_workspace_id', agencyWorkspaceId);
      }

      if (accountId) {
        accountsQuery = accountsQuery.eq('id', accountId);
      }

      // Limit batch size
      accountsQuery = accountsQuery.limit(500);

      const { data: accounts, error: accountsError } = await accountsQuery;

      if (accountsError) {
        throw new AppError(`Failed to fetch accounts: ${accountsError.message}`, 500);
      }

      if (!accounts || accounts.length === 0) {
        logger.info('No accounts to analyze');

        if (jobId) {
          await supabase
            .from('analytics_job_runs')
            .update({
              status: 'completed',
              finished_at: new Date().toISOString(),
              stats: { accounts_analyzed: 0, gaps_detected: 0 },
            })
            .eq('id', jobId);
        }

        return new Response(
          JSON.stringify({ success: true, message: 'No accounts to analyze', stats: { accounts_analyzed: 0 } }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      logger.info(`Analyzing ${accounts.length} accounts`);

      let accountsAnalyzed = 0;
      let gapsDetected = 0;
      let opportunitiesCreated = 0;
      let tasksCreated = 0;
      const errors: string[] = [];

      for (const account of accounts) {
        try {
          // Get insurance profile
          const { data: profile, error: profileError } = await supabase
            .rpc('get_account_insurance_profile', {
              p_account_id: account.id,
            });

          if (profileError || !profile) {
            logger.warn(`Failed to get profile for account ${account.id}`);
            continue;
          }

          // Skip accounts with no policies
          if (profile.policy_count === 0) {
            continue;
          }

          // Detect gaps
          const gaps = detectGaps(profile as InsuranceProfile, rules as GapRule[]);

          for (const gap of gaps) {
            const opportunityKey = `${gap.rule.rule_key}_${account.id}`;
            const idempotencyKey = `${opportunityKey}_${detectionVersion}`;

            if (!dryRun) {
              // Check if opportunity already exists
              const { data: existing } = await supabase
                .from('coverage_gap_opportunities')
                .select('id, status')
                .eq('idempotency_key', idempotencyKey)
                .single();

              if (existing) {
                // Update last_detected_at
                await supabase
                  .from('coverage_gap_opportunities')
                  .update({
                    last_detected_at: new Date().toISOString(),
                  })
                  .eq('id', existing.id);
              } else {
                // Create new opportunity
                const { data: newOpp, error: oppError } = await supabase
                  .from('coverage_gap_opportunities')
                  .insert({
                    agency_workspace_id: account.agency_workspace_id,
                    account_id: account.id,
                    opportunity_key: opportunityKey,
                    rule_id: gap.rule.id,
                    severity: gap.rule.severity,
                    confidence: gap.confidence,
                    rationale: gap.rationale,
                    current_coverage_summary: {
                      lines: profile.lines_held,
                      policy_count: profile.policy_count,
                      total_premium: profile.total_premium,
                    },
                    recommended_next_step: gap.recommended_next_step,
                    status: 'new',
                    detection_version: detectionVersion,
                    idempotency_key: idempotencyKey,
                  })
                  .select()
                  .single();

                if (oppError) {
                  if (!oppError.message.includes('duplicate')) {
                    logger.warn(`Failed to create opportunity: ${oppError.message}`);
                  }
                } else {
                  opportunitiesCreated++;

                  // Optionally create follow-up task
                  if (createTasks && newOpp) {
                    const taskIdempotencyKey = `gap_task_${newOpp.id}`;

                    const { error: taskError } = await supabase
                      .from('tasks')
                      .insert({
                        agency_workspace_id: account.agency_workspace_id,
                        account_id: account.id,
                        entity_type: 'coverage_gap',
                        entity_id: newOpp.id,
                        title: `Cross-sell opportunity: ${gap.rule.name}`,
                        description: gap.recommended_next_step,
                        priority: gap.rule.severity === 'high' ? 'high' : 'medium',
                        status: 'pending',
                        due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                        source: 'coverage_gap_detection',
                        ai_generated: false,
                        confidence: gap.confidence,
                        evidence: [gap.rationale],
                        idempotency_key: taskIdempotencyKey,
                      });

                    if (!taskError) {
                      tasksCreated++;

                      // Update opportunity status
                      await supabase
                        .from('coverage_gap_opportunities')
                        .update({ status: 'suggested_task_created' })
                        .eq('id', newOpp.id);
                    }
                  }
                }
              }
            }

            gapsDetected++;
          }

          accountsAnalyzed++;

        } catch (accountError) {
          const errorMsg = accountError instanceof Error ? accountError.message : String(accountError);
          errors.push(`Account ${account.id}: ${errorMsg}`);
          logger.error(`Error analyzing account ${account.id}`, new Error(errorMsg));
        }
      }

      // Update job run
      const stats = {
        accounts_analyzed: accountsAnalyzed,
        gaps_detected: gapsDetected,
        opportunities_created: opportunitiesCreated,
        tasks_created: tasksCreated,
        rules_evaluated: rules.length,
        errors: errors.length,
        dry_run: dryRun,
      };

      if (jobId) {
        await supabase
          .from('analytics_job_runs')
          .update({
            status: 'completed',
            finished_at: new Date().toISOString(),
            model_name: 'coverage_gap_detection',
            model_version: detectionVersion,
            stats,
            error: errors.length > 0 ? errors.join('; ') : null,
          })
          .eq('id', jobId);
      }

      logger.info('Coverage gap detection completed', {
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
    logger.error('Coverage gap detection failed', error instanceof Error ? error : new Error(String(error)));

    return createErrorResponse(
      error instanceof Error ? error : new Error(String(error)),
      requestId
    );
  }
});
