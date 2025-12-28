/**
 * Retention Scoring Edge Function
 *
 * Computes renewal risk scores for policies with upcoming renewals
 * and account-level churn risk scores.
 *
 * Features:
 * - Deterministic scoring with configurable weights
 * - Generates suggested retention tasks for high-risk items
 * - Full auditability with scoring inputs stored
 * - Idempotent - safe to re-run
 *
 * Authentication: Requires X-Cron-Secret header
 *
 * Query Parameters:
 * - agency_workspace_id: UUID (optional) - specific agency to process
 * - days_ahead: number (default 60) - renewal window to analyze
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

interface ModelConfig {
  weights: Record<string, number>;
  thresholds: {
    low: number;
    medium: number;
    high: number;
  };
  windows: {
    renewal_days_ahead: number;
    contact_stale_days: number;
    claim_lookback_months: number;
    payment_lookback_days: number;
  };
}

interface RetentionFactors {
  policy_id: string;
  account_id: string;
  days_to_renewal: number;
  days_since_contact: number;
  claim_count_12mo: number;
  tenure_days: number;
  bundle_count: number;
  payment_issues: number;
  premium: number;
  line_of_business: string;
}

interface ScoringResult {
  score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  top_factors: Array<{
    factor_key: string;
    direction: 'positive' | 'negative';
    weight: number;
    raw_value: number;
    contribution: number;
    explanation: string;
  }>;
}

// ============================================================================
// SCORING ENGINE
// ============================================================================

const logger = createLogger('run-retention-scoring');

/**
 * Compute renewal risk score for a policy
 */
function computePolicyRenewalScore(
  factors: RetentionFactors,
  config: ModelConfig
): ScoringResult {
  const weights = config.weights;
  const contributions: Array<{
    factor_key: string;
    direction: 'positive' | 'negative';
    weight: number;
    raw_value: number;
    contribution: number;
    explanation: string;
  }> = [];

  let totalScore = 0;

  // Days since contact (higher = riskier)
  const contactScore = Math.min(factors.days_since_contact / 180, 1);
  const contactContrib = contactScore * (weights.days_since_contact || 0.15);
  totalScore += contactContrib;
  contributions.push({
    factor_key: 'days_since_contact',
    direction: factors.days_since_contact > 90 ? 'negative' : 'positive',
    weight: weights.days_since_contact || 0.15,
    raw_value: factors.days_since_contact,
    contribution: contactContrib,
    explanation: factors.days_since_contact > 90
      ? `No contact in ${factors.days_since_contact} days`
      : `Recent contact ${factors.days_since_contact} days ago`,
  });

  // Claims (more = riskier due to potential rate increase)
  const claimScore = Math.min(factors.claim_count_12mo / 3, 1);
  const claimContrib = claimScore * (weights.claim_count_12mo || 0.15);
  totalScore += claimContrib;
  if (factors.claim_count_12mo > 0) {
    contributions.push({
      factor_key: 'claim_count_12mo',
      direction: 'negative',
      weight: weights.claim_count_12mo || 0.15,
      raw_value: factors.claim_count_12mo,
      contribution: claimContrib,
      explanation: `${factors.claim_count_12mo} claim(s) in last 12 months`,
    });
  }

  // Payment issues
  const paymentScore = Math.min(factors.payment_issues / 2, 1);
  const paymentContrib = paymentScore * (weights.payment_issues || 0.15);
  totalScore += paymentContrib;
  if (factors.payment_issues > 0) {
    contributions.push({
      factor_key: 'payment_issues',
      direction: 'negative',
      weight: weights.payment_issues || 0.15,
      raw_value: factors.payment_issues,
      contribution: paymentContrib,
      explanation: `${factors.payment_issues} payment issue(s)`,
    });
  }

  // Tenure (longer = more stable, reduces risk)
  const tenureScore = 1 - Math.min(factors.tenure_days / 1095, 1); // 3 years = stable
  const tenureWeight = Math.abs(weights.tenure_days || 0.10);
  const tenureContrib = tenureScore * tenureWeight * -1; // Negative weight = reduces score
  totalScore += tenureContrib;
  contributions.push({
    factor_key: 'tenure_days',
    direction: factors.tenure_days > 365 ? 'positive' : 'negative',
    weight: weights.tenure_days || -0.10,
    raw_value: factors.tenure_days,
    contribution: tenureContrib,
    explanation: factors.tenure_days > 365
      ? `${Math.floor(factors.tenure_days / 365)} year(s) tenure - stable`
      : `New customer (${factors.tenure_days} days)`,
  });

  // Bundle count (more policies = stickier)
  const bundleScore = 1 - Math.min((factors.bundle_count - 1) / 3, 1);
  const bundleWeight = Math.abs(weights.bundle_count || 0.10);
  const bundleContrib = bundleScore * bundleWeight * -1;
  totalScore += bundleContrib;
  if (factors.bundle_count > 1) {
    contributions.push({
      factor_key: 'bundle_count',
      direction: 'positive',
      weight: weights.bundle_count || -0.10,
      raw_value: factors.bundle_count,
      contribution: bundleContrib,
      explanation: `${factors.bundle_count} policies bundled - reduces churn risk`,
    });
  }

  // Days to renewal urgency (closer = more urgent to act)
  const urgencyScore = factors.days_to_renewal <= 14 ? 0.1 : 0;
  totalScore += urgencyScore;
  if (factors.days_to_renewal <= 14) {
    contributions.push({
      factor_key: 'days_to_renewal',
      direction: 'negative',
      weight: 0.1,
      raw_value: factors.days_to_renewal,
      contribution: urgencyScore,
      explanation: `Only ${factors.days_to_renewal} days until renewal - urgent`,
    });
  }

  // Normalize score to 0-1 range
  const normalizedScore = Math.max(0, Math.min(1, totalScore));

  // Determine risk level
  let risk_level: 'low' | 'medium' | 'high' | 'critical';
  if (normalizedScore >= config.thresholds.high) {
    risk_level = 'critical';
  } else if (normalizedScore >= config.thresholds.medium) {
    risk_level = 'high';
  } else if (normalizedScore >= config.thresholds.low) {
    risk_level = 'medium';
  } else {
    risk_level = 'low';
  }

  // Sort factors by contribution (absolute value)
  const top_factors = contributions
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 5);

  return {
    score: Math.round(normalizedScore * 10000) / 10000,
    risk_level,
    top_factors,
  };
}

