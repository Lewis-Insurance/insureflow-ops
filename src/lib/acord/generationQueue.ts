// ============================================
// Background PDF Generation Queue
// Handles async PDF generation for multi-form jobs
// ============================================

import { supabase } from '@/integrations/supabase/client';
import type { AcordGenerationJob, JobStatus } from '@/types/acord';

// ============================================
// TYPES
// ============================================

export interface CreateJobInput {
  formIds: string[];
  jobType: 'generate' | 'regenerate' | 'package';
  idempotencyKey?: string;
  priority?: number;
}

export interface JobProgress {
  jobId: string;
  status: JobStatus;
  currentFormIndex: number;
  totalForms: number;
  progressPercent: number;
  currentFormId?: string;
  completedFormIds: string[];
  failedFormIds: string[];
  startedAt?: string;
  estimatedCompletion?: string;
}

export interface JobResult {
  jobId: string;
  success: boolean;
  status: JobStatus;
  resultUrls: string[];
  errors: string[];
  completedAt?: string;
  duration?: number; // milliseconds
}

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  avgProcessingTime: number;
  oldestPendingAge?: number; // seconds
}

// ============================================
// QUEUE CONFIGURATION
// ============================================

const QUEUE_CONFIG = {
  maxConcurrent: 3,
  maxAttempts: 3,
  retryDelayMs: 5000,
  jobTimeoutMs: 60000, // 1 minute per form
  pollingIntervalMs: 2000,
};

// ============================================
// JOB CREATION
// ============================================

/**
 * Create a new PDF generation job
 */
export async function createGenerationJob(input: CreateJobInput): Promise<{
  success: boolean;
  jobId?: string;
  error?: string;
}> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Check for existing job with same idempotency key
    if (input.idempotencyKey) {
      const { data: existing } = await supabase
        .from('acord_generation_jobs')
        .select('id, status')
        .eq('idempotency_key', input.idempotencyKey)
        .single();

      if (existing) {
        return {
          success: true,
          jobId: existing.id,
        };
      }
    }

    // Create the job
    const { data: job, error } = await supabase
      .from('acord_generation_jobs')
      .insert({
        idempotency_key: input.idempotencyKey,
        form_ids: input.formIds,
        job_type: input.jobType,
        requested_by: user.id,
        status: 'queued',
        progress_percent: 0,
        attempt_count: 0,
        max_attempts: QUEUE_CONFIG.maxAttempts,
        result_urls: [],
      })
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      jobId: job.id,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create job',
    };
  }
}

/**
 * Create jobs for multiple form batches
 */
export async function createBatchJobs(
  formIdBatches: string[][],
  jobType: 'generate' | 'regenerate' | 'package'
): Promise<{
  jobIds: string[];
  failedBatches: number;
}> {
  const jobIds: string[] = [];
  let failedBatches = 0;

  for (const formIds of formIdBatches) {
    const result = await createGenerationJob({
      formIds,
      jobType,
    });

    if (result.success && result.jobId) {
      jobIds.push(result.jobId);
    } else {
      failedBatches++;
    }
  }

  return { jobIds, failedBatches };
}

// ============================================
// JOB MONITORING
// ============================================

/**
 * Get current progress of a job
 */
