/**
 * Prism AI Orchestration API Types
 * 
 * Types for interacting with the Prism multi-agent reasoning API
 */

// =============================================================================
// API REQUEST/RESPONSE TYPES
// =============================================================================

export type PrismMode = 'sequential' | 'parallel' | 'debate';
export type PrismDepth = 'insight' | 'synthesis' | 'mastery';

export interface PrismRunRequest {
  prompt: string;
  mode?: PrismMode;
  depth?: PrismDepth;
  webhook_url?: string;
}

export interface PrismRunResponse {
  run_id: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  mode: PrismMode;
  depth: PrismDepth;
  cycles_completed?: number;
  final_output?: string;
  usage?: {
    total_tokens: number;
    estimated_cost: number;
  };
  error?: string;
  created_at?: string;
  completed_at?: string;
}

export interface PrismRunStatus {
  run_id: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  mode: PrismMode;
  depth: PrismDepth;
  cycles_completed: number;
  final_output?: string;
  created_at: string;
  completed_at?: string;
  error?: string;
}

export interface PrismUsageStats {
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  recent_logs: PrismRunLog[];
}

export interface PrismRunLog {
  run_id: string;
  prompt: string;
  mode: PrismMode;
  depth: PrismDepth;
  status: string;
  tokens_used: number;
  cost: number;
  created_at: string;
  completed_at?: string;
}

// =============================================================================
// DATABASE TYPES (for local tracking)
// =============================================================================

export interface PrismRunRecord {
  id: string;
  user_id: string;
  prompt: string;
  mode: PrismMode;
  depth: PrismDepth;
  run_id: string; // Prism API run_id
  status: 'pending' | 'running' | 'complete' | 'failed';
  cycles_completed: number;
  final_output: string | null;
  tokens_used: number | null;
  cost: number | null;
  error_message: string | null;
  is_favorite: boolean;
  created_at: string;
  completed_at: string | null;
}

export interface PrismUserUsage {
  user_id: string;
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  period_start: string;
  period_end: string;
  period_type: 'daily' | 'weekly' | 'monthly';
}

// =============================================================================
// UI STATE TYPES
// =============================================================================

export interface PrismRunState {
  runId: string | null;
  status: 'idle' | 'running' | 'complete' | 'error';
  result: PrismRunResponse | null;
  error: string | null;
  isPolling: boolean;
}

// =============================================================================
// ERROR TYPES
// =============================================================================

export class PrismAPIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = 'PrismAPIError';
  }
}

