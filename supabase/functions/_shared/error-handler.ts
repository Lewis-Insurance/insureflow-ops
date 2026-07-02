/**
 * Edge Function Error Handler
 *
 * Provides standardized error handling and response formatting
 * for all Supabase Edge Functions.
 */

import { createLogger } from './logger.ts';

// Standard error types
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR'
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public details?: Record<string, string>) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter?: number) {
    super('Too many requests', 429, 'RATE_LIMITED');
    this.name = 'RateLimitError';
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message?: string) {
    super(message || `${service} service unavailable`, 502, 'EXTERNAL_SERVICE_ERROR');
    this.name = 'ExternalServiceError';
  }
}

/**
 * Standard error response format
 */
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  error: Error | AppError,
  requestId?: string
): Response {
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let details: unknown = undefined;

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
    if (error instanceof ValidationError) {
      details = error.details;
    }
  } else if (error.message.includes('JWT')) {
    statusCode = 401;
    code = 'UNAUTHORIZED';
    message = 'Invalid or expired token';
  } else if (error.message.includes('not found')) {
    statusCode = 404;
    code = 'NOT_FOUND';
    message = error.message;
  } else if (error.message) {
    message = error.message;
  }

  const body: ErrorResponse = {
    error: {
      code,
      message,
      ...(details && { details }),
    },
    ...(requestId && { requestId }),
  };

  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...(requestId && { 'X-Request-Id': requestId }),
    },
  });
}

/**
 * Wrap an edge function handler with error handling
 */
export function withErrorHandling(
  functionName: string,
  handler: (req: Request) => Promise<Response>
) {
  const logger = createLogger(functionName);

  return async (req: Request): Promise<Response> => {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    // Set request context for logging
    logger.setContext({ requestId });
    logger.logRequest(req);

    try {
      const response = await handler(req);

      // Add request ID to response headers
      const headers = new Headers(response.headers);
      headers.set('X-Request-Id', requestId);

      logger.logResponse(response.status, startTime);

      return new Response(response.body, {
        status: response.status,
        headers,
      });
    } catch (error) {
      // Log the error
      logger.error(
        'Request failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          duration_ms: Date.now() - startTime,
        }
      );

      // Create and return error response
      return createErrorResponse(
        error instanceof Error ? error : new Error(String(error)),
        requestId
      );
    }
  };
}

/**
 * Validate request body against a schema
 */
export async function validateRequestBody<T>(
  req: Request,
  validator: (body: unknown) => { valid: boolean; errors?: Record<string, string> }
): Promise<T> {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    throw new ValidationError('Invalid JSON body');
  }

  const result = validator(body);

  if (!result.valid) {
    throw new ValidationError('Request validation failed', result.errors);
  }

  return body as T;
}

/**
 * Require authentication and return user
 */
export async function requireAuth(
  req: Request,
  supabaseClient: any
): Promise<{ id: string; email?: string }> {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError('Missing or invalid Authorization header');
  }

  const token = authHeader.split(' ')[1];

  const { data: { user }, error } = await supabaseClient.auth.getUser(token);

  if (error || !user) {
    throw new AuthenticationError('Invalid or expired token');
  }

  return { id: user.id, email: user.email };
}

/**
 * Check if user has required role
 */
export async function requireRole(
  userId: string,
  requiredRoles: string[],
  supabaseClient: any
): Promise<void> {
  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('role, is_staff')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    throw new AuthorizationError('Unable to verify user role');
  }

  const hasRole = requiredRoles.includes(profile.role) || profile.is_staff;

  if (!hasRole) {
    throw new AuthorizationError(
      `Required role: ${requiredRoles.join(' or ')}`
    );
  }
}
