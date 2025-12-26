/**
 * Development-only Logger
 *
 * Prevents debug logs from appearing in production builds.
 * Use this instead of console.log for development debugging.
 */

const isDev = import.meta.env.DEV;

export const logger = {
  /**
   * Debug log - only shows in development
   */
  debug: (...args: unknown[]) => {
    if (isDev) {
      console.log(...args);
    }
  },

  /**
   * Info log - only shows in development
   */
  info: (...args: unknown[]) => {
    if (isDev) {
      console.info(...args);
    }
  },

  /**
   * Warning log - shows in all environments
   */
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },

  /**
   * Error log - shows in all environments
   */
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};

export default logger;
