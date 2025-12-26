/**
 * Application Logger
 *
 * Environment-aware logging with error tracking integration.
 * - Development: Full console logging with debug output
 * - Production: Warnings and errors only, with error tracking
 */

import { captureException, captureMessage, addBreadcrumb } from './errorTracking';

const isDev = import.meta.env.DEV;
const isProd = import.meta.env.PROD;

export const logger = {
  /**
   * Debug log - only shows in development
   */
  debug: (...args: unknown[]) => {
    if (isDev) {
      console.log('[DEBUG]', ...args);
    }
  },

  /**
   * Info log - only shows in development, adds breadcrumb in production
   */
  info: (...args: unknown[]) => {
    if (isDev) {
      console.info('[INFO]', ...args);
    } else if (isProd) {
      // Add as breadcrumb for error context
      const message = args.map(a => String(a)).join(' ');
      addBreadcrumb({
        category: 'info',
        message,
        level: 'info',
      });
    }
  },

  /**
   * Warning log - shows in all environments
   */
  warn: (...args: unknown[]) => {
    console.warn('[WARN]', ...args);
    if (isProd) {
      const message = args.map(a => String(a)).join(' ');
      captureMessage(message, 'warning');
    }
  },

  /**
   * Error log - shows in all environments, reports to error tracking
   */
  error: (...args: unknown[]) => {
    console.error('[ERROR]', ...args);

    // Extract error object if present
    const errorArg = args.find(arg => arg instanceof Error);
    if (errorArg instanceof Error && isProd) {
      captureException(errorArg, {
        extra: {
          context: args.filter(a => !(a instanceof Error)).map(String),
        },
      });
    } else if (isProd) {
      const message = args.map(a => String(a)).join(' ');
      captureMessage(message, 'error');
    }
  },

  /**
   * Track a user action (breadcrumb)
   */
  track: (action: string, data?: Record<string, unknown>) => {
    if (isDev) {
      console.log('[TRACK]', action, data);
    }
    addBreadcrumb({
      category: 'user-action',
      message: action,
      level: 'info',
      data,
    });
  },

  /**
   * Track page navigation
   */
  page: (pageName: string) => {
    if (isDev) {
      console.log('[PAGE]', pageName);
    }
    addBreadcrumb({
      category: 'navigation',
      message: `Navigated to ${pageName}`,
      level: 'info',
    });
  },
};

export default logger;
