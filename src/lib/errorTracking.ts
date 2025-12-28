/**
 * Error Tracking Service
 *
 * Production-ready error tracking with Sentry integration.
 *
 * Setup:
 * 1. @sentry/react is installed
 * 2. Set VITE_SENTRY_DSN in environment variables (Netlify)
 * 3. Call initErrorTracking() in main.tsx before rendering
 */

import * as Sentry from '@sentry/react';

interface ErrorContext {
  userId?: string;
  email?: string;
  page?: string;
  component?: string;
  action?: string;
  extra?: Record<string, unknown>;
}

interface BreadcrumbData {
  category: string;
  message: string;
  level?: 'info' | 'warning' | 'error';
  data?: Record<string, unknown>;
}

// Check if running in production
const isProduction = import.meta.env.PROD;

// Track initialization state
let isInitialized = false;
let sentryEnabled = false;

/**
 * Check if Sentry is enabled
 */
export function isSentryEnabled(): boolean {
  return sentryEnabled;
}

/**
 * Initialize error tracking service
 * Call this in main.tsx before rendering the app
 */
export function initErrorTracking(): void {
  if (isInitialized) return;

  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (dsn) {
    try {
      Sentry.init({
        dsn,
        environment: import.meta.env.MODE || 'production',
        release: import.meta.env.VITE_APP_VERSION || '2.0.0',
        // Performance Monitoring
        tracesSampleRate: isProduction ? 0.1 : 1.0, // 10% in prod, 100% in dev
        // Session Replay
        replaysSessionSampleRate: 0.1, // 10% of sessions
        replaysOnErrorSampleRate: 1.0, // 100% when errors occur
        integrations: [
          Sentry.browserTracingIntegration(),
          Sentry.replayIntegration({
            maskAllText: true,
            blockAllMedia: true,
          }),
        ],
        // Filter out noisy errors
        ignoreErrors: [
          'ResizeObserver loop limit exceeded',
          'ResizeObserver loop completed with undelivered notifications',
          'Non-Error promise rejection captured',
          /Network request failed/i,
          /Load failed/i,
          /Failed to fetch/i,
          /AbortError/i,
          /ChunkLoadError/i,
        ],
        // Don't send errors from localhost in production mode
        beforeSend(event) {
          if (window.location.hostname === 'localhost' && isProduction) {
            return null;
          }
          return event;
        },
      });
      sentryEnabled = true;
      console.info('[ErrorTracking] Sentry initialized successfully');
    } catch (err) {
      console.warn('[ErrorTracking] Failed to initialize Sentry:', err);
    }
  } else if (!isProduction) {
    console.info('[ErrorTracking] Running in development mode - errors logged to console');
  } else {
    console.warn('[ErrorTracking] No VITE_SENTRY_DSN configured - errors logged to console only');
  }

  // Set up global error handlers (always, as fallback)
  window.addEventListener('error', (event) => {
    captureException(event.error || new Error(event.message), {
      extra: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    captureException(
      event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
      { extra: { type: 'unhandledrejection' } }
    );
  });

  isInitialized = true;
}

/**
 * Set user context for error reports
 */
export function setUser(user: { id: string; email?: string; name?: string } | null): void {
  if (!user) {
    if (sentryEnabled) {
      Sentry.setUser(null);
    }
    return;
  }

  if (sentryEnabled) {
    Sentry.setUser({
      id: user.id,
      email: user.email,
      username: user.name,
    });
  }

  if (!isProduction) {
    console.debug('[ErrorTracking] User context set:', user.id);
  }
}

/**
 * Capture an exception with optional context
 */
export function captureException(error: Error, context?: ErrorContext): void {
  const errorData = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...context,
    timestamp: new Date().toISOString(),
  };

  if (sentryEnabled) {
    Sentry.captureException(error, {
      extra: context?.extra,
      tags: {
        page: context?.page,
        component: context?.component,
        action: context?.action,
      },
    });
  } else if (isProduction) {
    // Fallback: Log structured error to console for log aggregation
    console.error('[ERROR]', JSON.stringify(errorData));
  } else {
    // Development: detailed console logging
    console.error('[ErrorTracking] Exception captured:', error);
    if (context) {
      console.error('[ErrorTracking] Context:', context);
    }
  }
}

/**
 * Capture a message (non-error event)
 */
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  if (sentryEnabled) {
    Sentry.captureMessage(message, level);
  } else if (isProduction) {
    console.log(`[${level.toUpperCase()}]`, message);
  } else {
    console.log(`[ErrorTracking] ${level}:`, message);
  }
}

/**
 * Add a breadcrumb for debugging context
 */
export function addBreadcrumb(data: BreadcrumbData): void {
  if (sentryEnabled) {
    Sentry.addBreadcrumb({
      category: data.category,
      message: data.message,
      level: data.level || 'info',
      data: data.data,
    });
  }

  if (!isProduction) {
    console.debug(`[Breadcrumb] ${data.category}: ${data.message}`, data.data);
  }
}

/**
 * Start a performance transaction
 */
export function startTransaction(name: string, op: string): { finish: () => void } {
  const startTime = performance.now();

  // Note: Sentry v8 uses startSpan instead of startTransaction
  // For now, we use manual timing with breadcrumbs
  addBreadcrumb({
    category: 'performance',
    message: `Started: ${op}/${name}`,
    level: 'info',
  });

  return {
    finish: () => {
      const duration = performance.now() - startTime;

      addBreadcrumb({
        category: 'performance',
        message: `Finished: ${op}/${name}`,
        level: 'info',
        data: { duration_ms: duration },
      });

      if (!isProduction) {
        console.debug(`[Performance] ${op}/${name}: ${duration.toFixed(2)}ms`);
      } else if (duration > 3000) {
        // Log slow operations even in production
        console.warn(`[PERF] Slow operation: ${op}/${name} took ${duration.toFixed(0)}ms`);
      }
    },
  };
}

/**
 * Wrapper for async operations with error tracking
 */
export async function withErrorTracking<T>(
  operation: () => Promise<T>,
  context: ErrorContext
): Promise<T> {
  const transaction = startTransaction(context.action || 'unknown', 'async');

  try {
    const result = await operation();
    transaction.finish();
    return result;
  } catch (error) {
    transaction.finish();
    captureException(error instanceof Error ? error : new Error(String(error)), context);
    throw error;
  }
}

/**
 * React Error Boundary integration helper
 * Use this as the onError prop for ErrorBoundary component
 */
export function handleBoundaryError(error: Error, errorInfo: React.ErrorInfo, level: string = 'component'): void {
  captureException(error, {
    component: 'ErrorBoundary',
    extra: {
      componentStack: errorInfo.componentStack,
      level,
    },
  });
}

/**
 * Get Sentry React ErrorBoundary component
 * Use this to wrap components that need error boundary with Sentry integration
 */
export const SentryErrorBoundary = Sentry.ErrorBoundary;

/**
 * Profiler component for performance monitoring
 * Wrap routes or heavy components with this
 */
export const SentryProfiler = Sentry.withProfiler;
