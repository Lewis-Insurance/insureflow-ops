/**
 * Enhanced error message utility to replace asMessage from lib/errors
 * Safely extracts error messages from unknown error types
 */

export function asMessage(error: unknown, fallback = 'An unexpected error occurred'): string {
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  if (error && typeof error === 'object') {
    // Handle Supabase error format
    if ('message' in error && typeof error.message === 'string') {
      return error.message;
    }
    
    // Handle error with details
    if ('details' in error && typeof error.details === 'string') {
      return error.details;
    }
    
    // Handle error with error property
    if ('error' in error && typeof error.error === 'string') {
      return error.error;
    }
    
    // Handle nested error objects
    if ('error' in error && error.error && typeof error.error === 'object' && 'message' in error.error) {
      return String((error.error as any).message);
    }
  }
  
  return fallback;
}

/**
 * Type guard to check if an error has a message property
 */
export function hasErrorMessage(error: unknown): error is { message: string } {
  return error != null && 
         typeof error === 'object' && 
         'message' in error && 
         typeof error.message === 'string';
}

/**
 * Creates a standardized error object with proper typing
 */
export function createError(message: string, code?: string, details?: string): Error {
  const error = new Error(message);
  if (code) {
    (error as any).code = code;
  }
  if (details) {
    (error as any).details = details;
  }
  return error;
}

/**
 * Handles Supabase-specific error formatting
 */
export function handleSupabaseError(error: unknown): { 
  shouldThrow: boolean; 
  message: string; 
  code?: string 
} {
  if (!error) {
    return { shouldThrow: false, message: '' };
  }

  const message = asMessage(error);
  const code = error && typeof error === 'object' && 'code' in error 
    ? String(error.code) 
    : undefined;

  return {
    shouldThrow: true,
    message,
    code
  };
}