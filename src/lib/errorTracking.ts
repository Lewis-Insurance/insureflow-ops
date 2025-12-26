/**
 * Error Tracking Service
 *
 * Production-ready error tracking infrastructure.
 * Currently logs to console but designed to easily integrate with Sentry.
 *
 * To enable Sentry:
 * 1. npm install @sentry/react
 * 2. Set VITE_SENTRY_DSN in environment
 * 3. Uncomment Sentry.init() in initErrorTracking()
 */

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

/**
 * Initialize error tracking service
 * Call this in main.tsx before rendering the app
 */
export function initErrorTracking(): void {
  if (isInitialized) return;

  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (dsn && isProduction) {
    // Sentry integration (uncomment when @sentry/react is installed)
    // import * as Sentry from '@sentry/react';
    // Sentry.init({
    //   dsn,
    //   environment: import.meta.env.MODE,
    //   release: import.meta.env.VITE_APP_VERSION || '1.0.0',
    //   tracesSampleRate: 0.1, // 10% of transactions
    //   replaysSessionSampleRate: 0.1,
    //   replaysOnErrorSampleRate: 1.0,
    //   integrations: [
    //     new Sentry.BrowserTracing(),
    //     new Sentry.Replay(),
    //   ],
    // });
    console.info('[ErrorTracking] Sentry DSN configured but @sentry/react not installed');
  } else if (!isProduction) {
    console.info('[ErrorTracking] Running in development mode - errors logged to console');
  }

  // Set up global error handlers
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
    // Clear user context
    // Sentry.setUser(null);
    return;
  }

  // Sentry.setUser({
  //   id: user.id,
  //   email: user.email,
  //   username: user.name,
  // });

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

  if (isProduction) {
    // Sentry.captureException(error, {
    //   extra: context?.extra,
    //   tags: {
    //     page: context?.page,
    //     component: context?.component,
    //     action: context?.action,
    //   },
    // });

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
  if (isProduction) {
    // Sentry.captureMessage(message, level);
    console.log(`[${level.toUpperCase()}]`, message);
  } else {
    console.log(`[ErrorTracking] ${level}:`, message);
  }
}

/**
 * Add a breadcrumb for debugging context
 */
export function addBreadcrumb(data: BreadcrumbData): void {
  // Sentry.addBreadcrumb({
  //   category: data.category,
  //   message: data.message,
  //   level: data.level || 'info',
  //   data: data.data,
  // });

  if (!isProduction) {
    console.debug(`[Breadcrumb] ${data.category}: ${data.message}`, data.data);
  }
}

/**
 * Start a performance transaction
 */
export function startTransaction(name: string, op: string): { finish: () => void } {
  const startTime = performance.now();

  // const transaction = Sentry.startTransaction({ name, op });

  return {
    finish: () => {
      const duration = performance.now() - startTime;
      if (!isProduction) {
        console.debug(`[Performance] ${op}/${name}: ${duration.toFixed(2)}ms`);
      } else {
        // transaction.finish();
        // Log for production monitoring
        if (duration > 3000) {
          console.warn(`[PERF] Slow operation: ${op}/${name} took ${duration.toFixed(0)}ms`);
        }
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
export function handleBoundaryError(error: Error, errorInfo: React.ErrorInfo): void {
  captureException(error, {
    component: 'ErrorBoundary',
    extra: {
      componentStack: errorInfo.componentStack,
    },
  });
}
