/**
 * Structured Logging Infrastructure for Edge Functions
 *
 * Provides consistent, JSON-formatted logging for production observability.
 * Logs are designed to be consumed by log aggregation services (CloudWatch, Datadog, etc.)
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  function_name?: string;
  request_id?: string;
  user_id?: string;
  duration_ms?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  [key: string]: unknown;
}

// Get environment
const ENVIRONMENT = Deno.env.get('ENVIRONMENT') || 'development';
const IS_PRODUCTION = ENVIRONMENT === 'production';
const LOG_LEVEL = Deno.env.get('LOG_LEVEL') || (IS_PRODUCTION ? 'info' : 'debug');

// Log level hierarchy
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Check if a log level should be output
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[LOG_LEVEL as LogLevel];
}

/**
 * Format a log entry as JSON
 */
function formatLogEntry(entry: LogEntry): string {
  // In production, output compact JSON for log aggregation
  if (IS_PRODUCTION) {
    return JSON.stringify(entry);
  }

  // In development, output pretty-printed JSON
  return JSON.stringify(entry, null, 2);
}

/**
 * Create a logger instance for a specific function
 */
export function createLogger(functionName: string) {
  let requestId: string | undefined;
  let userId: string | undefined;

  return {
    /**
     * Set request context for all subsequent logs
     */
    setContext(context: { requestId?: string; userId?: string }) {
      requestId = context.requestId;
      userId = context.userId;
    },

    /**
     * Log a debug message (development only)
     */
    debug(message: string, meta?: Record<string, unknown>) {
      if (!shouldLog('debug')) return;

      const entry: LogEntry = {
        level: 'debug',
        message,
        timestamp: new Date().toISOString(),
        function_name: functionName,
        request_id: requestId,
        user_id: userId,
        ...meta,
      };

      console.log(formatLogEntry(entry));
    },

    /**
     * Log an info message
     */
    info(message: string, meta?: Record<string, unknown>) {
      if (!shouldLog('info')) return;

      const entry: LogEntry = {
        level: 'info',
        message,
        timestamp: new Date().toISOString(),
        function_name: functionName,
        request_id: requestId,
        user_id: userId,
        ...meta,
      };

      console.log(formatLogEntry(entry));
    },

    /**
     * Log a warning message
     */
    warn(message: string, meta?: Record<string, unknown>) {
      if (!shouldLog('warn')) return;

      const entry: LogEntry = {
        level: 'warn',
        message,
        timestamp: new Date().toISOString(),
        function_name: functionName,
        request_id: requestId,
        user_id: userId,
        ...meta,
      };

      console.warn(formatLogEntry(entry));
    },

    /**
     * Log an error message
     */
    error(message: string, error?: Error, meta?: Record<string, unknown>) {
      if (!shouldLog('error')) return;

      const entry: LogEntry = {
        level: 'error',
        message,
        timestamp: new Date().toISOString(),
        function_name: functionName,
        request_id: requestId,
        user_id: userId,
        ...(error && {
          error: {
            name: error.name,
            message: error.message,
            stack: IS_PRODUCTION ? undefined : error.stack,
          },
        }),
        ...meta,
      };

      console.error(formatLogEntry(entry));
    },

    /**
     * Log request start
     */
    logRequest(req: Request) {
      this.info('Request received', {
        method: req.method,
        url: req.url,
        headers: IS_PRODUCTION
          ? undefined
          : Object.fromEntries(req.headers.entries()),
      });
    },

    /**
     * Log request completion with duration
     */
    logResponse(status: number, startTime: number) {
      const duration_ms = Date.now() - startTime;

      this.info('Request completed', {
        status,
        duration_ms,
      });

      // Warn on slow requests (> 5 seconds)
      if (duration_ms > 5000) {
        this.warn('Slow request detected', { duration_ms });
      }
    },
  };
}

/**
 * Simple logging functions for quick use
 */
export function log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  const output = formatLogEntry(entry);

  switch (level) {
    case 'error':
      console.error(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    default:
      console.log(output);
  }
}
