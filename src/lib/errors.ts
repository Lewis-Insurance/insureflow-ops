/**
 * Error handling utilities for consistent error messaging across the app
 */

export function asMessage(err: unknown, fallback = 'Unexpected error'): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return fallback;
}

/**
 * Handle Supabase PGRST errors specifically
 */
export function handleSupabaseError(error: unknown): { message: string; shouldThrow: boolean } {
  if (!error) return { message: '', shouldThrow: false };
  
  // PGRST116 = No rows found, not really an error
  if (error && typeof error === 'object' && 'code' in error && error.code === 'PGRST116') {
    return { message: '', shouldThrow: false };
  }
  
  return { 
    message: asMessage(error, 'Database operation failed'), 
    shouldThrow: true 
  };
}

/**
 * Standard error response for API calls
 */
export interface ErrorResult {
  success: false;
  error: string;
}

export interface SuccessResult<T = unknown> {
  success: true;
  data: T;
}

export type ApiResult<T = unknown> = SuccessResult<T> | ErrorResult;