/**
 * Generate retention task for high-risk policy
 */
function generateRetentionTask(
  factors: RetentionFactors,
  scoring: ScoringResult,
  modelVersion: string
): {
  title: string;
  description: string;
  priority: string;
  due_days: number;
  idempotency_key: string;
} {
  const topFactor = scoring.top_factors[0];

  let title = 'Review renewal';
  let description = `Policy renewal risk: ${scoring.risk_level}`;
  let priority = 'medium';
  let due_days = 7;

  if (topFactor?.factor_key === 'days_since_contact') {
    title = 'Contact customer for renewal review';
    description = `No contact in ${factors.days_since_contact} days. Renewal in ${factors.days_to_renewal} days.`;
  } else if (topFactor?.factor_key === 'claim_count_12mo') {
    title = 'Review claims impact on renewal';
    description = `${factors.claim_count_12mo} claims may affect renewal pricing. Discuss with customer.`;
  } else if (topFactor?.factor_key === 'payment_issues') {
    title = 'Resolve payment issues before renewal';
    description = `Payment issues detected. Ensure billing is current before renewal.`;
    priority = 'high';
    due_days = 3;
  }

  if (scoring.risk_level === 'critical') {
    priority = 'urgent';
    due_days = 2;
  } else if (scoring.risk_level === 'high') {
    priority = 'high';
    due_days = 5;
  }

  return {
    title,
    description,
    priority,
    due_days,
    idempotency_key: `retention_${factors.policy_id}_${modelVersion}_${new Date().toISOString().split('T')[0]}`,
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

    logger.info('Retention scoring job started');

    // Parse parameters
    const url = new URL(req.url);
    const agencyWorkspaceId = url.searchParams.get('agency_workspace_id');
    const daysAhead = parseInt(url.searchParams.get('days_ahead') || '60');
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
        job_type: 'renewal_scoring',
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

    try {
      // Get active model config
      const { data: modelConfigs, error: configError } = await supabase
        .from('retention_model_configs')
        .select('*')
        .eq('enabled', true)
        .order('created_at', { ascending: false })
        .limit(1);

      if (configError || !modelConfigs || modelConfigs.length === 0) {
        throw new ValidationError('No active retention model config found');
      }

      const modelConfig = modelConfigs[0];
      const config = modelConfig.config as ModelConfig;
      const modelName = modelConfig.name;
      const modelVersion = modelConfig.version;

      logger.info('Using model config', { modelName, modelVersion });

      // Get agencies to process
      let agencies: string[] = [];
      if (agencyWorkspaceId) {
        agencies = [agencyWorkspaceId];
      } else {
        const { data: agencyData } = await supabase
          .from('agency_workspaces')
          .select('id');
        agencies = (agencyData || []).map(a => a.id);
      }

      let totalPoliciesScored = 0;
      let totalAccountsScored = 0;
      let totalTasksCreated = 0;
      const errors: string[] = [];

      for (const agencyId of agencies) {
        try {
          // Get upcoming renewals
          const { data: renewals, error: renewalError } = await supabase
            .rpc('get_upcoming_renewals', {
              p_agency_workspace_id: agencyId,
              p_days_ahead: daysAhead,
            });

          if (renewalError) {
            errors.push(`Agency ${agencyId}: ${renewalError.message}`);
            continue;
          }

          if (!renewals || renewals.length === 0) {
            continue;
          }

          logger.info(`Processing ${renewals.length} renewals for agency ${agencyId}`);

          const policyScores: Array<{
            agency_workspace_id: string;
            account_id: string;
            policy_id: string;
            renewal_date: string;
            score: number;
            risk_level: string;
            top_factors: unknown;
            scoring_inputs: unknown;
            model_name: string;
            model_version: string;
            idempotency_key: string;
          }> = [];

          const tasksToCreate: Array<{
            agency_workspace_id: string;
            account_id: string;
            entity_type: string;
            entity_id: string;
            title: string;
            description: string;
            priority: string;
            status: string;
            due_at: string;
            source: string;
            ai_generated: boolean;
            idempotency_key: string;
          }> = [];

          for (const renewal of renewals) {
            // Compute retention factors
            const { data: factors, error: factorError } = await supabase
              .rpc('compute_policy_retention_factors', {
                p_policy_id: renewal.policy_id,
              });

            if (factorError || !factors) {
              logger.warn(`Failed to compute factors for policy ${renewal.policy_id}`);
              continue;
            }

            // Score the policy
            const scoring = computePolicyRenewalScore(factors as RetentionFactors, config);

            const idempotencyKey = `${renewal.policy_id}_${renewal.expiration_date}_${modelVersion}`;

            policyScores.push({
              agency_workspace_id: agencyId,
              account_id: renewal.account_id,
              policy_id: renewal.policy_id,
              renewal_date: renewal.expiration_date,
              score: scoring.score,
              risk_level: scoring.risk_level,
              top_factors: scoring.top_factors,
              scoring_inputs: factors,
              model_name: modelName,
              model_version: modelVersion,
              idempotency_key: idempotencyKey,
            });

            // Generate task for high/critical risk
            if (scoring.risk_level === 'high' || scoring.risk_level === 'critical') {
              const task = generateRetentionTask(
                factors as RetentionFactors,
                scoring,
                modelVersion
              );

              const dueDate = new Date();
              dueDate.setDate(dueDate.getDate() + task.due_days);

              tasksToCreate.push({
                agency_workspace_id: agencyId,
                account_id: renewal.account_id,
                entity_type: 'policy',
                entity_id: renewal.policy_id,
                title: task.title,
                description: task.description,
                priority: task.priority,
                status: 'pending',
                due_at: dueDate.toISOString(),
                source: 'retention_scoring',
                ai_generated: false,
                idempotency_key: task.idempotency_key,
              });
            }
          }

          if (!dryRun && policyScores.length > 0) {
            // Upsert policy scores
            const { error: scoreError } = await supabase
              .from('policy_renewal_risk_scores')
              .upsert(policyScores, {
                onConflict: 'idempotency_key',
                ignoreDuplicates: false,
              });

            if (scoreError) {
              errors.push(`Failed to save scores for agency ${agencyId}: ${scoreError.message}`);
            } else {
              totalPoliciesScored += policyScores.length;
            }

            // Create tasks (ignoring duplicates)
            if (tasksToCreate.length > 0) {
              for (const task of tasksToCreate) {
                const { error: taskError } = await supabase
                  .from('tasks')
                  .insert(task)
                  .select();

                if (!taskError) {
                  totalTasksCreated++;
                } else if (!taskError.message.includes('duplicate')) {
                  logger.warn(`Failed to create task: ${taskError.message}`);
                }
              }
            }
          } else if (dryRun) {
            totalPoliciesScored += policyScores.length;
            totalTasksCreated += tasksToCreate.length;
          }

          // Compute account-level churn scores
          const accountIds = [...new Set(renewals.map(r => r.account_id))];

          for (const accountId of accountIds) {
            const accountPolicyScores = policyScores.filter(s => s.account_id === accountId);
            if (accountPolicyScores.length === 0) continue;

            // Average policy scores with weight by premium
            const avgScore = accountPolicyScores.reduce((sum, s) => sum + s.score, 0) /
              accountPolicyScores.length;

            const maxRiskLevel = accountPolicyScores.reduce((max, s) => {
              const levels = ['low', 'medium', 'high', 'critical'];
              return levels.indexOf(s.risk_level) > levels.indexOf(max) ? s.risk_level : max;
            }, 'low');

            const accountIdempotencyKey = `${accountId}_${new Date().toISOString().split('T')[0]}_${modelVersion}`;

            if (!dryRun) {
              await supabase
                .from('account_churn_risk_scores')
                .upsert({
                  agency_workspace_id: agencyId,
                  account_id: accountId,
                  score: avgScore,
                  risk_level: maxRiskLevel,
                  top_factors: accountPolicyScores.flatMap(s => s.top_factors).slice(0, 5),
                  policy_risk_summary: accountPolicyScores.map(s => ({
                    policy_id: s.policy_id,
                    score: s.score,
                    risk_level: s.risk_level,
                  })),
                  model_name: modelName,
                  model_version: modelVersion,
                  run_date: new Date().toISOString().split('T')[0],
                  idempotency_key: accountIdempotencyKey,
                }, {
                  onConflict: 'idempotency_key',
                  ignoreDuplicates: false,
                });
            }

            totalAccountsScored++;
          }

        } catch (agencyError) {
          const errorMsg = agencyError instanceof Error ? agencyError.message : String(agencyError);
          errors.push(`Agency ${agencyId}: ${errorMsg}`);
          logger.error(`Error processing agency ${agencyId}`, new Error(errorMsg));
        }
      }

      // Update job run
      const stats = {
        policies_scored: totalPoliciesScored,
        accounts_scored: totalAccountsScored,
        tasks_created: totalTasksCreated,
        agencies_processed: agencies.length,
        errors: errors.length,
        dry_run: dryRun,
      };

      if (jobId) {
        await supabase
          .from('analytics_job_runs')
          .update({
            status: errors.length > 0 ? 'completed' : 'completed',
            finished_at: new Date().toISOString(),
            model_name: modelName,
            model_version: modelVersion,
            stats,
            error: errors.length > 0 ? errors.join('; ') : null,
          })
          .eq('id', jobId);
      }

      logger.info('Retention scoring completed', {
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
    logger.error('Retention scoring failed', error instanceof Error ? error : new Error(String(error)));

    return createErrorResponse(
      error instanceof Error ? error : new Error(String(error)),
      requestId
    );
  }
});