export async function getJobProgress(jobId: string): Promise<JobProgress | null> {
  try {
    const { data: job, error } = await supabase
      .from('acord_generation_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error) throw error;

    const formIds = job.form_ids || [];
    const resultUrls = job.result_urls || [];
    const completedFormIds = resultUrls.length > 0
      ? formIds.slice(0, resultUrls.length)
      : [];

    return {
      jobId: job.id,
      status: job.status,
      currentFormIndex: resultUrls.length,
      totalForms: formIds.length,
      progressPercent: job.progress_percent,
      currentFormId: job.current_form_id,
      completedFormIds,
      failedFormIds: [],
      startedAt: job.started_at,
      estimatedCompletion: estimateCompletion(job),
    };
  } catch (error) {
    console.error('Failed to get job progress:', error);
    return null;
  }
}

/**
 * Subscribe to job progress updates
 */
export function subscribeToJobProgress(
  jobId: string,
  onProgress: (progress: JobProgress) => void
): () => void {
  // Set up real-time subscription
  const channel = supabase
    .channel(`job-${jobId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'acord_generation_jobs',
        filter: `id=eq.${jobId}`,
      },
      async (payload) => {
        const progress = await getJobProgress(jobId);
        if (progress) {
          onProgress(progress);
        }
      }
    )
    .subscribe();

  // Return unsubscribe function
  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Poll for job completion (fallback for non-realtime)
 */
export async function pollJobCompletion(
  jobId: string,
  options: {
    intervalMs?: number;
    timeoutMs?: number;
    onProgress?: (progress: JobProgress) => void;
  } = {}
): Promise<JobResult> {
  const {
    intervalMs = QUEUE_CONFIG.pollingIntervalMs,
    timeoutMs = QUEUE_CONFIG.jobTimeoutMs * 10,
    onProgress,
  } = options;

  const startTime = Date.now();

  return new Promise((resolve) => {
    const poll = async () => {
      const progress = await getJobProgress(jobId);

      if (!progress) {
        resolve({
          jobId,
          success: false,
          status: 'failed',
          resultUrls: [],
          errors: ['Job not found'],
        });
        return;
      }

      if (onProgress) {
        onProgress(progress);
      }

      // Check if complete
      if (progress.status === 'complete') {
        const { data: job } = await supabase
          .from('acord_generation_jobs')
          .select('*')
          .eq('id', jobId)
          .single();

        resolve({
          jobId,
          success: true,
          status: 'complete',
          resultUrls: job?.result_urls || [],
          errors: [],
          completedAt: job?.completed_at,
          duration: job?.started_at
            ? new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()
            : undefined,
        });
        return;
      }

      // Check if failed
      if (progress.status === 'failed' || progress.status === 'cancelled') {
        const { data: job } = await supabase
          .from('acord_generation_jobs')
          .select('*')
          .eq('id', jobId)
          .single();

        resolve({
          jobId,
          success: false,
          status: progress.status,
          resultUrls: job?.result_urls || [],
          errors: job?.error_message ? [job.error_message] : [],
        });
        return;
      }

      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        resolve({
          jobId,
          success: false,
          status: 'failed',
          resultUrls: [],
          errors: ['Job timed out'],
        });
        return;
      }

      // Continue polling
      setTimeout(poll, intervalMs);
    };

    poll();
  });
}

// ============================================
// JOB MANAGEMENT
// ============================================

/**
 * Cancel a pending or processing job
 */
export async function cancelJob(jobId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('acord_generation_jobs')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .in('status', ['queued', 'processing']);

    return !error;
  } catch (error) {
    console.error('Failed to cancel job:', error);
    return false;
  }
}

/**
 * Retry a failed job
 */
export async function retryJob(jobId: string): Promise<boolean> {
  try {
    const { data: job, error: fetchError } = await supabase
      .from('acord_generation_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (fetchError) throw fetchError;

    if (job.attempt_count >= job.max_attempts) {
      throw new Error('Max retry attempts exceeded');
    }

    const { error } = await supabase
      .from('acord_generation_jobs')
      .update({
        status: 'queued',
        attempt_count: job.attempt_count + 1,
        next_attempt_at: new Date(Date.now() + QUEUE_CONFIG.retryDelayMs).toISOString(),
        error_message: null,
      })
      .eq('id', jobId);

    return !error;
  } catch (error) {
    console.error('Failed to retry job:', error);
    return false;
  }
}

/**
 * Get user's recent jobs
 */
export async function getUserJobs(
  options: {
    status?: JobStatus;
    limit?: number;
    offset?: number;
  } = {}
): Promise<AcordGenerationJob[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    let query = supabase
      .from('acord_generation_jobs')
      .select('*')
      .eq('requested_by', user.id)
      .order('created_at', { ascending: false });

    if (options.status) {
      query = query.eq('status', options.status);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    const { data, error } = await query;

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Failed to get user jobs:', error);
    return [];
  }
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<QueueStats> {
  try {
    // Get counts by status
    const { data: counts, error } = await supabase
      .from('acord_generation_jobs')
      .select('status')
      .in('status', ['queued', 'processing', 'complete', 'failed']);

    if (error) throw error;

    const stats: QueueStats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      avgProcessingTime: 0,
    };

    counts?.forEach(row => {
      switch (row.status) {
        case 'queued':
          stats.pending++;
          break;
        case 'processing':
          stats.processing++;
          break;
        case 'complete':
          stats.completed++;
          break;
        case 'failed':
          stats.failed++;
          break;
      }
    });

    // Get average processing time (last 100 completed jobs)
    const { data: completedJobs } = await supabase
      .from('acord_generation_jobs')
      .select('started_at, completed_at')
      .eq('status', 'complete')
      .not('started_at', 'is', null)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(100);

    if (completedJobs && completedJobs.length > 0) {
      const totalTime = completedJobs.reduce((sum, job) => {
        const start = new Date(job.started_at!).getTime();
        const end = new Date(job.completed_at!).getTime();
        return sum + (end - start);
      }, 0);
      stats.avgProcessingTime = Math.round(totalTime / completedJobs.length);
    }

    // Get oldest pending job age
    const { data: oldestPending } = await supabase
      .from('acord_generation_jobs')
      .select('created_at')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(1);

    if (oldestPending && oldestPending.length > 0) {
      stats.oldestPendingAge = Math.round(
        (Date.now() - new Date(oldestPending[0].created_at).getTime()) / 1000
      );
    }

    return stats;
  } catch (error) {
    console.error('Failed to get queue stats:', error);
    return {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      avgProcessingTime: 0,
    };
  }
}

// ============================================
// WORKER FUNCTIONS (For Edge Function use)
// ============================================

/**
 * Claim next job from queue (called by worker)
 */
export async function claimNextJob(workerId: string): Promise<AcordGenerationJob | null> {
  try {
    // Use a transaction to atomically claim a job
    const { data, error } = await supabase.rpc('claim_generation_job', {
      p_worker_id: workerId,
    });

    if (error) throw error;

    return data;
  } catch (error) {
    // Fallback: simple claim without stored procedure
    const { data: job, error: fetchError } = await supabase
      .from('acord_generation_jobs')
      .select('*')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (fetchError || !job) return null;

    const { error: updateError } = await supabase
      .from('acord_generation_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('status', 'queued');

    if (updateError) return null;

    return job;
  }
}

/**
 * Update job progress (called by worker)
 */
export async function updateJobProgress(
  jobId: string,
  progress: {
    currentFormId?: string;
    progressPercent: number;
    resultUrl?: string;
  }
): Promise<boolean> {
  try {
    const updates: any = {
      current_form_id: progress.currentFormId,
      progress_percent: progress.progressPercent,
    };

    // If a result URL is provided, append it
    if (progress.resultUrl) {
      const { data: job } = await supabase
        .from('acord_generation_jobs')
        .select('result_urls')
        .eq('id', jobId)
        .single();

      updates.result_urls = [...(job?.result_urls || []), progress.resultUrl];
    }

    const { error } = await supabase
      .from('acord_generation_jobs')
      .update(updates)
      .eq('id', jobId);

    return !error;
  } catch (error) {
    console.error('Failed to update job progress:', error);
    return false;
  }
}

/**
 * Complete a job (called by worker)
 */
export async function completeJob(
  jobId: string,
  resultUrls: string[]
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('acord_generation_jobs')
      .update({
        status: 'complete',
        progress_percent: 100,
        result_urls: resultUrls,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    return !error;
  } catch (error) {
    console.error('Failed to complete job:', error);
    return false;
  }
}

/**
 * Fail a job (called by worker)
 */
export async function failJob(
  jobId: string,
  errorMessage: string
): Promise<boolean> {
  try {
    const { data: job } = await supabase
      .from('acord_generation_jobs')
      .select('attempt_count, max_attempts')
      .eq('id', jobId)
      .single();

    const shouldRetry = job && job.attempt_count < job.max_attempts;

    const { error } = await supabase
      .from('acord_generation_jobs')
      .update({
        status: shouldRetry ? 'queued' : 'failed',
        error_message: errorMessage,
        attempt_count: (job?.attempt_count || 0) + 1,
        next_attempt_at: shouldRetry
          ? new Date(Date.now() + QUEUE_CONFIG.retryDelayMs).toISOString()
          : null,
        completed_at: shouldRetry ? null : new Date().toISOString(),
      })
      .eq('id', jobId);

    return !error;
  } catch (error) {
    console.error('Failed to fail job:', error);
    return false;
  }
}

// ============================================
// HELPERS
// ============================================

/**
 * Estimate job completion time
 */
function estimateCompletion(job: any): string | undefined {
  if (job.status !== 'processing' || !job.started_at) {
    return undefined;
  }

  const formIds = job.form_ids || [];
  const resultUrls = job.result_urls || [];
  const completedCount = resultUrls.length;
  const remainingCount = formIds.length - completedCount;

  if (completedCount === 0) {
    return undefined;
  }

  const elapsed = Date.now() - new Date(job.started_at).getTime();
  const avgTimePerForm = elapsed / completedCount;
  const estimatedRemaining = avgTimePerForm * remainingCount;

  return new Date(Date.now() + estimatedRemaining).toISOString();
}

// ============================================
// EXPORTS
// ============================================

export {
  createGenerationJob,
  createBatchJobs,
  getJobProgress,
  subscribeToJobProgress,
  pollJobCompletion,
  cancelJob,
  retryJob,
  getUserJobs,
  getQueueStats,
  claimNextJob,
  updateJobProgress,
  completeJob,
  failJob,
  QUEUE_CONFIG,
};
